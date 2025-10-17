-- Migration: Fix audit_logs.user_id to be nullable
-- Description: Ensures user_id column in audit_logs allows NULL values for compliance trail preservation
-- Created: 2025-10-16
-- Issue: Production database has NOT NULL constraint on user_id, causing errors during user deletion

-- Remove NOT NULL constraint from user_id column if it exists
-- This allows audit logs to be preserved even after users are deleted
ALTER TABLE audit_logs
ALTER COLUMN user_id DROP NOT NULL;

-- Verify the column definition is correct
COMMENT ON COLUMN audit_logs.user_id IS 'User who performed the action (NULL if user deleted, preserving audit trail)';
