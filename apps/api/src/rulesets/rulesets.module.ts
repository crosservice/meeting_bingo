import { Module } from '@nestjs/common';
import { RulesetsRepository } from './rulesets.repository';
import { RulesetsService } from './rulesets.service';
import { RulesetsController } from './rulesets.controller';
import { MeetingsModule } from '../meetings';

@Module({
  imports: [MeetingsModule],
  controllers: [RulesetsController],
  providers: [RulesetsRepository, RulesetsService],
  exports: [RulesetsService],
})
export class RulesetsModule {}
