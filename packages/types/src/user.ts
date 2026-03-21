export enum UserStatus {
  Active = 'active',
  Suspended = 'suspended',
  Deleted = 'deleted',
}

export interface User {
  id: string;
  nickname: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  deleted_at: string | null;
}

export interface PublicUser {
  id: string;
  nickname: string;
}
