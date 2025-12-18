-- Migration: Add security_events table for audit logging
-- Description: Creates security_events table to log authorization failures and other security events

CREATE TABLE IF NOT EXISTS security_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for querying events by user
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id, created_at DESC);

-- Index for querying events by IP address (for rate limiting and suspicious activity detection)
CREATE INDEX IF NOT EXISTS idx_security_events_ip_address ON security_events(ip_address, created_at DESC);

-- Index for querying events by type and severity
CREATE INDEX IF NOT EXISTS idx_security_events_type_severity ON security_events(event_type, severity, created_at DESC);

-- Index for querying recent critical events
CREATE INDEX IF NOT EXISTS idx_security_events_severity_created ON security_events(severity, created_at DESC) WHERE severity = 'critical';
