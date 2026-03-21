import { Module } from '@nestjs/common';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { MeetingsModule } from '../meetings';
import { MembershipsModule } from '../memberships';

@Module({
  imports: [MeetingsModule, MembershipsModule],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
