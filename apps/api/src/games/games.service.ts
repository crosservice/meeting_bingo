import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';
import { GamesRepository, GameRow, CardCellRow } from './games.repository';
import { MeetingsService } from '../meetings';
import { MembershipsService } from '../memberships';
import { PhraseSetsService } from '../phrase-sets';
import { RulesetsService } from '../rulesets';
import { AuditService } from '../common';
import { WsGateway } from '../websocket';
import { ServerEvents } from '@meeting-bingo/types';
import { generateCard } from './card-generator';
import { BOARD_SIZE, MIN_PHRASES_WITH_FREE_SQUARE, MIN_PHRASES_WITHOUT_FREE_SQUARE } from '@meeting-bingo/config';

function toGameResponse(row: GameRow) {
  return {
    id: row.id,
    meeting_id: row.meeting_id,
    created_by_user_id: row.created_by_user_id,
    status: row.status,
    started_at: row.started_at?.toISOString() ?? null,
    ended_at: row.ended_at?.toISOString() ?? null,
    winner_user_id: row.winner_user_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function toCellResponse(row: CardCellRow) {
  return {
    id: row.id,
    row_index: row.row_index,
    col_index: row.col_index,
    phrase_text: row.phrase_text,
    phrase_key: row.phrase_key,
    is_free_square: row.is_free_square,
    current_count: row.current_count,
  };
}

@Injectable()
export class GamesService {
  constructor(
    private readonly repo: GamesRepository,
    private readonly meetingsService: MeetingsService,
    private readonly membershipsService: MembershipsService,
    private readonly phraseSetsService: PhraseSetsService,
    private readonly rulesetsService: RulesetsService,
    private readonly audit: AuditService,
    private readonly wsGateway: WsGateway,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  async create(
    meetingId: string,
    userId: string,
    data: { phrase_set_id: string; ruleset_id: string },
  ) {
    await this.meetingsService.assertOwner(meetingId, userId);

    // Validate phrase set and ruleset belong to this meeting
    const phraseSet = await this.phraseSetsService.getSetById(data.phrase_set_id);
    if (!phraseSet || phraseSet.meeting_id !== meetingId) {
      throw new BadRequestException('Invalid phrase set');
    }

    const ruleset = await this.rulesetsService.getById(data.ruleset_id);
    if (!ruleset || ruleset.meeting_id !== meetingId) {
      throw new BadRequestException('Invalid ruleset');
    }

    // Get active phrases and validate count
    const phrases = await this.phraseSetsService.getActivePhrases(data.phrase_set_id);
    const minRequired = ruleset.free_square_enabled
      ? MIN_PHRASES_WITH_FREE_SQUARE
      : MIN_PHRASES_WITHOUT_FREE_SQUARE;

    if (phrases.length < minRequired) {
      throw new BadRequestException(
        `Need at least ${minRequired} active phrases, but only have ${phrases.length}`,
      );
    }

    // Create snapshots
    const phraseSnapshot = phrases.map((p) => ({ id: p.id, text: p.text }));
    const rulesetSnapshot = {
      board_rows: ruleset.board_rows,
      board_cols: ruleset.board_cols,
      free_square_enabled: ruleset.free_square_enabled,
      free_square_label: ruleset.free_square_label,
      horizontal_enabled: ruleset.horizontal_enabled,
      vertical_enabled: ruleset.vertical_enabled,
      diagonal_enabled: ruleset.diagonal_enabled,
      late_join_enabled: ruleset.late_join_enabled,
    };

    const game = await this.repo.create(meetingId, userId, phraseSnapshot, rulesetSnapshot);
    await this.audit.log(userId, 'game', game.id, 'game.created');
    return toGameResponse(game);
  }

  async start(gameId: string, userId: string) {
    const game = await this.repo.findById(gameId);
    if (!game) throw new NotFoundException('Game not found');
    await this.meetingsService.assertOwner(game.meeting_id, userId);

    if (game.status !== 'draft') {
      throw new BadRequestException('Game can only be started from draft status');
    }

    const phraseSnapshot = game.phrase_set_snapshot_json as { id: string; text: string }[];
    const rulesetSnapshot = game.ruleset_snapshot_json as {
      board_rows: number; board_cols: number;
      free_square_enabled: boolean; free_square_label: string;
    };

    // Get active members
    const { rows: members } = await this.pool.query(
      `SELECT user_id FROM meeting_memberships
       WHERE meeting_id = $1 AND access_status = 'active' AND deleted_at IS NULL`,
      [game.meeting_id],
    );

    if (members.length === 0) {
      throw new BadRequestException('No active participants in the meeting');
    }

    // Generate cards in a transaction
    const client = await this.repo.getClient();
    try {
      await client.query('BEGIN');

      for (const member of members) {
        const card = generateCard(phraseSnapshot, rulesetSnapshot);
        const cardRow = await this.repo.createCard(client, gameId, member.user_id, card.seed);

        const cellsData = card.cells.map((cell) => ({
          ...cell,
          current_count: cell.is_free_square ? 1 : 0,
        }));

        await this.repo.createCells(client, cardRow.id, cellsData);
      }

      // Update game status
      await client.query(
        `UPDATE games SET status = 'active', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [gameId],
      );

      // Update meeting status
      await client.query(
        `UPDATE meetings SET status = 'in_progress', actual_start_at = COALESCE(actual_start_at, NOW()), updated_at = NOW() WHERE id = $1`,
        [game.meeting_id],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await this.audit.log(userId, 'game', gameId, 'game.started', {
      participant_count: members.length,
    });

    const updated = await this.repo.findById(gameId);

    // Emit game.started to all meeting participants
    this.wsGateway.emitToMeeting(game.meeting_id, ServerEvents.GameStarted, {
      game_id: gameId,
      game: updated ? toGameResponse(updated) : null,
    });

    return updated ? toGameResponse(updated) : null;
  }

  async close(gameId: string, userId: string) {
    const game = await this.repo.findById(gameId);
    if (!game) throw new NotFoundException('Game not found');
    await this.meetingsService.assertOwner(game.meeting_id, userId);

    if (!['active', 'won'].includes(game.status)) {
      throw new BadRequestException('Game cannot be closed in its current state');
    }

    const updated = await this.repo.updateStatus(gameId, 'closed', { ended_at: new Date() });
    await this.audit.log(userId, 'game', gameId, 'game.closed');

    this.wsGateway.emitToMeeting(game.meeting_id, ServerEvents.GameUpdated, {
      game_id: gameId,
      game: updated ? toGameResponse(updated) : null,
    });

    return updated ? toGameResponse(updated) : null;
  }

  async getById(gameId: string, userId: string) {
    const game = await this.repo.findById(gameId);
    if (!game) throw new NotFoundException('Game not found');
    return toGameResponse(game);
  }

  async getMyCard(gameId: string, userId: string) {
    const game = await this.repo.findById(gameId);
    if (!game) throw new NotFoundException('Game not found');

    let card = await this.repo.findCardByGameAndUser(gameId, userId);

    // Late join: generate card if game is active and user doesn't have one yet
    if (!card && game.status === 'active') {
      const rulesetSnapshot = game.ruleset_snapshot_json as {
        board_rows: number; board_cols: number;
        free_square_enabled: boolean; free_square_label: string;
        late_join_enabled: boolean;
      };

      if (!rulesetSnapshot.late_join_enabled) {
        throw new BadRequestException('Late join is not enabled for this game');
      }

      // Verify membership
      await this.membershipsService.assertActiveMember(game.meeting_id, userId);

      const phraseSnapshot = game.phrase_set_snapshot_json as { id: string; text: string }[];
      const generated = generateCard(phraseSnapshot, rulesetSnapshot);

      const client = await this.repo.getClient();
      try {
        await client.query('BEGIN');
        card = await this.repo.createCard(client, gameId, userId, generated.seed);
        const cellsData = generated.cells.map((cell) => ({
          ...cell,
          current_count: cell.is_free_square ? 1 : 0,
        }));
        await this.repo.createCells(client, card.id, cellsData);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (!card) throw new NotFoundException('No card found for this game');

    const cells = await this.repo.findCellsByCard(card.id);
    return {
      card_id: card.id,
      game_id: card.game_id,
      seed: card.card_seed,
      cells: cells.map(toCellResponse),
    };
  }

  async listByMeeting(meetingId: string) {
    const games = await this.repo.findByMeeting(meetingId);
    return games.map(toGameResponse);
  }

  async getGameResults(gameId: string) {
    const game = await this.repo.findById(gameId);
    if (!game) throw new NotFoundException('Game not found');

    const response: {
      game: ReturnType<typeof toGameResponse>;
      winner_nickname: string | null;
      winning_card: ReturnType<typeof toCellResponse>[] | null;
    } = {
      game: toGameResponse(game),
      winner_nickname: null,
      winning_card: null,
    };

    if (game.winner_user_id) {
      // Get winner nickname
      const { rows } = await this.pool.query(
        'SELECT nickname FROM users WHERE id = $1',
        [game.winner_user_id],
      );
      response.winner_nickname = rows[0]?.nickname ?? null;

      // Get winning card cells
      const winnerCard = await this.repo.findCardByGameAndUser(gameId, game.winner_user_id);
      if (winnerCard) {
        const cells = await this.repo.findCellsByCard(winnerCard.id);
        response.winning_card = cells.map(toCellResponse);
      }
    }

    return response;
  }

  async findActiveByMeeting(meetingId: string) {
    return this.repo.findActiveByMeeting(meetingId);
  }

  async getGameById(gameId: string) {
    return this.repo.findById(gameId);
  }
}
