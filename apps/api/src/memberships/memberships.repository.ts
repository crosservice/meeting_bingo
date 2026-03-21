import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

export interface MembershipRow {
  id: string;
  meeting_id: string;
  user_id: string;
  role: string;
  access_status: string;
  joined_at: Date;
  revoked_at: Date | null;
  revoked_by_user_id: string | null;
  deleted_at: Date | null;
  nickname: string;
}

@Injectable()
export class MembershipsRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findByMeeting(meetingId: string): Promise<MembershipRow[]> {
    const { rows } = await this.pool.query<MembershipRow>(
      `SELECT mm.*, u.nickname
       FROM meeting_memberships mm
       JOIN users u ON u.id = mm.user_id
       WHERE mm.meeting_id = $1 AND mm.deleted_at IS NULL
       ORDER BY mm.joined_at ASC`,
      [meetingId],
    );
    return rows;
  }

  async findByMeetingAndUser(meetingId: string, userId: string): Promise<MembershipRow | null> {
    const { rows } = await this.pool.query<MembershipRow>(
      `SELECT mm.*, u.nickname
       FROM meeting_memberships mm
       JOIN users u ON u.id = mm.user_id
       WHERE mm.meeting_id = $1 AND mm.user_id = $2 AND mm.deleted_at IS NULL`,
      [meetingId, userId],
    );
    return rows[0] ?? null;
  }

  async revoke(id: string, revokedByUserId: string): Promise<void> {
    await this.pool.query(
      `UPDATE meeting_memberships
       SET access_status = 'revoked', revoked_at = NOW(), revoked_by_user_id = $2
       WHERE id = $1`,
      [id, revokedByUserId],
    );
  }

  async unrevoke(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE meeting_memberships
       SET access_status = 'active', revoked_at = NULL, revoked_by_user_id = NULL
       WHERE id = $1`,
      [id],
    );
  }

  async createOwnerMembership(meetingId: string, userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO meeting_memberships (meeting_id, user_id, role, access_status)
       VALUES ($1, $2, 'owner', 'active')
       ON CONFLICT DO NOTHING`,
      [meetingId, userId],
    );
  }
}
