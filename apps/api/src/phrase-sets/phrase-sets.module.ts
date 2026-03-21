import { Module } from '@nestjs/common';
import { PhraseSetsRepository } from './phrase-sets.repository';
import { PhraseSetsService } from './phrase-sets.service';
import { PhraseSetsController } from './phrase-sets.controller';
import { MeetingsModule } from '../meetings';

@Module({
  imports: [MeetingsModule],
  controllers: [PhraseSetsController],
  providers: [PhraseSetsRepository, PhraseSetsService],
  exports: [PhraseSetsService],
})
export class PhraseSetsModule {}
