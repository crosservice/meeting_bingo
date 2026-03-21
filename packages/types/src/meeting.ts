export enum MeetingStatus {
  Draft = 'draft',
  Scheduled = 'scheduled',
  Open = 'open',
  InProgress = 'in_progress',
  Ended = 'ended',
  Closed = 'closed',
  Deleted = 'deleted',
}

export interface Meeting {
  id: string;
  owner_user_id: string;
  name: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  grace_minutes: number;
  chat_enabled: boolean;
  anonymize_nicknames: boolean;
  status: MeetingStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MeetingInvite {
  id: string;
  meeting_id: string;
  token_hash: string;
  expires_at: string;
  max_uses: number | null;
  current_uses: number;
  revoked_at: string | null;
  created_by_user_id: string;
  created_at: string;
}

export enum MembershipRole {
  Owner = 'owner',
  Participant = 'participant',
}

export enum AccessStatus {
  Active = 'active',
  Revoked = 'revoked',
  Left = 'left',
}

export interface MeetingMembership {
  id: string;
  meeting_id: string;
  user_id: string;
  role: MembershipRole;
  access_status: AccessStatus;
  joined_at: string;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
  deleted_at: string | null;
}
