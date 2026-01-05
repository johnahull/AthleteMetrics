-- Migration: Add custom_metrics_enabled flag to organizations
-- Feature: Site Admin Toggle for Custom Metrics per Organization
-- Description: Allows site admins to enable/disable custom metrics feature per organization

-- Add custom_metrics_enabled column with default false
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS custom_metrics_enabled BOOLEAN NOT NULL DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN organizations.custom_metrics_enabled IS
  'Site admin toggle to enable/disable custom metrics feature for this organization. Default: false (must opt-in)';
