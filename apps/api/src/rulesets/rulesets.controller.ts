import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { RulesetsService } from './rulesets.service';
import { CurrentUser, AuthenticatedUser } from '../auth';
import { createRulesetSchema, updateRulesetSchema } from '@meeting-bingo/validation';

@Controller()
export class RulesetsController {
  constructor(private readonly service: RulesetsService) {}

  @Post('meetings/:meetingId/rulesets')
  async create(
    @Param('meetingId') meetingId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = createRulesetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const ruleset = await this.service.create(meetingId, user.id, parsed.data);
    return { ruleset };
  }

  @Get('meetings/:meetingId/rulesets')
  async list(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rulesets = await this.service.list(meetingId, user.id);
    return { rulesets };
  }

  @Patch('rulesets/:rulesetId')
  async update(
    @Param('rulesetId') rulesetId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = updateRulesetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const ruleset = await this.service.update(rulesetId, user.id, parsed.data);
    return { ruleset };
  }
}
