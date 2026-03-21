import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

export interface ChatMessageRow {
  id: string;
  meeting_id: string;
  game_id: string | null;
  user_id: string;
  nickname_snapshot: string;
  message_text: string;
  moderation_status: string;
  created_at: Date;
  edited_at: Date | null;
  hidden_at: Date | null;
  hidden_by_user_id: string | null;
}

@Injectable()
export class ChatRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findByMeeting(meetingId: string, limit = 100, before?: string): Promise<ChatMessageRow[]> {
    const params: unknown[] = [meetingId, limit];
    let query = `SELECT * FROM chat_messages WHERE meeting_id = $1`;

    if (before) {
      query += ` AND created_at < $3`;
      params.push(before);
    }

    query += ` ORDER BY created_at DESC LIMIT $2`;

    const { rows } = await this.pool.query<ChatMessageRow>(query, params);
    return rows.reverse(); // Return in chronological order
  }

  async findById(id: string): Promise<ChatMessageRow | null> {
    const { rows } = await this.pool.query<ChatMessageRow>(
      'SELECT * FROM chat_messages WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    meetingId: string,
    gameId: string | null,
    userId: string,
    nickname: string,
    text: string,
  ): Promise<ChatMessageRow> {
    const { rows } = await this.pool.query<ChatMessageRow>(
      `INSERT INTO chat_messages (meeting_id, game_id, user_id, nickname_snapshot, message_text)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [meetingId, gameId, userId, nickname, text],
    );
    return rows[0];
  }

  async hide(id: string, hiddenByUserId: string): Promise<ChatMessageRow | null> {
    const { rows } = await this.pool.query<ChatMessageRow>(
      `UPDATE chat_messages SET moderation_status = 'hidden', hidden_at = NOW(), hidden_by_user_id = $2
       WHERE id = $1 RETURNING *`,
      [id, hiddenByUserId],
    );
    return rows[0] ?? null;
  }
}
