-- Rollback migration: Remove index on account_linking_tokens.expires_at

DROP INDEX IF EXISTS idx_account_linking_tokens_expires_at;
