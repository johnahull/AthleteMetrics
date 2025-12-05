-- Migration: Add OAuth authentication support (Google & Apple)
-- This migration adds support for OAuth authentication while maintaining backward compatibility
-- with existing username/password authentication

-- Make password nullable for OAuth-only accounts
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- Add OAuth provider fields
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN apple_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN oauth_provider TEXT CHECK (oauth_provider IN ('google', 'apple', 'password'));
ALTER TABLE users ADD COLUMN oauth_email TEXT;
ALTER TABLE users ADD COLUMN oauth_email_verified BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE users ADD COLUMN last_auth_method TEXT CHECK (last_auth_method IN ('password', 'google', 'apple'));
ALTER TABLE users ADD COLUMN account_linked_at TIMESTAMP;

-- Create account linking tokens table
CREATE TABLE account_linking_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_id TEXT NOT NULL,
  provider_email TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for OAuth lookups
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;
CREATE INDEX idx_account_linking_tokens_token ON account_linking_tokens(token);
CREATE INDEX idx_account_linking_tokens_user_id ON account_linking_tokens(user_id);
