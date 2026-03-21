import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { MembershipsRepository } from './memberships.repository';
import { MeetingsService } from '../meetings';
import { AuditService } from '../common';
import { WsGateway } from '../websocket';
import { ServerEvents } from '@meeting-bingo/types';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly repo: MembershipsRepository,
    private readonly meetingsService: MeetingsService,
    private readonly audit: AuditService,
    private readonly wsGateway: WsGateway,
  ) {}

  async listParticipants(meetingId: string, userId: string) {
    // Any active member can view participants
    await this.assertActiveMember(meetingId, userId);

    const members = await this.repo.findByMeeting(meetingId);
    return members.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      nickname: m.nickname,
      role: m.role,
      access_status: m.access_status,
      joined_at: m.joined_at.toISOString(),
      revoked_at: m.revoked_at?.toISOString() ?? null,
    }));
  }

  async revokeParticipant(meetingId: string, targetUserId: string, actorUserId: string) {
    await this.meetingsService.assertOwner(meetingId, actorUserId);

    if (targetUserId === actorUserId) {
      throw new BadRequestException('Cannot revoke yourself');
    }

    const membership = await this.repo.findByMeetingAndUser(meetingId, targetUserId);
    if (!membership) {
      throw new NotFoundException('Participant not found');
    }
    if (membership.access_status === 'revoked') {
      throw new BadRequestException('Participant is already revoked');
    }

    await this.repo.revoke(membership.id, actorUserId);
    await this.audit.log(actorUserId, 'membership', membership.id, 'member.revoked', {
      target_user_id: targetUserId,
      meeting_id: meetingId,
    });

    // Broadcast to the meeting room so the kicked user's client sees it.
    // Using emitToMeeting (room broadcast) instead of emitToUser because
    // emitToUser requires socket auth userId matching which can fail
    // when connections go through Nginx. The client checks user_id match.
    try {
      this.wsGateway.emitToMeeting(meetingId, ServerEvents.ParticipantRevoked, {
        meeting_id: meetingId,
        user_id: targetUserId,
      });
    } catch {
      // WS emit is best-effort
    }
  }

  async unrevokeParticipant(meetingId: string, targetUserId: string, actorUserId: string) {
    await this.meetingsService.assertOwner(meetingId, actorUserId);

    const membership = await this.repo.findByMeetingAndUser(meetingId, targetUserId);
    if (!membership) {
      throw new NotFoundException('Participant not found');
    }
    if (membership.access_status !== 'revoked') {
      throw new BadRequestException('Participant is not revoked');
    }

    await this.repo.unrevoke(membership.id);
    await this.audit.log(actorUserId, 'membership', membership.id, 'member.unrevoked', {
      target_user_id: targetUserId,
      meeting_id: meetingId,
    });
  }

  async assertActiveMember(meetingId: string, userId: string) {
    const membership = await this.repo.findByMeetingAndUser(meetingId, userId);
    if (!membership || membership.access_status !== 'active') {
      throw new ForbiddenException('You do not have access to this meeting');
    }
    return membership;
  }

  async createOwnerMembership(meetingId: string, userId: string) {
    await this.repo.createOwnerMembership(meetingId, userId);
  }
}
