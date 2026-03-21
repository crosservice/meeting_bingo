CREATE TABLE rulesets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  board_rows INTEGER NOT NULL DEFAULT 5,
  board_cols INTEGER NOT NULL DEFAULT 5,
  free_square_enabled BOOLEAN NOT NULL DEFAULT true,
  free_square_label TEXT NOT NULL DEFAULT 'FREE',
  horizontal_enabled BOOLEAN NOT NULL DEFAULT true,
  vertical_enabled BOOLEAN NOT NULL DEFAULT true,
  diagonal_enabled BOOLEAN NOT NULL DEFAULT true,
  late_join_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rulesets_meeting ON rulesets (meeting_id);
