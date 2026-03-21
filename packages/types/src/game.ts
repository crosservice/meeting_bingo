export enum GameStatus {
  Draft = 'draft',
  Active = 'active',
  Won = 'won',
  Closed = 'closed',
  Expired = 'expired',
}

export interface Game {
  id: string;
  meeting_id: string;
  created_by_user_id: string;
  phrase_set_snapshot_json: unknown;
  ruleset_snapshot_json: unknown;
  status: GameStatus;
  started_at: string | null;
  ended_at: string | null;
  winner_user_id: string | null;
  winning_card_snapshot_json: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface GameCard {
  id: string;
  game_id: string;
  user_id: string;
  card_seed: string;
  generated_at: string;
  updated_at: string;
}

export interface CardCell {
  id: string;
  game_card_id: string;
  row_index: number;
  col_index: number;
  phrase_text: string;
  phrase_key: string;
  is_free_square: boolean;
  current_count: number;
  created_at: string;
  updated_at: string;
}

export type MarkDelta = 1 | -1;

export interface PhraseMarkEvent {
  id: string;
  game_id: string;
  game_card_id: string;
  user_id: string;
  card_cell_id: string;
  delta: MarkDelta;
  resulting_count: number;
  occurred_at: string;
  client_event_id: string;
  request_id: string;
  session_id: string;
  ip_hash: string | null;
}
