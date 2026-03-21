import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

export interface UserRow {
  id: string;
  nickname: string;
  password_hash: string;
  status: string;
  theme: string;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  deleted_at: Date | null;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return rows[0] ?? null;
  }

  async findByNickname(nickname: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      'SELECT * FROM users WHERE nickname = $1 AND deleted_at IS NULL',
      [nickname],
    );
    return rows[0] ?? null;
  }

  async create(nickname: string, passwordHash: string): Promise<UserRow> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (nickname, password_hash, status)
       VALUES ($1, $2, 'active')
       RETURNING *`,
      [nickname, passwordHash],
    );
    return rows[0];
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id],
    );
  }

  async updateTheme(id: string, theme: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET theme = $2, updated_at = NOW() WHERE id = $1',
      [id, theme],
    );
  }
}
