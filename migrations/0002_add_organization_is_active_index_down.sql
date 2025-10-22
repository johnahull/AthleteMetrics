-- Rollback Migration: Remove organizations.is_active index and constraint
-- Date: 2025-10-13
-- Related PR: #118

-- Remove consistency constraint
ALTER TABLE organizations
DROP CONSTRAINT IF EXISTS check_is_active_deleted_at_consistency;

-- Remove partial index for active organizations
DROP INDEX CONCURRENTLY IF EXISTS organizations_is_active_idx;
