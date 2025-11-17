-- Migration 0039 Rollback: Remove AI Flag Hierarchy Constraint
-- Purpose: Remove the hierarchical permission constraint
-- Author: Claude Code (Code Review Fix)
-- Date: 2025-11-17

-- Drop CHECK constraint
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_ai_hierarchy_check;
