import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database';
import { AuditService } from '../common';
import { WsGateway } from '../websocket';
import { ServerEvents } from '@meeting-bingo/types';
import { BOARD_ROWS, BOARD_COLS, FREE_SQUARE_ROW, FREE_SQUARE_COL } from '@meeting-bingo/config';

interface CellState {
  id: string;
  row_index: number;
  col_index: number;
  phrase_text: string;
  is_free_square: boolean;
  current_count: number;
}

export interface RankingEntry {
  user_id: string;
  nickname: string;
  marks_until_win: number;
  last_relevant_mark_at: string | null;
}

@Injectable()
export class GameplayService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly audit: AuditService,
    private readonly wsGateway: WsGateway,
  ) {}

  async increment(
    gameId: string,
    cellId: string,
    userId: string,
    clientEventId: string,
    requestId: string,
    sessionId: string,
    ipHash: string | null,
  ) {
    return this.applyDelta(gameId, cellId, userId, 1, clientEventId, requestId, sessionId, ipHash);
  }

  async decrement(
    gameId: string,
    cellId: string,
    userId: string,
    clientEventId: string,
    requestId: string,
    sessionId: string,
    ipHash: string | null,
  ) {
    return this.applyDelta(gameId, cellId, userId, -1, clientEventId, requestId, sessionId, ipHash);
  }

  private async applyDelta(
    gameId: string,
    cellId: string,
    userId: string,
    delta: 1 | -1,
    clientEventId: string,
    requestId: string,
    sessionId: string,
    ipHash: string | null,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify game is active
      const { rows: gameRows } = await client.query(
        'SELECT id, status, meeting_id FROM games WHERE id = $1',
        [gameId],
      );
      if (gameRows.length === 0) throw new NotFoundException('Game not found');
      if (gameRows[0].status !== 'active') {
        throw new BadRequestException('Game is not active');
      }

      // Verify cell belongs to user's card
      const { rows: cellRows } = await client.query(
        `SELECT cc.*, gc.user_id as card_user_id, gc.id as card_id
         FROM card_cells cc
         JOIN game_cards gc ON gc.id = cc.game_card_id
         WHERE cc.id = $1 AND gc.game_id = $2`,
        [cellId, gameId],
      );
      if (cellRows.length === 0) throw new NotFoundException('Cell not found');
      if (cellRows[0].card_user_id !== userId) {
        throw new BadRequestException('Cell does not belong to your card');
      }
      if (cellRows[0].is_free_square) {
        throw new BadRequestException('Cannot modify the free square');
      }

      const currentCount = cellRows[0].current_count;
      const cardId = cellRows[0].card_id;

      // Idempotency check
      const { rows: existingEvents } = await client.query(
        'SELECT id FROM phrase_mark_events WHERE game_id = $1 AND client_event_id = $2',
        [gameId, clientEventId],
      );
      if (existingEvents.length > 0) {
        await client.query('ROLLBACK');
        // Return current state without error for idempotent replay
        const cells = await this.getCellsForCard(cardId);
        return { cell: this.findCell(cells, cellId), duplicate: true, winner: null };
      }

      // Compute new count
      const newCount = Math.max(0, currentCount + delta);
      if (newCount === currentCount && delta === -1) {
        await client.query('ROLLBACK');
        throw new BadRequestException('Count is already 0');
      }

      // Insert mark event
      await client.query(
        `INSERT INTO phrase_mark_events
          (game_id, game_card_id, user_id, card_cell_id, delta, resulting_count, client_event_id, request_id, session_id, ip_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [gameId, cardId, userId, cellId, delta, newCount, clientEventId, requestId, sessionId, ipHash],
      );

      // Update cell projection
      await client.query(
        'UPDATE card_cells SET current_count = $1, updated_at = NOW() WHERE id = $2',
        [newCount, cellId],
      );

      // Check for winner if this was an increment that marked a cell (count went from 0 to 1+)
      let winnerDeclared = false;
      if (delta === 1 && currentCount === 0) {
        winnerDeclared = await this.checkAndDeclareWinner(client, gameId, cardId, userId);
      }

      await client.query('COMMIT');

      const meetingId = gameRows[0].meeting_id;
      const cells = await this.getCellsForCard(cardId);
      const updatedCell = this.findCell(cells, cellId);

      // Emit real-time events
      this.wsGateway.emitToUser(userId, ServerEvents.CardUpdated, {
        game_id: gameId,
        cell: updatedCell,
      });

      // Broadcast ranking update to all meeting participants
      try {
        const rankings = await this.computeRankings(gameId);
        this.wsGateway.emitToMeeting(meetingId, ServerEvents.RankingUpdated, {
          game_id: gameId,
          rankings: rankings.map((r, i) => ({ rank: i + 1, ...r })),
        });
      } catch {
        // Rankings emit is best-effort
      }

      if (winnerDeclared) {
        this.wsGateway.emitToMeeting(meetingId, ServerEvents.GameWon, {
          game_id: gameId,
          winner_user_id: userId,
        });
      }

      return {
        cell: updatedCell,
        duplicate: false,
        winner: winnerDeclared ? userId : null,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Check if the given card has a winning pattern.
   * Uses SELECT FOR UPDATE on the game row to prevent race conditions.
   */
  private async checkAndDeclareWinner(
    client: PoolClient,
    gameId: string,
    cardId: string,
    userId: string,
  ): Promise<boolean> {
    // Lock the game row
    const { rows: lockedGame } = await client.query(
      'SELECT id, winner_user_id, ruleset_snapshot_json FROM games WHERE id = $1 FOR UPDATE',
      [gameId],
    );

    if (lockedGame.length === 0) return false;
    if (lockedGame[0].winner_user_id !== null) return false; // Already has a winner

    const ruleset = lockedGame[0].ruleset_snapshot_json as {
      board_rows: number; board_cols: number;
      horizontal_enabled: boolean; vertical_enabled: boolean; diagonal_enabled: boolean;
      free_square_enabled: boolean;
    };

    // Get all cells for this card
    const { rows: cells } = await client.query<CellState>(
      'SELECT id, row_index, col_index, phrase_text, is_free_square, current_count FROM card_cells WHERE game_card_id = $1',
      [cardId],
    );

    // Build a grid of marked states
    const marked: boolean[][] = Array.from({ length: ruleset.board_rows }, () =>
      Array(ruleset.board_cols).fill(false),
    );

    for (const cell of cells) {
      marked[cell.row_index][cell.col_index] = cell.current_count > 0;
    }

    const hasWin = this.checkWinPatterns(marked, ruleset);

    if (hasWin) {
      // Snapshot the winning card
      const winningSnapshot = cells.map((c) => ({
        row_index: c.row_index,
        col_index: c.col_index,
        phrase_text: c.phrase_text,
        is_free_square: c.is_free_square,
        current_count: c.current_count,
      }));

      await client.query(
        `UPDATE games
         SET winner_user_id = $2, winning_card_snapshot_json = $3, status = 'won', ended_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND winner_user_id IS NULL`,
        [gameId, userId, JSON.stringify(winningSnapshot)],
      );

      return true;
    }

    return false;
  }

  private checkWinPatterns(
    marked: boolean[][],
    ruleset: { board_rows: number; board_cols: number; horizontal_enabled: boolean; vertical_enabled: boolean; diagonal_enabled: boolean },
  ): boolean {
    const { board_rows, board_cols } = ruleset;

    // Check rows
    if (ruleset.horizontal_enabled) {
      for (let r = 0; r < board_rows; r++) {
        if (marked[r].every(Boolean)) return true;
      }
    }

    // Check columns
    if (ruleset.vertical_enabled) {
      for (let c = 0; c < board_cols; c++) {
        let allMarked = true;
        for (let r = 0; r < board_rows; r++) {
          if (!marked[r][c]) { allMarked = false; break; }
        }
        if (allMarked) return true;
      }
    }

    // Check diagonals (only for square boards)
    if (ruleset.diagonal_enabled && board_rows === board_cols) {
      // Top-left to bottom-right
      let diag1 = true;
      for (let i = 0; i < board_rows; i++) {
        if (!marked[i][i]) { diag1 = false; break; }
      }
      if (diag1) return true;

      // Top-right to bottom-left
      let diag2 = true;
      for (let i = 0; i < board_rows; i++) {
        if (!marked[i][board_cols - 1 - i]) { diag2 = false; break; }
      }
      if (diag2) return true;
    }

    return false;
  }

  /**
   * Compute rankings for all players in a game.
   * Ranking = minimum number of additional first-marks needed to complete any win pattern.
   * Tie-break: earlier timestamp of the last mark event that established current distance.
   */
  async computeRankings(gameId: string): Promise<RankingEntry[]> {
    // Get game and ruleset
    const { rows: gameRows } = await this.pool.query(
      'SELECT ruleset_snapshot_json FROM games WHERE id = $1',
      [gameId],
    );
    if (gameRows.length === 0) throw new NotFoundException('Game not found');

    const ruleset = gameRows[0].ruleset_snapshot_json as {
      board_rows: number; board_cols: number;
      horizontal_enabled: boolean; vertical_enabled: boolean; diagonal_enabled: boolean;
    };

    // Get all cards with user info
    const { rows: cards } = await this.pool.query(
      `SELECT gc.id as card_id, gc.user_id, u.nickname
       FROM game_cards gc
       JOIN users u ON u.id = gc.user_id
       WHERE gc.game_id = $1`,
      [gameId],
    );

    const rankings: RankingEntry[] = [];

    for (const card of cards) {
      // Get cells
      const { rows: cells } = await this.pool.query<CellState>(
        'SELECT id, row_index, col_index, phrase_text, is_free_square, current_count FROM card_cells WHERE game_card_id = $1',
        [card.card_id],
      );

      const marked: boolean[][] = Array.from({ length: ruleset.board_rows }, () =>
        Array(ruleset.board_cols).fill(false),
      );
      for (const cell of cells) {
        marked[cell.row_index][cell.col_index] = cell.current_count > 0;
      }

      const distance = this.computeMinDistance(marked, ruleset);

      // Get timestamp of the last mark event that established current closest state
      const { rows: lastMark } = await this.pool.query(
        `SELECT occurred_at FROM phrase_mark_events
         WHERE game_card_id = $1 AND delta = 1 AND resulting_count = 1
         ORDER BY occurred_at DESC LIMIT 1`,
        [card.card_id],
      );

      rankings.push({
        user_id: card.user_id,
        nickname: card.nickname,
        marks_until_win: distance,
        last_relevant_mark_at: lastMark.length > 0 ? lastMark[0].occurred_at.toISOString() : null,
      });
    }

    // Sort: ascending by distance, then ascending by last_relevant_mark_at (earlier is better)
    rankings.sort((a, b) => {
      if (a.marks_until_win !== b.marks_until_win) {
        return a.marks_until_win - b.marks_until_win;
      }
      // Tie-break: earlier timestamp ranks higher
      if (a.last_relevant_mark_at && b.last_relevant_mark_at) {
        return a.last_relevant_mark_at.localeCompare(b.last_relevant_mark_at);
      }
      if (a.last_relevant_mark_at) return -1;
      if (b.last_relevant_mark_at) return 1;
      return 0;
    });

    return rankings;
  }

  /**
   * Compute minimum number of unmarked cells needed to complete any enabled win pattern.
   */
  private computeMinDistance(
    marked: boolean[][],
    ruleset: { board_rows: number; board_cols: number; horizontal_enabled: boolean; vertical_enabled: boolean; diagonal_enabled: boolean },
  ): number {
    const { board_rows, board_cols } = ruleset;
    let minDistance = Infinity;

    // Check rows
    if (ruleset.horizontal_enabled) {
      for (let r = 0; r < board_rows; r++) {
        let unmarked = 0;
        for (let c = 0; c < board_cols; c++) {
          if (!marked[r][c]) unmarked++;
        }
        minDistance = Math.min(minDistance, unmarked);
      }
    }

    // Check columns
    if (ruleset.vertical_enabled) {
      for (let c = 0; c < board_cols; c++) {
        let unmarked = 0;
        for (let r = 0; r < board_rows; r++) {
          if (!marked[r][c]) unmarked++;
        }
        minDistance = Math.min(minDistance, unmarked);
      }
    }

    // Check diagonals
    if (ruleset.diagonal_enabled && board_rows === board_cols) {
      let diag1Unmarked = 0;
      let diag2Unmarked = 0;
      for (let i = 0; i < board_rows; i++) {
        if (!marked[i][i]) diag1Unmarked++;
        if (!marked[i][board_cols - 1 - i]) diag2Unmarked++;
      }
      minDistance = Math.min(minDistance, diag1Unmarked, diag2Unmarked);
    }

    return minDistance === Infinity ? board_cols : minDistance;
  }

  private async getCellsForCard(cardId: string): Promise<CellState[]> {
    const { rows } = await this.pool.query<CellState>(
      'SELECT id, row_index, col_index, phrase_text, is_free_square, current_count FROM card_cells WHERE game_card_id = $1 ORDER BY row_index, col_index',
      [cardId],
    );
    return rows;
  }

  private findCell(cells: CellState[], cellId: string) {
    const cell = cells.find((c) => c.id === cellId);
    if (!cell) return null;
    return {
      id: cell.id,
      row_index: cell.row_index,
      col_index: cell.col_index,
      phrase_text: cell.phrase_text,
      is_free_square: cell.is_free_square,
      current_count: cell.current_count,
    };
  }
}
