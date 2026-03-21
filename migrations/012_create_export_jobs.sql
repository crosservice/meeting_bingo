CREATE TABLE export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES users(id),
  export_type TEXT NOT NULL
    CHECK (export_type IN ('json', 'csv', 'zip')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX idx_export_jobs_meeting ON export_jobs (meeting_id);
CREATE INDEX idx_export_jobs_status ON export_jobs (status);
