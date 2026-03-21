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
import { GamesService } from './games.service';
import { CurrentUser, AuthenticatedUser } from '../auth';

@Controller()
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post('meetings/:meetingId/games')
  async create(
    @Param('meetingId') meetingId: string,
    @Body() body: { phrase_set_id?: string; ruleset_id?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.phrase_set_id || !body.ruleset_id) {
      throw new BadRequestException('phrase_set_id and ruleset_id are required');
    }
    const game = await this.gamesService.create(meetingId, user.id, {
      phrase_set_id: body.phrase_set_id,
      ruleset_id: body.ruleset_id,
    });
    return { game };
  }

  @Get('meetings/:meetingId/games')
  async listByMeeting(
    @Param('meetingId') meetingId: string,
    @CurrentUser() _user: AuthenticatedUser,
  ) {
    const games = await this.gamesService.listByMeeting(meetingId);
    return { games };
  }

  @Post('games/:gameId/start')
  @HttpCode(HttpStatus.OK)
  async start(
    @Param('gameId') gameId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const game = await this.gamesService.start(gameId, user.id);
    return { game };
  }

  @Post('games/:gameId/close')
  @HttpCode(HttpStatus.OK)
  async close(
    @Param('gameId') gameId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const game = await this.gamesService.close(gameId, user.id);
    return { game };
  }

  @Get('games/:gameId')
  async getById(
    @Param('gameId') gameId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const game = await this.gamesService.getById(gameId, user.id);
    return { game };
  }

  @Get('games/:gameId/cards/me')
  async getMyCard(
    @Param('gameId') gameId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const card = await this.gamesService.getMyCard(gameId, user.id);
    return { card };
  }
}
