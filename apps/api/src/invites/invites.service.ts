import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import { DATABASE_POOL } from '../database';
import { InvitesRepository } from './invites.repository';
import { MeetingsService } from '../meetings';
import { AuditService } from '../common';

@Injectable()
export class InvitesService {
  constructor(
    private readonly repo: InvitesRepository,
    private readonly meetingsService: MeetingsService,
    private readonly audit: AuditService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  async generate(
    meetingId: string,
    userId: string,
    data: { expires_at: string; max_uses?: number | null },
  ) {
    await this.meetingsService.assertOwner(meetingId, userId);

    // Generate a cryptographically secure token
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);

    const invite = await this.repo.create(
      meetingId,
      tokenHash,
      data.expires_at,
      data.max_uses ?? null,
      userId,
    );

    await this.audit.log(userId, 'invite', invite.id, 'invite.created', { meeting_id: meetingId });

    // Return invite info + raw token (shown only once)
    return {
      id: invite.id,
      meeting_id: invite.meeting_id,
      token: rawToken,
      expires_at: invite.expires_at.toISOString(),
      max_uses: invite.max_uses,
      current_uses: invite.current_uses,
      created_at: invite.created_at.toISOString(),
    };
  }

  async validate(token: string) {
    const tokenHash = this.hashToken(token);
    const invite = await this.repo.findByTokenHash(tokenHash);

    // Generic error to avoid information leakage
    const genericError = new BadRequestException('This invite link is invalid or has expired');

    if (!invite) throw genericError;
    if (invite.revoked_at) throw genericError;
    if (new Date(invite.expires_at) < new Date()) throw genericError;
    if (invite.max_uses !== null && invite.current_uses >= invite.max_uses) throw genericError;

    // Return meeting info for the join page
    const meeting = await this.meetingsService.findById(invite.meeting_id, '');
    return {
      valid: true,
      meeting_id: invite.meeting_id,
      meeting_name: meeting.name,
    };
  }

  async join(token: string, userId: string) {
    const tokenHash = this.hashToken(token);
    const invite = await this.repo.findByTokenHash(tokenHash);

    const genericError = new BadRequestException('This invite link is invalid or has expired');

    if (!invite) throw genericError;
    if (invite.revoked_at) throw genericError;
    if (new Date(invite.expires_at) < new Date()) throw genericError;
    if (invite.max_uses !== null && invite.current_uses >= invite.max_uses) throw genericError;

    // Check if user already has active membership
    const { rows: existing } = await this.pool.query(
      `SELECT id FROM meeting_memberships
       WHERE meeting_id = $1 AND user_id = $2 AND access_status = 'active' AND deleted_at IS NULL`,
      [invite.meeting_id, userId],
    );

    if (existing.length > 0) {
      return { meeting_id: invite.meeting_id, already_member: true };
    }

    // Create membership
    await this.pool.query(
      `INSERT INTO meeting_memberships (meeting_id, user_id, role, access_status)
       VALUES ($1, $2, 'participant', 'active')`,
      [invite.meeting_id, userId],
    );

    // Increment invite uses
    await this.repo.incrementUses(invite.id);

    await this.audit.log(userId, 'membership', invite.meeting_id, 'member.joined', {
      invite_id: invite.id,
    });

    return { meeting_id: invite.meeting_id, already_member: false };
  }

  async revoke(meetingId: string, inviteId: string, userId: string) {
    await this.meetingsService.assertOwner(meetingId, userId);

    const invite = await this.repo.findById(inviteId);
    if (!invite || invite.meeting_id !== meetingId) {
      throw new NotFoundException('Invite not found');
    }

    await this.repo.revoke(inviteId);
    await this.audit.log(userId, 'invite', inviteId, 'invite.revoked');
  }

  async listForMeeting(meetingId: string, userId: string) {
    await this.meetingsService.assertOwner(meetingId, userId);

    const invites = await this.repo.findByMeeting(meetingId);
    return invites.map((inv) => ({
      id: inv.id,
      meeting_id: inv.meeting_id,
      expires_at: inv.expires_at.toISOString(),
      max_uses: inv.max_uses,
      current_uses: inv.current_uses,
      revoked_at: inv.revoked_at?.toISOString() ?? null,
      created_at: inv.created_at.toISOString(),
    }));
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
