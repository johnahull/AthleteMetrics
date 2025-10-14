-- Migration: Add audit_logs table
-- Description: Creates audit_logs table for security-sensitive operation tracking
-- Created: 2025-10-14

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id VARCHAR,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Foreign key with ON DELETE CASCADE to prevent blocking user deletion
  CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for efficient querying by user and time
CREATE INDEX IF NOT EXISTS audit_logs_user_time_idx ON audit_logs (user_id, created_at DESC);

-- Create index for querying by action type
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action, created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE audit_logs IS 'Audit log for security-sensitive operations with cascading delete on user removal';
COMMENT ON COLUMN audit_logs.user_id IS 'User who performed the action (cascades on delete)';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (e.g., site_admin_access, role_change, user_create, organization_deleted)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource affected (e.g., organization, user, team)';
COMMENT ON COLUMN audit_logs.resource_id IS 'ID of the affected resource';
COMMENT ON COLUMN audit_logs.details IS 'JSON string with additional context (sanitized to prevent log injection)';
COMMENT ON COLUMN audit_logs.ip_address IS 'IP address of the request';
COMMENT ON COLUMN audit_logs.user_agent IS 'User agent string of the request';
