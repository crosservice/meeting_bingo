CREATE TABLE game_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  card_seed TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_game_cards_game_user ON game_cards (game_id, user_id);
CREATE INDEX idx_game_cards_game ON game_cards (game_id);

CREATE TABLE card_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_card_id UUID NOT NULL REFERENCES game_cards(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  col_index INTEGER NOT NULL,
  phrase_text TEXT NOT NULL,
  phrase_key TEXT NOT NULL,
  is_free_square BOOLEAN NOT NULL DEFAULT false,
  current_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_card_cells_card_position ON card_cells (game_card_id, row_index, col_index);
CREATE INDEX idx_card_cells_card ON card_cells (game_card_id);
