-- Meeting owner settings: disable chat, anonymize nicknames
ALTER TABLE meetings ADD COLUMN chat_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE meetings ADD COLUMN anonymize_nicknames BOOLEAN NOT NULL DEFAULT false;

-- User preference: light/dark theme
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark'));
