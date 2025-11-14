-- Rollback Migration: Remove is_pinned column from reports table
-- Description: Reverts the addition of is_pinned functionality
-- Date: 2025-11-10

BEGIN;

-- Drop indexes first
DROP INDEX IF EXISTS idx_reports_org_pinned;
DROP INDEX IF EXISTS idx_reports_is_pinned;

-- Drop the column
ALTER TABLE reports
DROP COLUMN IF EXISTS is_pinned;

COMMIT;
