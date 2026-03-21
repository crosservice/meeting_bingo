import { Module } from '@nestjs/common';
import { ExportsRepository } from './exports.repository';
import { ExportsService } from './exports.service';
import { ExportsController } from './exports.controller';
import { AnalysisPromptsController } from './analysis-prompts.controller';
import { MeetingsModule } from '../meetings';

@Module({
  imports: [MeetingsModule],
  controllers: [ExportsController, AnalysisPromptsController],
  providers: [ExportsRepository, ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
