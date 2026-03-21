import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { GameplayService } from './gameplay.service';
import { CurrentUser, AuthenticatedUser } from '../auth';

interface MarkBody {
  client_event_id?: string;
}

@Controller()
export class GameplayController {
  constructor(private readonly gameplayService: GameplayService) {}

  @Post('games/:gameId/cards/me/cells/:cellId/increment')
  @HttpCode(HttpStatus.OK)
  async increment(
    @Param('gameId') gameId: string,
    @Param('cellId') cellId: string,
    @Body() body: MarkBody,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const clientEventId = body.client_event_id;
    if (!clientEventId) {
      throw new BadRequestException('client_event_id is required');
    }

    const result = await this.gameplayService.increment(
      gameId,
      cellId,
      user.id,
      clientEventId,
      uuidv4(),
      req.cookies?.session_id || 'unknown',
      null,
    );

    return result;
  }

  @Post('games/:gameId/cards/me/cells/:cellId/decrement')
  @HttpCode(HttpStatus.OK)
  async decrement(
    @Param('gameId') gameId: string,
    @Param('cellId') cellId: string,
    @Body() body: MarkBody,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const clientEventId = body.client_event_id;
    if (!clientEventId) {
      throw new BadRequestException('client_event_id is required');
    }

    const result = await this.gameplayService.decrement(
      gameId,
      cellId,
      user.id,
      clientEventId,
      uuidv4(),
      req.cookies?.session_id || 'unknown',
      null,
    );

    return result;
  }

  @Get('games/:gameId/rankings')
  async rankings(
    @Param('gameId') gameId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rankings = await this.gameplayService.computeRankings(gameId, user.id);
    return {
      rankings: rankings.map((r, i) => ({
        rank: i + 1,
        ...r,
      })),
    };
  }
}
