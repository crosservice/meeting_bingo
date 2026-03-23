-- Add role column to users table for superuser support
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- Add last_login_ip for admin visibility
ALTER TABLE users ADD COLUMN last_login_ip TEXT;

-- Index for quick superuser lookups
CREATE INDEX idx_users_role ON users (role) WHERE role != 'user';
