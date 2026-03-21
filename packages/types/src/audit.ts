export interface AuditEvent {
  id: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata_json: unknown;
  occurred_at: string;
}
