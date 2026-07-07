-- Migration 0138: Add password_reset_tokens table
--
-- Backs the password-reset flow (previously stubbed with no table). The raw
-- reset token is only ever delivered in the emailed link; only its SHA-256 hash
-- is persisted here, so a leaked database row cannot be used to reset a
-- password. Tokens are single-use (is_used) and expiring (expires_at).

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  is_used      BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at   TIMESTAMP NOT NULL,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx
  ON password_reset_tokens (token_hash);
