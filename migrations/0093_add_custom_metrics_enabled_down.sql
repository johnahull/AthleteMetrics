-- Rollback Migration: Remove custom_metrics_enabled flag from organizations
-- Reverts: 0093_add_custom_metrics_enabled.sql

-- Remove custom_metrics_enabled column
ALTER TABLE organizations
DROP COLUMN IF EXISTS custom_metrics_enabled;
