import { Module } from '@nestjs/common';
import { MeetingsRepository } from './meetings.repository';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { InProgressController } from './in-progress.controller';

@Module({
  controllers: [MeetingsController, InProgressController],
  providers: [MeetingsRepository, MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
