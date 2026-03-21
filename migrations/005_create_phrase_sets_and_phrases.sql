CREATE TABLE phrase_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_phrase_sets_meeting ON phrase_sets (meeting_id);

CREATE TABLE phrases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase_set_id UUID NOT NULL REFERENCES phrase_sets(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_phrases_phrase_set ON phrases (phrase_set_id);
CREATE INDEX idx_phrases_normalized ON phrases (phrase_set_id, normalized_text)
  WHERE deleted_at IS NULL AND is_active = true;
