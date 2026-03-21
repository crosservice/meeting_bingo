import { Module } from '@nestjs/common';
import { InvitesRepository } from './invites.repository';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { MeetingsModule } from '../meetings';

@Module({
  imports: [MeetingsModule],
  controllers: [InvitesController],
  providers: [InvitesRepository, InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
