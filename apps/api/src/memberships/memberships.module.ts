import { Module } from '@nestjs/common';
import { MembershipsRepository } from './memberships.repository';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { MeetingsModule } from '../meetings';

@Module({
  imports: [MeetingsModule],
  controllers: [MembershipsController],
  providers: [MembershipsRepository, MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
