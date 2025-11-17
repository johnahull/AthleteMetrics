-- Migration 0039: Add AI Flag Hierarchy Constraint
-- Purpose: Enforce that aiEnabled can only be true when aiEnabledBySiteAdmin is true
-- Author: Claude Code (Code Review Fix)
-- Date: 2025-11-17

-- Add CHECK constraint to enforce hierarchical permission
ALTER TABLE organizations ADD CONSTRAINT organizations_ai_hierarchy_check
  CHECK (
    (ai_enabled = FALSE) OR
    (ai_enabled = TRUE AND ai_enabled_by_site_admin = TRUE)
  );

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT organizations_ai_hierarchy_check ON organizations IS
  'Ensures ai_enabled can only be true when ai_enabled_by_site_admin is also true (hierarchical permission enforcement)';
