export interface Ruleset {
  id: string;
  meeting_id: string;
  name: string;
  board_rows: number;
  board_cols: number;
  free_square_enabled: boolean;
  free_square_label: string;
  horizontal_enabled: boolean;
  vertical_enabled: boolean;
  diagonal_enabled: boolean;
  late_join_enabled: boolean;
  created_at: string;
  updated_at: string;
}
