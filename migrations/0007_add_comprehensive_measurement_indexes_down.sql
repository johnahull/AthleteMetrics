-- Rollback: Remove comprehensive measurement indexes
-- Date: 2025-10-16
-- Purpose: Rollback migration 0007 if needed
--
-- WARNING: Rolling back this migration will significantly degrade query performance
-- for user deletion, analytics, and user profile operations. Only rollback if:
-- 1. The indexes are causing write performance issues (unlikely with modern PostgreSQL)
-- 2. Storage constraints require removing indexes temporarily
-- 3. Migration caused unexpected issues (report as bug)

-- Remove composite index
DROP INDEX IF EXISTS idx_measurements_user_date;

-- Remove team analytics index
DROP INDEX IF EXISTS idx_measurements_team_id;

-- Remove analytics date/metric index
DROP INDEX IF EXISTS idx_measurements_date_metric;

-- Remove verified_by index
DROP INDEX IF EXISTS idx_measurements_verified_by;

-- Remove submitted_by index
DROP INDEX IF EXISTS idx_measurements_submitted_by;

-- Restore the basic user_id index that was removed in the forward migration
-- This index was created in migration 0006
CREATE INDEX IF NOT EXISTS idx_measurements_user_id ON measurements(user_id);
