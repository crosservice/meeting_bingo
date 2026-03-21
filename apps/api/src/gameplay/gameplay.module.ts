import { Module } from '@nestjs/common';
import { GameplayService } from './gameplay.service';
import { GameplayController } from './gameplay.controller';

@Module({
  controllers: [GameplayController],
  providers: [GameplayService],
  exports: [GameplayService],
})
export class GameplayModule {}
