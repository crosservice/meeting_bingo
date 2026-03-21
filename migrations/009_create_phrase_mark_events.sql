-- Immutable append-only event table. No UPDATE or DELETE should be issued against this table.
CREATE TABLE phrase_mark_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  game_card_id UUID NOT NULL REFERENCES game_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  card_cell_id UUID NOT NULL REFERENCES card_cells(id) ON DELETE CASCADE,
  delta SMALLINT NOT NULL CHECK (delta IN (1, -1)),
  resulting_count INTEGER NOT NULL CHECK (resulting_count >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_event_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  ip_hash TEXT
);

CREATE UNIQUE INDEX idx_mark_events_client_event ON phrase_mark_events (game_id, client_event_id);
CREATE INDEX idx_mark_events_game ON phrase_mark_events (game_id);
CREATE INDEX idx_mark_events_card ON phrase_mark_events (game_card_id);
CREATE INDEX idx_mark_events_cell ON phrase_mark_events (card_cell_id);
CREATE INDEX idx_mark_events_occurred ON phrase_mark_events (game_id, occurred_at);
