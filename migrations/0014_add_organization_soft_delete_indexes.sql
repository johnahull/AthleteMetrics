-- Migration: Add indexes for organization soft delete columns
-- Purpose: Improve query performance for soft delete filtering
-- Date: 2025-10-24

-- Add index for is_active column (used frequently in WHERE clauses)
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active);

-- Add partial index for deleted_at column (only indexes non-null values for efficiency)
CREATE INDEX IF NOT EXISTS idx_organizations_deleted_at ON organizations(deleted_at)
WHERE deleted_at IS NOT NULL;
