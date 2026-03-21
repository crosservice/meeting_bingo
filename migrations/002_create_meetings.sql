CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  actual_start_at TIMESTAMPTZ,
  actual_end_at TIMESTAMPTZ,
  grace_minutes INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'open', 'in_progress', 'ended', 'closed', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_meetings_owner ON meetings (owner_user_id);
CREATE INDEX idx_meetings_status ON meetings (status);
CREATE INDEX idx_meetings_scheduled_start ON meetings (scheduled_start_at);
