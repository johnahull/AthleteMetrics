-- Migration: COPPA Compliance Infrastructure
-- Implements verifiable parental consent (VPC) flow, audit trail, and
-- minor-data access controls required under COPPA (15 U.S.C. §§ 6501–6506).
--
-- All column additions use ADD COLUMN IF NOT EXISTS with sensible defaults
-- to ensure this migration is safe to apply to an existing production database
-- with zero downtime and zero impact on existing rows.
--
-- coppaStatus defaults 'not_applicable' → all existing users unaffected.
-- containsMinorData defaults false → existing snapshots remain public.

-- ============================================================================
-- 1. Extend: organizations table
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS coppa_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coppa_contact_email TEXT;

-- ============================================================================
-- 2. Extend: users table
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS coppa_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_email TEXT,
  -- Plain varchar, no FK constraint — referential integrity enforced at service layer
  -- to break the circular dependency: users → parental_consents → users
  ADD COLUMN IF NOT EXISTS parent_consent_id VARCHAR,
  ADD COLUMN IF NOT EXISTS coppa_consent_confirmed_at TIMESTAMP;

-- Enforce allowed coppa_status values
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_coppa_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_coppa_status_check
  CHECK (coppa_status IN ('not_applicable', 'pending_consent', 'needs_parent_email', 'consented', 'consent_revoked'));

CREATE INDEX IF NOT EXISTS users_coppa_status_idx ON users(coppa_status)
  WHERE coppa_status != 'not_applicable';

CREATE INDEX IF NOT EXISTS users_is_minor_idx ON users(is_minor)
  WHERE is_minor = true;

-- ============================================================================
-- 3. Extend: report_snapshots table
-- ============================================================================

ALTER TABLE report_snapshots
  ADD COLUMN IF NOT EXISTS contains_minor_data BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_access_restricted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS report_snapshots_minor_data_idx ON report_snapshots(contains_minor_data)
  WHERE contains_minor_data = true;

-- ============================================================================
-- 4. Create: parental_consents table
-- ============================================================================

CREATE TABLE IF NOT EXISTS parental_consents (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id VARCHAR REFERENCES organizations(id) ON DELETE SET NULL,
  parent_email TEXT NOT NULL,
  -- SHA-256 hash of the one-time token. NEVER store the raw token.
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  ai_consent_granted BOOLEAN,
  expires_at TIMESTAMP NOT NULL,
  confirmed_at TIMESTAMP,
  revoked_at TIMESTAMP,
  -- FTC-required audit fields
  initiated_ip VARCHAR(45),
  initiated_user_agent VARCHAR(500),
  confirmed_ip VARCHAR(45),
  confirmed_user_agent VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT parental_consents_status_check
    CHECK (status IN ('pending', 'confirmed', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS parental_consents_athlete_idx ON parental_consents(athlete_user_id);
CREATE INDEX IF NOT EXISTS parental_consents_status_idx ON parental_consents(status);
CREATE INDEX IF NOT EXISTS parental_consents_expires_idx ON parental_consents(expires_at);
CREATE INDEX IF NOT EXISTS parental_consents_token_hash_idx ON parental_consents(token_hash);

-- ============================================================================
-- 5. Create: parent_athlete_links table
-- ============================================================================

CREATE TABLE IF NOT EXISTS parent_athlete_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_email TEXT NOT NULL,
  athlete_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id VARCHAR REFERENCES organizations(id) ON DELETE SET NULL,
  consent_id VARCHAR, -- References parental_consents.id (no FK to avoid cascades)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parent_athlete_links_athlete_idx ON parent_athlete_links(athlete_user_id);
CREATE INDEX IF NOT EXISTS parent_athlete_links_parent_email_idx ON parent_athlete_links(parent_email);

-- ============================================================================
-- 6. Create: coppa_audit_log table (immutable — 5-year retention)
-- ============================================================================

CREATE TABLE IF NOT EXISTS coppa_audit_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Actor (null = system or parent without account)
  actor_user_id VARCHAR,
  actor_email TEXT,
  actor_ip VARCHAR(45),
  actor_user_agent VARCHAR(500),
  -- Subject
  athlete_user_id VARCHAR,
  consent_id VARCHAR,
  -- Event
  action VARCHAR(100) NOT NULL,
  details TEXT, -- JSON string, sanitized — NEVER contains raw tokens
  -- Retention: retain_until = created_at + 5 years (computed at insert)
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  retain_until TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS coppa_audit_log_athlete_idx ON coppa_audit_log(athlete_user_id);
CREATE INDEX IF NOT EXISTS coppa_audit_log_action_idx ON coppa_audit_log(action);
CREATE INDEX IF NOT EXISTS coppa_audit_log_created_at_idx ON coppa_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS coppa_audit_log_retain_until_idx ON coppa_audit_log(retain_until);

-- ============================================================================
-- 7. Create: data_deletion_requests table (P1 — parent hard delete)
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_email TEXT NOT NULL,
  consent_id VARCHAR,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  processed_by VARCHAR,
  notes TEXT,
  CONSTRAINT data_deletion_requests_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS data_deletion_requests_athlete_idx ON data_deletion_requests(athlete_user_id);
CREATE INDEX IF NOT EXISTS data_deletion_requests_status_idx ON data_deletion_requests(status);

-- ============================================================================
-- 8. Create: data_export_requests table (P1 — parent data portability)
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_export_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_email TEXT NOT NULL,
  consent_id VARCHAR,
  status TEXT NOT NULL DEFAULT 'pending',
  download_token TEXT, -- Hashed one-time download token
  download_expires_at TIMESTAMP,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  delivered_at TIMESTAMP,
  CONSTRAINT data_export_requests_status_check
    CHECK (status IN ('pending', 'processing', 'ready', 'delivered', 'expired'))
);

CREATE INDEX IF NOT EXISTS data_export_requests_athlete_idx ON data_export_requests(athlete_user_id);
CREATE INDEX IF NOT EXISTS data_export_requests_status_idx ON data_export_requests(status);
