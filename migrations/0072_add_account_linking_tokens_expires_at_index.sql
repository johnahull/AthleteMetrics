-- Migration: Add index on account_linking_tokens.expires_at for efficient token cleanup
-- This index improves performance when querying for expired tokens during cleanup operations

-- Create index for expires_at column (idempotent via IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_account_linking_tokens_expires_at ON account_linking_tokens(expires_at);
