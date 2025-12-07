-- Migration: Add failed attempts tracking to account linking tokens
-- This helps prevent brute force attacks on linking tokens

-- Add failed_attempts column (idempotent via IF NOT EXISTS)
ALTER TABLE account_linking_tokens ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0 NOT NULL;
