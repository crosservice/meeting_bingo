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

  async findAllForUserEnriched(userId: string) {
    // All meetings user is a member of, with owner nickname and latest game winner
    const { rows } = await this.pool.query(
      `SELECT m.*,
              owner.nickname AS owner_nickname,
              mm.role AS user_role,
              (SELECT count(*) FROM games g WHERE g.meeting_id = m.id AND g.status IN ('won', 'closed')) AS game_count,
              (SELECT g.winner_user_id FROM games g WHERE g.meeting_id = m.id AND g.status = 'won' ORDER BY g.ended_at DESC LIMIT 1) AS last_winner_user_id,
              (SELECT u2.nickname FROM games g JOIN users u2 ON u2.id = g.winner_user_id WHERE g.meeting_id = m.id AND g.status = 'won' ORDER BY g.ended_at DESC LIMIT 1) AS last_winner_nickname
       FROM meetings m
       JOIN meeting_memberships mm ON mm.meeting_id = m.id AND mm.user_id = $1 AND mm.deleted_at IS NULL
       JOIN users owner ON owner.id = m.owner_user_id
       WHERE m.deleted_at IS NULL
       ORDER BY
         CASE WHEN m.status IN ('open', 'in_progress') THEN 0 ELSE 1 END,
         m.scheduled_start_at DESC`,
      [userId],
    );
    return rows;
  }

  async getUserGameStats(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT
         count(DISTINCT gc.game_id) AS games_played,
         count(DISTINCT gc.game_id) FILTER (WHERE g.winner_user_id = $1) AS wins,
         count(DISTINCT gc.game_id) FILTER (WHERE g.status IN ('won', 'closed') AND (g.winner_user_id IS NULL OR g.winner_user_id != $1)) AS losses
       FROM game_cards gc
       JOIN games g ON g.id = gc.game_id
       WHERE gc.user_id = $1 AND g.status IN ('won', 'closed')`,
      [userId],
    );
    return {
      games_played: parseInt(rows[0]?.games_played || '0', 10),
      wins: parseInt(rows[0]?.wins || '0', 10),
      losses: parseInt(rows[0]?.losses || '0', 10),
    };
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
