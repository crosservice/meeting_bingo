CREATE TABLE meeting_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'participant'
    CHECK (role IN ('owner', 'participant')),
  access_status TEXT NOT NULL DEFAULT 'active'
    CHECK (access_status IN ('active', 'revoked', 'left')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_memberships_meeting_user ON meeting_memberships (meeting_id, user_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_memberships_user ON meeting_memberships (user_id);
CREATE INDEX idx_memberships_meeting ON meeting_memberships (meeting_id);
