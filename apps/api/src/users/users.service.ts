import { Injectable } from '@nestjs/common';
import { UsersRepository, UserRow } from './users.repository';

export interface PublicUser {
  id: string;
  nickname: string;
  status: string;
  role: string;
  theme: string;
  created_at: string;
  last_login_at: string | null;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    nickname: row.nickname,
    status: row.status,
    role: row.role || 'user',
    theme: row.theme || 'light',
    created_at: row.created_at.toISOString(),
    last_login_at: row.last_login_at?.toISOString() ?? null,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  async findById(id: string): Promise<PublicUser | null> {
    const row = await this.repo.findById(id);
    return row ? toPublicUser(row) : null;
  }

  async findByNickname(nickname: string): Promise<UserRow | null> {
    return this.repo.findByNickname(nickname);
  }

  async create(nickname: string, passwordHash: string): Promise<PublicUser> {
    const row = await this.repo.create(nickname, passwordHash);
    return toPublicUser(row);
  }

  async updateLastLogin(id: string, ip?: string): Promise<void> {
    await this.repo.updateLastLogin(id, ip);
  }

  async updateTheme(id: string, theme: string): Promise<void> {
    await this.repo.updateTheme(id, theme);
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.repo.updatePassword(id, passwordHash);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findByIdWithHash(id: string): Promise<import('./users.repository').UserRow | null> {
    return this.repo.findById(id);
  }
}
