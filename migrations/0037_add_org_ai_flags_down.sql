-- Migration 0037 Rollback: Remove Organization AI Flags
-- Purpose: Rollback AI feature flags from organizations table
-- Author: Claude Code (Coaching Insights Feature)
-- Date: 2025-11-17

-- Drop index first
DROP INDEX IF EXISTS organizations_ai_enabled_idx;

-- Remove columns
ALTER TABLE organizations DROP COLUMN IF EXISTS ai_enabled;
ALTER TABLE organizations DROP COLUMN IF EXISTS ai_enabled_by_site_admin;
