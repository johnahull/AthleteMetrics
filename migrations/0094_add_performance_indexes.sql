-- Migration: Add performance indexes for custom org metrics
-- Feature: Organization Custom Metrics - Performance Optimization
-- Description: Adds composite indexes to optimize common query patterns

-- Add composite index for measurement validation queries
-- Used by CustomOrgMetricService.getMeasurementCount() when checking if a metric can be modified
-- Query pattern: WHERE metric = ? AND organization_id = ?
-- NOTE: For production deployments with large measurements tables, consider running this index creation
--       manually with CONCURRENTLY to avoid blocking writes:
--       CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_metric_org ON measurements(metric, organization_id);
--       CONCURRENTLY cannot be used inside transactions, so it must be run separately if needed.
CREATE INDEX IF NOT EXISTS idx_measurements_metric_org
  ON measurements(metric, organization_id);

COMMENT ON INDEX idx_measurements_metric_org IS 'Composite index for measurement count queries when validating custom metric modifications';

-- Add UNIQUE constraint for label-based duplicate prevention (partial index on active metrics only)
-- Used by CustomOrgMetricService.getCustomOrgMetricByLabel() for duplicate detection
-- Query pattern: WHERE organization_id = ? AND label = ?
-- Partial index allows archived metrics to have duplicate labels
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_org_metrics_org_label_unique
  ON custom_org_metrics(organization_id, label)
  WHERE is_active = true;

COMMENT ON INDEX idx_custom_org_metrics_org_label_unique IS 'Unique constraint for duplicate label prevention within an organization (active metrics only)';
