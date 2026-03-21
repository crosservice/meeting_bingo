import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

export interface MeetingRow {
  id: string;
  owner_user_id: string;
  name: string;
  scheduled_start_at: Date;
  scheduled_end_at: Date;
  actual_start_at: Date | null;
  actual_end_at: Date | null;
  grace_minutes: number;
  chat_enabled: boolean;
  anonymize_nicknames: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

@Injectable()
export class MeetingsRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<MeetingRow | null> {
    const { rows } = await this.pool.query<MeetingRow>(
      'SELECT * FROM meetings WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return rows[0] ?? null;
  }

  async findByOwner(userId: string): Promise<MeetingRow[]> {
    const { rows } = await this.pool.query<MeetingRow>(
      `SELECT * FROM meetings
       WHERE owner_user_id = $1 AND deleted_at IS NULL
       ORDER BY scheduled_start_at DESC`,
      [userId],
    );
    return rows;
  }

  async findJoinedByUser(userId: string): Promise<MeetingRow[]> {
    const { rows } = await this.pool.query<MeetingRow>(
      `SELECT m.* FROM meetings m
       JOIN meeting_memberships mm ON mm.meeting_id = m.id
       WHERE mm.user_id = $1
         AND mm.access_status = 'active'
         AND mm.deleted_at IS NULL
         AND m.deleted_at IS NULL
       ORDER BY m.scheduled_start_at DESC`,
      [userId],
    );
    return rows;
  }

  async findInProgressForUser(userId: string): Promise<MeetingRow[]> {
    const { rows } = await this.pool.query<MeetingRow>(
      `SELECT m.* FROM meetings m
       JOIN meeting_memberships mm ON mm.meeting_id = m.id
       WHERE mm.user_id = $1
         AND mm.access_status = 'active'
         AND mm.deleted_at IS NULL
         AND m.deleted_at IS NULL
         AND (
           m.status IN ('open', 'in_progress')
           OR (m.status = 'ended' AND m.actual_end_at + (m.grace_minutes || ' minutes')::interval > NOW())
         )
       ORDER BY m.scheduled_start_at DESC`,
      [userId],
    );
    return rows;
  }

  async create(
    ownerUserId: string,
    name: string,
    scheduledStartAt: string,
    scheduledEndAt: string,
    graceMinutes: number,
  ): Promise<MeetingRow> {
    const { rows } = await this.pool.query<MeetingRow>(
      `INSERT INTO meetings (owner_user_id, name, scheduled_start_at, scheduled_end_at, grace_minutes, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       RETURNING *`,
      [ownerUserId, name, scheduledStartAt, scheduledEndAt, graceMinutes],
    );
    return rows[0];
  }

  async update(
    id: string,
    fields: Partial<Pick<MeetingRow, 'name' | 'scheduled_start_at' | 'scheduled_end_at' | 'grace_minutes' | 'status' | 'actual_start_at' | 'actual_end_at'>>,
  ): Promise<MeetingRow | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${idx}`);
        values.push(value instanceof Date ? value.toISOString() : value);
        idx++;
      }
    }

    if (setClauses.length === 0) return this.findById(id);

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await this.pool.query<MeetingRow>(
      `UPDATE meetings SET ${setClauses.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }

  async softDelete(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE meetings SET deleted_at = NOW(), status = 'deleted', updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }
}
