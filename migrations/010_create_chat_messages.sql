CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  nickname_snapshot TEXT NOT NULL,
  message_text TEXT NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_status IN ('visible', 'hidden', 'flagged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  hidden_at TIMESTAMPTZ,
  hidden_by_user_id UUID REFERENCES users(id)
);

CREATE INDEX idx_chat_messages_meeting ON chat_messages (meeting_id, created_at);
CREATE INDEX idx_chat_messages_user ON chat_messages (user_id);
