import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InvitesService } from './invites.service';
import { CurrentUser, Public, AuthenticatedUser } from '../auth';
import { createInviteSchema } from '@meeting-bingo/validation';

@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('meetings/:meetingId/invites')
  async create(
    @Param('meetingId') meetingId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = createInviteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const invite = await this.invitesService.generate(meetingId, user.id, parsed.data);
    return { invite };
  }

  @Get('meetings/:meetingId/invites')
  async list(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const invites = await this.invitesService.listForMeeting(meetingId, user.id);
    return { invites };
  }

  @Public()
  @Get('invites/:token/validate')
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  async validate(@Param('token') token: string) {
    const result = await this.invitesService.validate(token);
    return result;
  }

  @Post('invites/:token/join')
  async join(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.invitesService.join(token, user.id);
    return result;
  }

  @Post('meetings/:meetingId/invites/:inviteId/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('meetingId') meetingId: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.invitesService.revoke(meetingId, inviteId, user.id);
    return { message: 'Invite revoked' };
  }
}
