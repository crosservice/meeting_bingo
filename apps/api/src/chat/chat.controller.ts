import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CurrentUser, AuthenticatedUser } from '../auth';

@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('meetings/:meetingId/chat')
  async getMessages(
    @Param('meetingId') meetingId: string,
    @Query('limit') limit: string | undefined,
    @Query('before') before: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const messages = await this.chatService.getMessages(
      meetingId,
      user.id,
      limit ? parseInt(limit, 10) : undefined,
      before,
    );
    return { messages };
  }

  @Post('meetings/:meetingId/chat')
  async sendMessage(
    @Param('meetingId') meetingId: string,
    @Body() body: { message_text?: string; game_id?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.message_text) {
      throw new BadRequestException('message_text is required');
    }
    const message = await this.chatService.sendMessage(
      meetingId,
      user.id,
      user.nickname,
      body.message_text,
      body.game_id,
    );
    return { message };
  }

  @Post('chat/:messageId/hide')
  @HttpCode(HttpStatus.OK)
  async hideMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const message = await this.chatService.hideMessage(messageId, user.id);
    return { message };
  }
}
