import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database';

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async log(
    actorUserId: string | null,
    entityType: string,
    entityId: string,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (actor_user_id, entity_type, entity_id, action, metadata_json)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorUserId, entityType, entityId, action, metadata ? JSON.stringify(metadata) : null],
    );
  }
}
