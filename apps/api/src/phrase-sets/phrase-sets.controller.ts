import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PhraseSetsService } from './phrase-sets.service';
import { CurrentUser, AuthenticatedUser } from '../auth';
import { createPhraseSetSchema, createPhraseSchema, updatePhraseSchema } from '@meeting-bingo/validation';

@Controller()
export class PhraseSetsController {
  constructor(private readonly service: PhraseSetsService) {}

  // Phrase Sets
  @Post('meetings/:meetingId/phrase-sets')
  async createSet(
    @Param('meetingId') meetingId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = createPhraseSetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const phraseSet = await this.service.createSet(meetingId, user.id, parsed.data.name);
    return { phrase_set: phraseSet };
  }

  @Get('meetings/:meetingId/phrase-sets')
  async listSets(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const phraseSets = await this.service.listSets(meetingId, user.id);
    return { phrase_sets: phraseSets };
  }

  @Patch('phrase-sets/:phraseSetId')
  async updateSet(
    @Param('phraseSetId') phraseSetId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = createPhraseSetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const phraseSet = await this.service.updateSet(phraseSetId, user.id, parsed.data.name);
    return { phrase_set: phraseSet };
  }

  @Delete('phrase-sets/:phraseSetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSet(
    @Param('phraseSetId') phraseSetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.service.deleteSet(phraseSetId, user.id);
  }

  // Phrases
  @Post('phrase-sets/:phraseSetId/phrases')
  async createPhrase(
    @Param('phraseSetId') phraseSetId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = createPhraseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const result = await this.service.addPhrase(phraseSetId, user.id, parsed.data.text);
    return result;
  }

  @Get('phrase-sets/:phraseSetId/phrases')
  async listPhrases(
    @Param('phraseSetId') phraseSetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const phrases = await this.service.listPhrases(phraseSetId, user.id);
    return { phrases };
  }

  @Patch('phrases/:phraseId')
  async updatePhrase(
    @Param('phraseId') phraseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = updatePhraseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const result = await this.service.updatePhrase(phraseId, user.id, parsed.data);
    return result;
  }

  @Delete('phrases/:phraseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePhrase(
    @Param('phraseId') phraseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.service.deletePhrase(phraseId, user.id);
  }
}
