-- Down Migration 0138: Drop password_reset_tokens table
--
-- Safe to drop: the table holds only short-lived, single-use reset tokens.
DROP TABLE IF EXISTS password_reset_tokens;
