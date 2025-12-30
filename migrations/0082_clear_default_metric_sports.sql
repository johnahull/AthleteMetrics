-- Migration: Clear sport associations from default system metrics
-- Description: Default metrics should have no sport associations (available to all sports)
-- Site admins can add sport tags as needed
-- Author: Claude Code
-- Date: 2025-12-17

-- Create backup table before clearing (enables rollback)
-- Drop and recreate to ensure it's populated on every run (idempotent)
-- Note: IF NOT EXISTS is redundant after DROP but satisfies linter requirements
DROP TABLE IF EXISTS site_metrics_sport_backup_20251217;
CREATE TABLE IF NOT EXISTS site_metrics_sport_backup_20251217 AS
SELECT id, code, sport_associations, updated_at
FROM site_metrics
WHERE is_system_default = true AND sport_associations IS NOT NULL;

-- Clear sport associations from all system default metrics
UPDATE site_metrics
SET sport_associations = NULL
WHERE is_system_default = true;
