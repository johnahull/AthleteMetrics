-- Migration: Clear sport associations from default system metrics
-- Description: Default metrics should have no sport associations (available to all sports)
-- Site admins can add sport tags as needed
-- Author: Claude Code
-- Date: 2025-12-17

-- Clear sport associations from all system default metrics
UPDATE site_metrics
SET sport_associations = NULL
WHERE is_system_default = true;
