import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

export interface PhraseSetRow {
  id: string;
  meeting_id: string;
  name: string;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface PhraseRow {
  id: string;
  phrase_set_id: string;
  text: string;
  normalized_text: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

@Injectable()
export class PhraseSetsRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findSetById(id: string): Promise<PhraseSetRow | null> {
    const { rows } = await this.pool.query<PhraseSetRow>(
      'SELECT * FROM phrase_sets WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return rows[0] ?? null;
  }

  async findSetsByMeeting(meetingId: string): Promise<PhraseSetRow[]> {
    const { rows } = await this.pool.query<PhraseSetRow>(
      'SELECT * FROM phrase_sets WHERE meeting_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [meetingId],
    );
    return rows;
  }

  async createSet(meetingId: string, name: string, userId: string): Promise<PhraseSetRow> {
    const { rows } = await this.pool.query<PhraseSetRow>(
      `INSERT INTO phrase_sets (meeting_id, name, created_by_user_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [meetingId, name, userId],
    );
    return rows[0];
  }

  async updateSet(id: string, name: string): Promise<PhraseSetRow | null> {
    const { rows } = await this.pool.query<PhraseSetRow>(
      `UPDATE phrase_sets SET name = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, name],
    );
    return rows[0] ?? null;
  }

  async softDeleteSet(id: string): Promise<void> {
    await this.pool.query('UPDATE phrase_sets SET deleted_at = NOW() WHERE id = $1', [id]);
  }

  // Phrases
  async findPhrasesBySet(setId: string): Promise<PhraseRow[]> {
    const { rows } = await this.pool.query<PhraseRow>(
      'SELECT * FROM phrases WHERE phrase_set_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC',
      [setId],
    );
    return rows;
  }

  async findActivePhrasesBySet(setId: string): Promise<PhraseRow[]> {
    const { rows } = await this.pool.query<PhraseRow>(
      'SELECT * FROM phrases WHERE phrase_set_id = $1 AND deleted_at IS NULL AND is_active = true ORDER BY created_at ASC',
      [setId],
    );
    return rows;
  }

  async findPhraseById(id: string): Promise<PhraseRow | null> {
    const { rows } = await this.pool.query<PhraseRow>(
      'SELECT * FROM phrases WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return rows[0] ?? null;
  }

  async createPhrase(setId: string, text: string, normalizedText: string): Promise<PhraseRow> {
    const { rows } = await this.pool.query<PhraseRow>(
      `INSERT INTO phrases (phrase_set_id, text, normalized_text)
       VALUES ($1, $2, $3) RETURNING *`,
      [setId, text, normalizedText],
    );
    return rows[0];
  }

  async updatePhrase(id: string, fields: { text?: string; normalized_text?: string; is_active?: boolean }): Promise<PhraseRow | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (fields.text !== undefined) { setClauses.push(`text = $${idx++}`); values.push(fields.text); }
    if (fields.normalized_text !== undefined) { setClauses.push(`normalized_text = $${idx++}`); values.push(fields.normalized_text); }
    if (fields.is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(fields.is_active); }

    if (setClauses.length === 0) return this.findPhraseById(id);
    setClauses.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.pool.query<PhraseRow>(
      `UPDATE phrases SET ${setClauses.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }

  async softDeletePhrase(id: string): Promise<void> {
    await this.pool.query('UPDATE phrases SET deleted_at = NOW() WHERE id = $1', [id]);
  }

  async findSetsByCreator(userId: string, excludeMeetingId?: string): Promise<(PhraseSetRow & { meeting_name: string; phrase_count: number })[]> {
    const query = excludeMeetingId
      ? `SELECT ps.*, m.name AS meeting_name,
           (SELECT COUNT(*)::int FROM phrases p WHERE p.phrase_set_id = ps.id AND p.deleted_at IS NULL AND p.is_active = true) AS phrase_count
         FROM phrase_sets ps
         JOIN meetings m ON m.id = ps.meeting_id
         WHERE ps.created_by_user_id = $1 AND ps.deleted_at IS NULL AND ps.meeting_id != $2
         ORDER BY ps.created_at DESC`
      : `SELECT ps.*, m.name AS meeting_name,
           (SELECT COUNT(*)::int FROM phrases p WHERE p.phrase_set_id = ps.id AND p.deleted_at IS NULL AND p.is_active = true) AS phrase_count
         FROM phrase_sets ps
         JOIN meetings m ON m.id = ps.meeting_id
         WHERE ps.created_by_user_id = $1 AND ps.deleted_at IS NULL
         ORDER BY ps.created_at DESC`;
    const params = excludeMeetingId ? [userId, excludeMeetingId] : [userId];
    const { rows } = await this.pool.query(query, params);
    return rows;
  }

  async findDuplicates(setId: string, normalizedText: string, excludeId?: string): Promise<PhraseRow[]> {
    const query = excludeId
      ? 'SELECT * FROM phrases WHERE phrase_set_id = $1 AND normalized_text = $2 AND deleted_at IS NULL AND is_active = true AND id != $3'
      : 'SELECT * FROM phrases WHERE phrase_set_id = $1 AND normalized_text = $2 AND deleted_at IS NULL AND is_active = true';
    const params = excludeId ? [setId, normalizedText, excludeId] : [setId, normalizedText];
    const { rows } = await this.pool.query<PhraseRow>(query, params);
    return rows;
  }
}
