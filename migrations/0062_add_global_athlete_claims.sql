-- Migration: Add global_athlete_claims table for manual account linking
-- This enables athletes to claim/link additional email addresses to their global athlete identity

-- Create the claims table
CREATE TABLE IF NOT EXISTS global_athlete_claims (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  global_athlete_id VARCHAR NOT NULL REFERENCES global_athletes(id) ON DELETE CASCADE,
  claimed_email TEXT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS gac_global_athlete_idx ON global_athlete_claims(global_athlete_id);
CREATE INDEX IF NOT EXISTS gac_token_idx ON global_athlete_claims(token);
CREATE INDEX IF NOT EXISTS gac_email_idx ON global_athlete_claims(claimed_email);
CREATE INDEX IF NOT EXISTS gac_status_idx ON global_athlete_claims(status);
