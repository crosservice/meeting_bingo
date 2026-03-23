import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

export interface AdminUserRow {
  id: string;
  nickname: string;
  status: string;
  role: string;
  theme: string;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  last_login_ip: string | null;
  deleted_at: Date | null;
}

export interface AdminUserDetail extends AdminUserRow {
  games_played: number;
  games_won: number;
  meetings_owned: number;
  meetings_joined: number;
}

@Injectable()
export class AdminRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listUsers(): Promise<AdminUserRow[]> {
    const { rows } = await this.pool.query<AdminUserRow>(
      `SELECT id, nickname, status, role, theme, created_at, updated_at,
              last_login_at, last_login_ip, deleted_at
       FROM users
       ORDER BY created_at DESC`,
    );
    return rows;
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    const { rows } = await this.pool.query<AdminUserRow>(
      `SELECT id, nickname, status, role, theme, created_at, updated_at,
              last_login_at, last_login_ip, deleted_at
       FROM users WHERE id = $1`,
      [userId],
    );

    if (rows.length === 0) return null;

    const user = rows[0];

    const { rows: gameStats } = await this.pool.query<{ games_played: string; games_won: string }>(
      `SELECT
         COUNT(DISTINCT gc.game_id) AS games_played,
         COUNT(DISTINCT CASE WHEN g.winner_user_id = $1 THEN g.id END) AS games_won
       FROM game_cards gc
       JOIN games g ON g.id = gc.game_id
       WHERE gc.user_id = $1`,
      [userId],
    );

    const { rows: meetingStats } = await this.pool.query<{ meetings_owned: string; meetings_joined: string }>(
      `SELECT
         COUNT(DISTINCT CASE WHEN role = 'owner' THEN meeting_id END) AS meetings_owned,
         COUNT(DISTINCT CASE WHEN role = 'participant' THEN meeting_id END) AS meetings_joined
       FROM meeting_memberships
       WHERE user_id = $1`,
      [userId],
    );

    return {
      ...user,
      games_played: parseInt(gameStats[0]?.games_played || '0', 10),
      games_won: parseInt(gameStats[0]?.games_won || '0', 10),
      meetings_owned: parseInt(meetingStats[0]?.meetings_owned || '0', 10),
      meetings_joined: parseInt(meetingStats[0]?.meetings_joined || '0', 10),
    };
  }

  async suspendUser(userId: string): Promise<void> {
    await this.pool.query(
      "UPDATE users SET status = 'suspended', updated_at = NOW() WHERE id = $1",
      [userId],
    );
  }

  async restoreUser(userId: string): Promise<void> {
    await this.pool.query(
      "UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1",
      [userId],
    );
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
  }
}
