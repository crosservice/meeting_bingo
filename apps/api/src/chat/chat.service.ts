import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ChatRepository, ChatMessageRow } from './chat.repository';
import { MeetingsService } from '../meetings';
import { MembershipsService } from '../memberships';
import { WsGateway } from '../websocket';
import { ServerEvents } from '@meeting-bingo/types';
import { CHAT_RATE_LIMIT_MAX, CHAT_RATE_LIMIT_WINDOW_SECONDS } from '@meeting-bingo/config';

// Basic profanity word list for spam filtering
const SPAM_PATTERNS = [
  /(.)\1{5,}/i, // repeated characters
];

function toMessageResponse(row: ChatMessageRow) {
  return {
    id: row.id,
    meeting_id: row.meeting_id,
    game_id: row.game_id,
    user_id: row.user_id,
    nickname: row.nickname_snapshot,
    message_text: row.moderation_status === 'hidden' ? '[message hidden]' : row.message_text,
    moderation_status: row.moderation_status,
    created_at: row.created_at.toISOString(),
    hidden_at: row.hidden_at?.toISOString() ?? null,
  };
}

@Injectable()
export class ChatService {
  // In-memory sliding window rate limiter: Map<`${userId}:${meetingId}`, timestamp[]>
  private rateLimitMap = new Map<string, number[]>();

  constructor(
    private readonly repo: ChatRepository,
    private readonly meetingsService: MeetingsService,
    private readonly membershipsService: MembershipsService,
    private readonly wsGateway: WsGateway,
  ) {}

  async getMessages(meetingId: string, userId: string, limit?: number, before?: string) {
    await this.membershipsService.assertActiveMember(meetingId, userId);
    const messages = await this.repo.findByMeeting(meetingId, limit, before);
    return messages.map(toMessageResponse);
  }

  async sendMessage(
    meetingId: string,
    userId: string,
    nickname: string,
    text: string,
    gameId?: string | null,
  ) {
    await this.membershipsService.assertActiveMember(meetingId, userId);

    // Rate limit check
    this.enforceRateLimit(userId, meetingId);

    // Basic spam check
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Message cannot be empty');
    }
    if (trimmed.length > 1000) {
      throw new BadRequestException('Message is too long (max 1000 characters)');
    }
    for (const pattern of SPAM_PATTERNS) {
      if (pattern.test(trimmed)) {
        throw new BadRequestException('Message flagged as spam');
      }
    }

    const message = await this.repo.create(meetingId, gameId ?? null, userId, nickname, trimmed);
    const response = toMessageResponse(message);

    // Broadcast to meeting room
    this.wsGateway.emitToMeeting(meetingId, ServerEvents.ChatCreated, response);

    return response;
  }

  async hideMessage(messageId: string, userId: string) {
    const message = await this.repo.findById(messageId);
    if (!message) throw new NotFoundException('Message not found');

    // Only meeting owner can hide messages
    await this.meetingsService.assertOwner(message.meeting_id, userId);

    const hidden = await this.repo.hide(messageId, userId);
    if (!hidden) throw new NotFoundException('Message not found');

    const response = toMessageResponse(hidden);

    // Broadcast hide event
    this.wsGateway.emitToMeeting(message.meeting_id, ServerEvents.ChatHidden, {
      message_id: messageId,
    });

    return response;
  }

  /**
   * Sliding window rate limiter: max 3 messages per 10 seconds per user per meeting.
   */
  private enforceRateLimit(userId: string, meetingId: string): void {
    const key = `${userId}:${meetingId}`;
    const now = Date.now();
    const windowMs = CHAT_RATE_LIMIT_WINDOW_SECONDS * 1000;

    let timestamps = this.rateLimitMap.get(key) || [];
    // Remove timestamps outside the window
    timestamps = timestamps.filter((t) => now - t < windowMs);

    if (timestamps.length >= CHAT_RATE_LIMIT_MAX) {
      throw new BadRequestException(
        `Rate limit exceeded. Max ${CHAT_RATE_LIMIT_MAX} messages per ${CHAT_RATE_LIMIT_WINDOW_SECONDS} seconds.`,
      );
    }

    timestamps.push(now);
    this.rateLimitMap.set(key, timestamps);
  }
}
