-- Migration: Add is_pinned column to reports table (idempotent)
-- Description: Allows users to pin up to 10 reports for quick access on reports page
-- Date: 2025-11-10
-- NOTE: BEGIN/COMMIT removed - transaction is handled by apply-manual-migrations.js
-- NOTE: This migration is idempotent - safe to run even if column/indexes already exist

-- Add is_pinned column (default false) - only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'is_pinned'
  ) THEN
    ALTER TABLE reports ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add index for faster queries filtering by pinned reports
CREATE INDEX IF NOT EXISTS idx_reports_is_pinned ON reports(is_pinned)
WHERE is_pinned = true;

-- Add partial index combining organization and pinned for faster org-scoped queries
CREATE INDEX IF NOT EXISTS idx_reports_org_pinned ON reports(organization_id, is_pinned)
WHERE is_pinned = true;

-- Add comment for documentation (safe to run multiple times)
COMMENT ON COLUMN reports.is_pinned IS 'Indicates if this report is pinned for quick access. Limit 10 per user enforced at application level.';
