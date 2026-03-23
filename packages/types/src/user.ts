export enum UserStatus {
  Active = 'active',
  Suspended = 'suspended',
  Deleted = 'deleted',
}

export type ThemePreference = 'light' | 'dark';

export type UserRole = 'user' | 'superuser';

export interface User {
  id: string;
  nickname: string;
  status: UserStatus;
  role: UserRole;
  theme: ThemePreference;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  deleted_at: string | null;
}

export interface PublicUser {
  id: string;
  nickname: string;
  role: UserRole;
  theme: ThemePreference;
}
