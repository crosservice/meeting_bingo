// Board
export const BOARD_ROWS = 5;
export const BOARD_COLS = 5;
export const BOARD_SIZE = BOARD_ROWS * BOARD_COLS;
export const FREE_SQUARE_ROW = Math.floor(BOARD_ROWS / 2);
export const FREE_SQUARE_COL = Math.floor(BOARD_COLS / 2);
export const DEFAULT_FREE_SQUARE_LABEL = 'FREE';

// Meeting
export const GRACE_MINUTES_DEFAULT = 5;

// Chat
export const CHAT_RATE_LIMIT_MAX = 3;
export const CHAT_RATE_LIMIT_WINDOW_SECONDS = 10;

// Auth
export const ACCESS_TOKEN_EXPIRY_MINUTES = 15;
export const REFRESH_TOKEN_EXPIRY_DAYS = 7;

// Phrases
export const MIN_PHRASES_WITH_FREE_SQUARE = BOARD_SIZE - 1; // 24
export const MIN_PHRASES_WITHOUT_FREE_SQUARE = BOARD_SIZE; // 25

// Rate limits (requests per window)
export const LOGIN_RATE_LIMIT_MAX = 5;
export const LOGIN_RATE_LIMIT_WINDOW_MINUTES = 1;
export const REGISTER_RATE_LIMIT_MAX = 3;
export const REGISTER_RATE_LIMIT_WINDOW_MINUTES = 1;
export const INVITE_VALIDATE_RATE_LIMIT_MAX = 10;
export const INVITE_VALIDATE_RATE_LIMIT_WINDOW_MINUTES = 1;

// Ports
export const API_DEFAULT_PORT = 3001;
export const WEB_DEFAULT_PORT = 3000;
