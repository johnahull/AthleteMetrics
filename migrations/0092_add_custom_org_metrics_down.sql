-- Rollback migration: Remove custom organization metrics table

-- Drop indexes first
DROP INDEX IF EXISTS idx_custom_org_metrics_org;
DROP INDEX IF EXISTS idx_custom_org_metrics_org_active;
DROP INDEX IF EXISTS idx_custom_org_metrics_code;
DROP INDEX IF EXISTS idx_custom_org_metrics_derived;

-- Drop table
DROP TABLE IF EXISTS custom_org_metrics CASCADE;
