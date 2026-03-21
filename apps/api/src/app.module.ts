import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database';
import { CommonModule } from './common';
import { AuthModule } from './auth';
import { UsersModule } from './users';
import { MeetingsModule } from './meetings';
import { InvitesModule } from './invites';
import { MembershipsModule } from './memberships';
import { PhraseSetsModule } from './phrase-sets';
import { RulesetsModule } from './rulesets';
import { GamesModule } from './games';
import { GameplayModule } from './gameplay';
import { ChatModule } from './chat';
import { ExportsModule } from './exports';
import { WsModule } from './websocket';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 60,
      },
    ]),
    AuthModule,
    UsersModule,
    MeetingsModule,
    InvitesModule,
    MembershipsModule,
    PhraseSetsModule,
    RulesetsModule,
    GamesModule,
    GameplayModule,
    ChatModule,
    ExportsModule,
    WsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
