-- Rollback Migration: Remove audit_logs table
-- Description: Drops audit_logs table and its indexes
-- Created: 2025-10-14

-- Drop all indexes first (must match migration file)
DROP INDEX IF EXISTS audit_logs_created_at_idx;
DROP INDEX IF EXISTS audit_logs_resource_idx;
DROP INDEX IF EXISTS audit_logs_action_idx;
DROP INDEX IF EXISTS audit_logs_user_time_idx;

-- Drop table (CASCADE ensures all constraints are removed)
DROP TABLE IF EXISTS audit_logs CASCADE;
