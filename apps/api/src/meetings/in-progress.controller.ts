import { Controller, Get } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { CurrentUser, AuthenticatedUser } from '../auth';

@Controller('me/meetings')
export class InProgressController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get('in-progress')
  async inProgress(@CurrentUser() user: AuthenticatedUser) {
    const meetings = await this.meetingsService.findInProgressForUser(user.id);
    return { meetings };
  }
}
