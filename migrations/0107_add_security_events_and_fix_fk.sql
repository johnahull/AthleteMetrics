-- Migration: Add security_events table and fix email_verification_tokens FK
-- Description: Creates security_events table for audit logging and adds ON DELETE CASCADE
--              to email_verification_tokens.user_id foreign key
-- Idempotent: Yes (uses IF NOT EXISTS / conditional ALTER)

-- 1. Create security_events table
CREATE TABLE IF NOT EXISTS security_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_data TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  severity TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 2. Create indexes for security_events
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_address ON security_events(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_severity ON security_events(event_type, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity_created ON security_events(severity, created_at DESC) WHERE severity = 'critical';

-- 3. Fix email_verification_tokens FK to cascade on user deletion
-- Drop the old constraint and add a new one with ON DELETE CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'email_verification_tokens_user_id_users_id_fk'
      AND table_name = 'email_verification_tokens'
  ) THEN
    ALTER TABLE email_verification_tokens
      DROP CONSTRAINT email_verification_tokens_user_id_users_id_fk;
  END IF;

  ALTER TABLE email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
END $$;
