import { Controller, Get } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { CurrentUser, AuthenticatedUser } from '../auth';

@Controller('me')
export class InProgressController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get('meetings/in-progress')
  async inProgress(@CurrentUser() user: AuthenticatedUser) {
    const meetings = await this.meetingsService.findInProgressForUser(user.id);
    return { meetings };
  }

  @Get('meetings/all')
  async allMeetings(@CurrentUser() user: AuthenticatedUser) {
    const meetings = await this.meetingsService.findAllForUserEnriched(user.id);
    return { meetings };
  }

  @Get('stats')
  async stats(@CurrentUser() user: AuthenticatedUser) {
    const stats = await this.meetingsService.getUserGameStats(user.id);
    return { stats };
  }
}
