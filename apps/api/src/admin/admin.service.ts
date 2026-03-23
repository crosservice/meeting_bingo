import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminRepository } from './admin.repository';
import { AuditService } from '../common';

@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly auditService: AuditService,
  ) {}

  async listUsers() {
    const rows = await this.repo.listUsers();
    return rows.map((r) => ({
      id: r.id,
      nickname: r.nickname,
      status: r.status,
      role: r.role,
      created_at: r.created_at.toISOString(),
      last_login_at: r.last_login_at?.toISOString() ?? null,
      last_login_ip: r.last_login_ip,
      deleted_at: r.deleted_at?.toISOString() ?? null,
    }));
  }

  async getUserDetail(userId: string) {
    const detail = await this.repo.getUserDetail(userId);
    if (!detail) {
      throw new NotFoundException('User not found');
    }

    return {
      id: detail.id,
      nickname: detail.nickname,
      status: detail.status,
      role: detail.role,
      theme: detail.theme,
      created_at: detail.created_at.toISOString(),
      updated_at: detail.updated_at.toISOString(),
      last_login_at: detail.last_login_at?.toISOString() ?? null,
      last_login_ip: detail.last_login_ip,
      deleted_at: detail.deleted_at?.toISOString() ?? null,
      games_played: detail.games_played,
      games_won: detail.games_won,
      meetings_owned: detail.meetings_owned,
      meetings_joined: detail.meetings_joined,
    };
  }

  async suspendUser(targetUserId: string, actorUserId: string) {
    const user = await this.repo.getUserDetail(targetUserId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === 'superuser') {
      throw new BadRequestException('Cannot suspend a superuser');
    }
    if (user.status === 'suspended') {
      throw new BadRequestException('User is already suspended');
    }

    await this.repo.suspendUser(targetUserId);
    await this.repo.revokeAllSessions(targetUserId);

    await this.auditService.log(actorUserId, 'user', targetUserId, 'admin.suspend_user', {
      target_nickname: user.nickname,
    });
  }

  async restoreUser(targetUserId: string, actorUserId: string) {
    const user = await this.repo.getUserDetail(targetUserId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.status !== 'suspended') {
      throw new BadRequestException('User is not suspended');
    }

    await this.repo.restoreUser(targetUserId);

    await this.auditService.log(actorUserId, 'user', targetUserId, 'admin.restore_user', {
      target_nickname: user.nickname,
    });
  }
}
