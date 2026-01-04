-- Migration: Add performance indexes for custom org metrics
-- Feature: Organization Custom Metrics - Performance Optimization
-- Description: Adds composite indexes to optimize common query patterns

-- Add composite index for measurement validation queries
-- Used by CustomOrgMetricService.getMeasurementCount() when checking if a metric can be modified
-- Query pattern: WHERE metric = ? AND organization_id = ?
CREATE INDEX IF NOT EXISTS idx_measurements_metric_org
  ON measurements(metric, organization_id);

COMMENT ON INDEX idx_measurements_metric_org IS 'Composite index for measurement count queries when validating custom metric modifications';

-- Add composite index for label-based duplicate checking
-- Used by CustomOrgMetricService.getCustomOrgMetricByLabel() for duplicate detection
-- Query pattern: WHERE organization_id = ? AND label = ?
CREATE INDEX IF NOT EXISTS idx_custom_org_metrics_org_label
  ON custom_org_metrics(organization_id, label);

COMMENT ON INDEX idx_custom_org_metrics_org_label IS 'Composite index for duplicate label detection within an organization';
