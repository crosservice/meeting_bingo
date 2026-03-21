import { Injectable, Inject } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database';

export interface GameRow {
  id: string;
  meeting_id: string;
  created_by_user_id: string;
  phrase_set_snapshot_json: unknown;
  ruleset_snapshot_json: unknown;
  status: string;
  started_at: Date | null;
  ended_at: Date | null;
  winner_user_id: string | null;
  winning_card_snapshot_json: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface GameCardRow {
  id: string;
  game_id: string;
  user_id: string;
  card_seed: string;
  generated_at: Date;
  updated_at: Date;
}

export interface CardCellRow {
  id: string;
  game_card_id: string;
  row_index: number;
  col_index: number;
  phrase_text: string;
  phrase_key: string;
  is_free_square: boolean;
  current_count: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class GamesRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<GameRow | null> {
    const { rows } = await this.pool.query<GameRow>(
      'SELECT * FROM games WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async findByMeeting(meetingId: string): Promise<GameRow[]> {
    const { rows } = await this.pool.query<GameRow>(
      'SELECT * FROM games WHERE meeting_id = $1 ORDER BY created_at DESC',
      [meetingId],
    );
    return rows;
  }

  async findActiveByMeeting(meetingId: string): Promise<GameRow | null> {
    const { rows } = await this.pool.query<GameRow>(
      `SELECT * FROM games WHERE meeting_id = $1 AND status = 'active' LIMIT 1`,
      [meetingId],
    );
    return rows[0] ?? null;
  }

  async create(
    meetingId: string,
    userId: string,
    phraseSnapshot: unknown,
    rulesetSnapshot: unknown,
  ): Promise<GameRow> {
    const { rows } = await this.pool.query<GameRow>(
      `INSERT INTO games (meeting_id, created_by_user_id, phrase_set_snapshot_json, ruleset_snapshot_json, status)
       VALUES ($1, $2, $3, $4, 'draft') RETURNING *`,
      [meetingId, userId, JSON.stringify(phraseSnapshot), JSON.stringify(rulesetSnapshot)],
    );
    return rows[0];
  }

  async updateStatus(id: string, status: string, extra?: Record<string, unknown>): Promise<GameRow | null> {
    const setClauses = ['status = $2', 'updated_at = NOW()'];
    const values: unknown[] = [id, status];
    let idx = 3;

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(value instanceof Date ? value.toISOString() : value);
      }
    }

    const { rows } = await this.pool.query<GameRow>(
      `UPDATE games SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }

  // Card operations
  async createCard(client: PoolClient, gameId: string, userId: string, seed: string): Promise<GameCardRow> {
    const { rows } = await client.query<GameCardRow>(
      `INSERT INTO game_cards (game_id, user_id, card_seed) VALUES ($1, $2, $3) RETURNING *`,
      [gameId, userId, seed],
    );
    return rows[0];
  }

  async createCells(
    client: PoolClient,
    cardId: string,
    cells: { row_index: number; col_index: number; phrase_text: string; phrase_key: string; is_free_square: boolean; current_count: number }[],
  ): Promise<void> {
    if (cells.length === 0) return;
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const cell of cells) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(cardId, cell.row_index, cell.col_index, cell.phrase_text, cell.phrase_key, cell.is_free_square, cell.current_count);
    }

    await client.query(
      `INSERT INTO card_cells (game_card_id, row_index, col_index, phrase_text, phrase_key, is_free_square, current_count)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  async findCardByGameAndUser(gameId: string, userId: string): Promise<GameCardRow | null> {
    const { rows } = await this.pool.query<GameCardRow>(
      'SELECT * FROM game_cards WHERE game_id = $1 AND user_id = $2',
      [gameId, userId],
    );
    return rows[0] ?? null;
  }

  async findCellsByCard(cardId: string): Promise<CardCellRow[]> {
    const { rows } = await this.pool.query<CardCellRow>(
      'SELECT * FROM card_cells WHERE game_card_id = $1 ORDER BY row_index, col_index',
      [cardId],
    );
    return rows;
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }
}
