import { Module } from '@nestjs/common';
import { GamesRepository } from './games.repository';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { MeetingsModule } from '../meetings';
import { MembershipsModule } from '../memberships';
import { PhraseSetsModule } from '../phrase-sets';
import { RulesetsModule } from '../rulesets';

@Module({
  imports: [MeetingsModule, MembershipsModule, PhraseSetsModule, RulesetsModule],
  controllers: [GamesController],
  providers: [GamesRepository, GamesService],
  exports: [GamesService],
})
export class GamesModule {}
