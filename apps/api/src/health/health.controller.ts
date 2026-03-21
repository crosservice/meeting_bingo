import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    let dbStatus = 'down';
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        dbStatus = 'up';
      } finally {
        client.release();
      }
    } catch {
      dbStatus = 'down';
    }

    const isReady = dbStatus === 'up';
    return {
      status: isReady ? 'ok' : 'degraded',
      checks: {
        api: 'up',
        database: dbStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
