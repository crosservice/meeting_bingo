import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

export interface InviteRow {
  id: string;
  meeting_id: string;
  token_hash: string;
  expires_at: Date;
  max_uses: number | null;
  current_uses: number;
  revoked_at: Date | null;
  created_by_user_id: string;
  created_at: Date;
}

@Injectable()
export class InvitesRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findByTokenHash(tokenHash: string): Promise<InviteRow | null> {
    const { rows } = await this.pool.query<InviteRow>(
      'SELECT * FROM meeting_invites WHERE token_hash = $1',
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<InviteRow | null> {
    const { rows } = await this.pool.query<InviteRow>(
      'SELECT * FROM meeting_invites WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async findByMeeting(meetingId: string): Promise<InviteRow[]> {
    const { rows } = await this.pool.query<InviteRow>(
      'SELECT * FROM meeting_invites WHERE meeting_id = $1 ORDER BY created_at DESC',
      [meetingId],
    );
    return rows;
  }

  async create(
    meetingId: string,
    tokenHash: string,
    expiresAt: string,
    maxUses: number | null,
    createdByUserId: string,
  ): Promise<InviteRow> {
    const { rows } = await this.pool.query<InviteRow>(
      `INSERT INTO meeting_invites (meeting_id, token_hash, expires_at, max_uses, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [meetingId, tokenHash, expiresAt, maxUses, createdByUserId],
    );
    return rows[0];
  }

  async incrementUses(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE meeting_invites SET current_uses = current_uses + 1 WHERE id = $1',
      [id],
    );
  }

  async revoke(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE meeting_invites SET revoked_at = NOW() WHERE id = $1',
      [id],
    );
  }
}
