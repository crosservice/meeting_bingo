import { Injectable } from '@nestjs/common';
import { UsersRepository, UserRow } from './users.repository';

export interface PublicUser {
  id: string;
  nickname: string;
  status: string;
  theme: string;
  created_at: string;
  last_login_at: string | null;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    nickname: row.nickname,
    status: row.status,
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

  async updateLastLogin(id: string): Promise<void> {
    await this.repo.updateLastLogin(id);
  }

  async updateTheme(id: string, theme: string): Promise<void> {
    await this.repo.updateTheme(id, theme);
  }
}
