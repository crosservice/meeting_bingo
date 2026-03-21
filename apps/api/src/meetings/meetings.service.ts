import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';
import { MeetingsRepository, MeetingRow } from './meetings.repository';
import { AuditService } from '../common';

function toMeetingResponse(row: MeetingRow) {
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    name: row.name,
    scheduled_start_at: row.scheduled_start_at.toISOString(),
    scheduled_end_at: row.scheduled_end_at.toISOString(),
    actual_start_at: row.actual_start_at?.toISOString() ?? null,
    actual_end_at: row.actual_end_at?.toISOString() ?? null,
    grace_minutes: row.grace_minutes,
    chat_enabled: row.chat_enabled,
    anonymize_nicknames: row.anonymize_nicknames,
    status: row.status,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

@Injectable()
export class MeetingsService {
  constructor(
    private readonly repo: MeetingsRepository,
    private readonly audit: AuditService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  async create(
    userId: string,
    data: { name: string; scheduled_start_at: string; scheduled_end_at: string; grace_minutes?: number },
  ) {
    const meeting = await this.repo.create(
      userId,
      data.name,
      data.scheduled_start_at,
      data.scheduled_end_at,
      data.grace_minutes ?? 5,
    );

    // Auto-create owner membership
    await this.pool.query(
      `INSERT INTO meeting_memberships (meeting_id, user_id, role, access_status)
       VALUES ($1, $2, 'owner', 'active')`,
      [meeting.id, userId],
    );

    await this.audit.log(userId, 'meeting', meeting.id, 'meeting.created');
    return toMeetingResponse(meeting);
  }

  async findById(meetingId: string, userId: string) {
    const meeting = await this.repo.findById(meetingId);
    if (!meeting) throw new NotFoundException('Meeting not found');
    return toMeetingResponse(meeting);
  }

  async findByOwner(userId: string) {
    const meetings = await this.repo.findByOwner(userId);
    return meetings.map(toMeetingResponse);
  }

  async findJoinedByUser(userId: string) {
    const meetings = await this.repo.findJoinedByUser(userId);
    return meetings.map(toMeetingResponse);
  }

  async findInProgressForUser(userId: string) {
    const meetings = await this.repo.findInProgressForUser(userId);
    return meetings.map(toMeetingResponse);
  }

  async findAllForUserEnriched(userId: string) {
    return this.repo.findAllForUserEnriched(userId);
  }

  async getUserGameStats(userId: string) {
    return this.repo.getUserGameStats(userId);
  }

  async update(
    meetingId: string,
    userId: string,
    data: { name?: string; scheduled_start_at?: string; scheduled_end_at?: string; grace_minutes?: number; chat_enabled?: boolean; anonymize_nicknames?: boolean },
  ) {
    await this.assertOwner(meetingId, userId);

    const fields: Record<string, unknown> = {};
    if (data.name !== undefined) fields.name = data.name;
    if (data.scheduled_start_at !== undefined) fields.scheduled_start_at = data.scheduled_start_at;
    if (data.scheduled_end_at !== undefined) fields.scheduled_end_at = data.scheduled_end_at;
    if (data.grace_minutes !== undefined) fields.grace_minutes = data.grace_minutes;
    if (data.chat_enabled !== undefined) fields.chat_enabled = data.chat_enabled;
    if (data.anonymize_nicknames !== undefined) fields.anonymize_nicknames = data.anonymize_nicknames;

    const meeting = await this.repo.update(meetingId, fields);
    if (!meeting) throw new NotFoundException('Meeting not found');

    await this.audit.log(userId, 'meeting', meetingId, 'meeting.updated');
    return toMeetingResponse(meeting);
  }

  async extend(meetingId: string, userId: string, newEndAt: string) {
    const meeting = await this.assertOwner(meetingId, userId);

    if (!['open', 'in_progress', 'ended'].includes(meeting.status)) {
      throw new BadRequestException('Meeting cannot be extended in its current state');
    }

    const updated = await this.repo.update(meetingId, { scheduled_end_at: new Date(newEndAt) });
    if (!updated) throw new NotFoundException('Meeting not found');

    await this.audit.log(userId, 'meeting', meetingId, 'meeting.extended', { new_end_at: newEndAt });
    return toMeetingResponse(updated);
  }

  async close(meetingId: string, userId: string) {
    const meeting = await this.assertOwner(meetingId, userId);

    if (meeting.status === 'closed' || meeting.status === 'deleted') {
      throw new BadRequestException('Meeting is already closed');
    }

    const updated = await this.repo.update(meetingId, {
      status: 'closed',
      actual_end_at: new Date(),
    });
    if (!updated) throw new NotFoundException('Meeting not found');

    await this.audit.log(userId, 'meeting', meetingId, 'meeting.closed');
    return toMeetingResponse(updated);
  }

  async softDelete(meetingId: string, userId: string) {
    await this.assertOwner(meetingId, userId);
    await this.repo.softDelete(meetingId);
    await this.audit.log(userId, 'meeting', meetingId, 'meeting.deleted');
  }

  async assertOwner(meetingId: string, userId: string): Promise<MeetingRow> {
    const meeting = await this.repo.findById(meetingId);
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.owner_user_id !== userId) {
      throw new ForbiddenException('Only the meeting owner can perform this action');
    }
    return meeting;
  }

  async assertExists(meetingId: string): Promise<MeetingRow> {
    const meeting = await this.repo.findById(meetingId);
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }
}
