import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

export interface RulesetRow {
  id: string;
  meeting_id: string;
  name: string;
  board_rows: number;
  board_cols: number;
  free_square_enabled: boolean;
  free_square_label: string;
  horizontal_enabled: boolean;
  vertical_enabled: boolean;
  diagonal_enabled: boolean;
  late_join_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class RulesetsRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<RulesetRow | null> {
    const { rows } = await this.pool.query<RulesetRow>(
      'SELECT * FROM rulesets WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async findByMeeting(meetingId: string): Promise<RulesetRow[]> {
    const { rows } = await this.pool.query<RulesetRow>(
      'SELECT * FROM rulesets WHERE meeting_id = $1 ORDER BY created_at DESC',
      [meetingId],
    );
    return rows;
  }

  async create(meetingId: string, data: Partial<RulesetRow>): Promise<RulesetRow> {
    const { rows } = await this.pool.query<RulesetRow>(
      `INSERT INTO rulesets (meeting_id, name, board_rows, board_cols, free_square_enabled, free_square_label,
         horizontal_enabled, vertical_enabled, diagonal_enabled, late_join_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        meetingId,
        data.name ?? 'Default',
        data.board_rows ?? 5,
        data.board_cols ?? 5,
        data.free_square_enabled ?? true,
        data.free_square_label ?? 'FREE',
        data.horizontal_enabled ?? true,
        data.vertical_enabled ?? true,
        data.diagonal_enabled ?? true,
        data.late_join_enabled ?? true,
      ],
    );
    return rows[0];
  }

  async update(id: string, data: Partial<RulesetRow>): Promise<RulesetRow | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fields = ['name', 'board_rows', 'board_cols', 'free_square_enabled', 'free_square_label',
      'horizontal_enabled', 'vertical_enabled', 'diagonal_enabled', 'late_join_enabled'] as const;

    for (const field of fields) {
      if (data[field] !== undefined) {
        setClauses.push(`${field} = $${idx++}`);
        values.push(data[field]);
      }
    }

    if (setClauses.length === 0) return this.findById(id);
    setClauses.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.pool.query<RulesetRow>(
      `UPDATE rulesets SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }
}
