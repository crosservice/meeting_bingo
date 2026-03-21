import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

export interface ExportJobRow {
  id: string;
  meeting_id: string;
  requested_by_user_id: string;
  export_type: string;
  status: string;
  file_path: string | null;
  created_at: Date;
  expires_at: Date;
  completed_at: Date | null;
  failed_at: Date | null;
  error_message: string | null;
}

@Injectable()
export class ExportsRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<ExportJobRow | null> {
    const { rows } = await this.pool.query<ExportJobRow>(
      'SELECT * FROM export_jobs WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async findByMeeting(meetingId: string): Promise<ExportJobRow[]> {
    const { rows } = await this.pool.query<ExportJobRow>(
      'SELECT * FROM export_jobs WHERE meeting_id = $1 ORDER BY created_at DESC',
      [meetingId],
    );
    return rows;
  }

  async create(meetingId: string, userId: string, exportType: string, expiresAt: Date): Promise<ExportJobRow> {
    const { rows } = await this.pool.query<ExportJobRow>(
      `INSERT INTO export_jobs (meeting_id, requested_by_user_id, export_type, status, expires_at)
       VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
      [meetingId, userId, exportType, expiresAt.toISOString()],
    );
    return rows[0];
  }

  async updateStatus(
    id: string,
    status: string,
    extra?: { file_path?: string; error_message?: string },
  ): Promise<void> {
    const setClauses = ['status = $2'];
    const values: unknown[] = [id, status];
    let idx = 3;

    if (status === 'completed') {
      setClauses.push(`completed_at = NOW()`);
    }
    if (status === 'failed') {
      setClauses.push(`failed_at = NOW()`);
    }
    if (extra?.file_path) {
      setClauses.push(`file_path = $${idx++}`);
      values.push(extra.file_path);
    }
    if (extra?.error_message) {
      setClauses.push(`error_message = $${idx++}`);
      values.push(extra.error_message);
    }

    await this.pool.query(
      `UPDATE export_jobs SET ${setClauses.join(', ')} WHERE id = $1`,
      values,
    );
  }

  // Data gathering queries for export
  async getMeetingData(meetingId: string) {
    const { rows } = await this.pool.query(
      'SELECT * FROM meetings WHERE id = $1',
      [meetingId],
    );
    return rows[0] ?? null;
  }

  async getParticipants(meetingId: string) {
    const { rows } = await this.pool.query(
      `SELECT mm.*, u.nickname FROM meeting_memberships mm
       JOIN users u ON u.id = mm.user_id
       WHERE mm.meeting_id = $1 ORDER BY mm.joined_at`,
      [meetingId],
    );
    return rows;
  }

  async getGames(meetingId: string) {
    const { rows } = await this.pool.query(
      'SELECT * FROM games WHERE meeting_id = $1 ORDER BY created_at',
      [meetingId],
    );
    return rows;
  }

  async getCardsForGame(gameId: string) {
    const { rows } = await this.pool.query(
      `SELECT gc.*, u.nickname FROM game_cards gc
       JOIN users u ON u.id = gc.user_id
       WHERE gc.game_id = $1`,
      [gameId],
    );
    return rows;
  }

  async getCellsForGame(gameId: string) {
    const { rows } = await this.pool.query(
      `SELECT cc.* FROM card_cells cc
       JOIN game_cards gc ON gc.id = cc.game_card_id
       WHERE gc.game_id = $1
       ORDER BY gc.user_id, cc.row_index, cc.col_index`,
      [gameId],
    );
    return rows;
  }

  async getMarkEvents(gameId: string) {
    const { rows } = await this.pool.query(
      `SELECT pme.*, u.nickname FROM phrase_mark_events pme
       JOIN users u ON u.id = pme.user_id
       WHERE pme.game_id = $1
       ORDER BY pme.occurred_at`,
      [gameId],
    );
    return rows;
  }

  async getChatMessages(meetingId: string) {
    const { rows } = await this.pool.query(
      'SELECT * FROM chat_messages WHERE meeting_id = $1 ORDER BY created_at',
      [meetingId],
    );
    return rows;
  }

  async getAuditEvents(meetingId: string) {
    const { rows } = await this.pool.query(
      `SELECT ae.*, u.nickname AS actor_nickname
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id
       WHERE (ae.entity_type = 'meeting' AND ae.entity_id = $1)
          OR (ae.entity_type IN ('game', 'invite', 'membership', 'phrase_set') AND ae.entity_id IN (
            SELECT id::text FROM games WHERE meeting_id = $1::uuid
            UNION SELECT id::text FROM meeting_invites WHERE meeting_id = $1::uuid
            UNION SELECT id::text FROM meeting_memberships WHERE meeting_id = $1::uuid
            UNION SELECT id::text FROM phrase_sets WHERE meeting_id = $1::uuid
          ))
       ORDER BY ae.occurred_at`,
      [meetingId],
    );
    return rows;
  }

  async getPhraseSets(meetingId: string) {
    const { rows } = await this.pool.query(
      `SELECT ps.*, json_agg(p.* ORDER BY p.created_at) as phrases
       FROM phrase_sets ps
       LEFT JOIN phrases p ON p.phrase_set_id = ps.id AND p.deleted_at IS NULL
       WHERE ps.meeting_id = $1 AND ps.deleted_at IS NULL
       GROUP BY ps.id
       ORDER BY ps.created_at`,
      [meetingId],
    );
    return rows;
  }
}
