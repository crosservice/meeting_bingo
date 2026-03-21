import { Module, Global, Logger } from '@nestjs/common';
import { Pool } from 'pg';

const DATABASE_POOL = 'DATABASE_POOL';

const poolProvider = {
  provide: DATABASE_POOL,
  useFactory: async () => {
    const logger = new Logger('DatabaseModule');

    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://meeting_bingo:changeme@localhost:5432/meeting_bingo',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Verify connectivity
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        logger.log('Database connection established');
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error(
        'Database connection failed. App will start but DB operations will fail.',
        (err as Error).message,
      );
    }

    return pool;
  },
};

@Global()
@Module({
  providers: [poolProvider],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}

export { DATABASE_POOL };
