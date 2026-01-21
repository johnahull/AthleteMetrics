-- Migration: 0101_add_organization_benchmark_sets
-- Description: Add organization_benchmark_sets table for org-level site benchmark set visibility control
-- Date: 2026-01-18
--
-- Purpose:
-- Allows org admins to hide/disable site-level benchmark sets for their organization.
-- Default behavior: No row = site set IS visible (auto-visible by default)
-- Disabled: Row with is_enabled = false = site set hidden for org
-- Re-enabled: Row with is_enabled = true = explicitly re-enabled

-- Create the organization_benchmark_sets table
CREATE TABLE IF NOT EXISTS organization_benchmark_sets (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_set_id VARCHAR NOT NULL REFERENCES benchmark_sets(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,
  CONSTRAINT organization_benchmark_sets_unique UNIQUE(organization_id, site_set_id)
);

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS org_benchmark_sets_org_idx ON organization_benchmark_sets(organization_id);
CREATE INDEX IF NOT EXISTS org_benchmark_sets_org_enabled_idx ON organization_benchmark_sets(organization_id, is_enabled);

-- Add comment for documentation
COMMENT ON TABLE organization_benchmark_sets IS 'Tracks org-level visibility of site benchmark sets. No row = visible (default), is_enabled=false = hidden.';
