-- Rollback Migration: Remove audit_logs table
-- Description: Drops audit_logs table and its indexes
-- Created: 2025-10-14

-- Drop indexes first
DROP INDEX IF EXISTS audit_logs_action_idx;
DROP INDEX IF EXISTS audit_logs_user_time_idx;

-- Drop table
DROP TABLE IF EXISTS audit_logs;
