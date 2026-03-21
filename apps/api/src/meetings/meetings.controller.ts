import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { CurrentUser, AuthenticatedUser } from '../auth';
import { createMeetingSchema, updateMeetingSchema } from '@meeting-bingo/validation';

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createMeetingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const meeting = await this.meetingsService.create(user.id, parsed.data);
    return { meeting };
  }

  @Get(':meetingId')
  async findOne(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const meeting = await this.meetingsService.findById(meetingId, user.id);
    return { meeting };
  }

  @Patch(':meetingId')
  async update(
    @Param('meetingId') meetingId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = updateMeetingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const meeting = await this.meetingsService.update(meetingId, user.id, parsed.data);
    return { meeting };
  }

  @Post(':meetingId/extend')
  @HttpCode(HttpStatus.OK)
  async extend(
    @Param('meetingId') meetingId: string,
    @Body() body: { scheduled_end_at: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.scheduled_end_at) {
      throw new BadRequestException('scheduled_end_at is required');
    }
    const meeting = await this.meetingsService.extend(meetingId, user.id, body.scheduled_end_at);
    return { meeting };
  }

  @Post(':meetingId/close')
  @HttpCode(HttpStatus.OK)
  async close(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const meeting = await this.meetingsService.close(meetingId, user.id);
    return { meeting };
  }

  @Delete(':meetingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.meetingsService.softDelete(meetingId, user.id);
  }
}
