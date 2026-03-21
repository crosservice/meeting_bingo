export enum ModerationStatus {
  Visible = 'visible',
  Hidden = 'hidden',
  Flagged = 'flagged',
}

export interface ChatMessage {
  id: string;
  meeting_id: string;
  game_id: string | null;
  user_id: string;
  nickname_snapshot: string;
  message_text: string;
  moderation_status: ModerationStatus;
  created_at: string;
  edited_at: string | null;
  hidden_at: string | null;
  hidden_by_user_id: string | null;
}
