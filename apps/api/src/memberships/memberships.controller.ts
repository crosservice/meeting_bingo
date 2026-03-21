import { Controller, Get, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CurrentUser, AuthenticatedUser } from '../auth';

@Controller('meetings/:meetingId/participants')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  async list(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const participants = await this.membershipsService.listParticipants(meetingId, user.id);
    return { participants };
  }

  @Post(':userId/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('meetingId') meetingId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.membershipsService.revokeParticipant(meetingId, userId, user.id);
    return { message: 'Participant revoked' };
  }
}
