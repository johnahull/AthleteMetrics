-- Migration: Add Global Athlete System for Cross-Organization Linking
-- Description: Creates tables for canonical athlete identity and cross-org linking

-- Create global_athletes table (canonical athlete identity)
CREATE TABLE global_athletes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Verified identity information
  verified_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  primary_email TEXT,
  -- Canonical profile (denormalized for display)
  canonical_first_name TEXT NOT NULL,
  canonical_last_name TEXT NOT NULL,
  canonical_full_name TEXT NOT NULL,
  birth_date DATE,
  -- Privacy preferences
  allow_cross_org_linking BOOLEAN NOT NULL DEFAULT true,
  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,
  created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for global_athletes
CREATE INDEX global_athletes_verified_emails_gin ON global_athletes USING GIN (verified_emails);
CREATE INDEX global_athletes_primary_email_idx ON global_athletes (primary_email);
CREATE INDEX global_athletes_canonical_name_idx ON global_athletes (canonical_first_name, canonical_last_name);

-- Create user_global_athlete_links table (links user accounts to global athletes)
CREATE TABLE user_global_athlete_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  global_athlete_id VARCHAR NOT NULL REFERENCES global_athletes(id) ON DELETE CASCADE,
  -- Link status
  link_status TEXT NOT NULL DEFAULT 'pending' CHECK (link_status IN ('pending', 'confirmed', 'rejected', 'revoked')),
  link_type TEXT NOT NULL CHECK (link_type IN ('auto_email', 'athlete_claimed', 'org_proposed', 'admin_forced')),
  -- Approval workflow
  proposed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  proposed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confirmed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMP,
  -- Data sharing (per-link control)
  share_measurements BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- One user links to at most one global athlete
  CONSTRAINT user_global_athlete_links_user_id_unique UNIQUE (user_id)
);

-- Create indexes for user_global_athlete_links
CREATE INDEX ugal_global_athlete_id_idx ON user_global_athlete_links (global_athlete_id);
CREATE INDEX ugal_status_idx ON user_global_athlete_links (link_status);
CREATE INDEX ugal_global_confirmed_idx ON user_global_athlete_links (global_athlete_id, link_status);

-- Create global_athlete_audit_log table (audit trail)
CREATE TABLE global_athlete_audit_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  global_athlete_id VARCHAR NOT NULL REFERENCES global_athletes(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('athlete', 'org_admin', 'site_admin', 'system')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for global_athlete_audit_log
CREATE INDEX gaal_global_athlete_idx ON global_athlete_audit_log (global_athlete_id, created_at DESC);
CREATE INDEX gaal_action_idx ON global_athlete_audit_log (action, created_at DESC);

-- Add global_athlete_id column to measurements table for cross-org aggregation
ALTER TABLE measurements ADD COLUMN global_athlete_id VARCHAR;
CREATE INDEX measurements_global_athlete_idx ON measurements (global_athlete_id, date DESC) WHERE global_athlete_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE global_athletes IS 'Canonical athlete identity for cross-organization linking';
COMMENT ON TABLE user_global_athlete_links IS 'Links user accounts to their global athlete identity';
COMMENT ON TABLE global_athlete_audit_log IS 'Audit trail for global athlete identity changes';
COMMENT ON COLUMN measurements.global_athlete_id IS 'Reference to global athlete for cross-org measurement aggregation';
