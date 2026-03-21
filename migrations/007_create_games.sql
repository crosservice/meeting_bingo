CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  phrase_set_snapshot_json JSONB NOT NULL,
  ruleset_snapshot_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'won', 'closed', 'expired')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  winner_user_id UUID REFERENCES users(id),
  winning_card_snapshot_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_games_meeting ON games (meeting_id);
CREATE INDEX idx_games_status ON games (status);
CREATE INDEX idx_games_meeting_status ON games (meeting_id, status);
