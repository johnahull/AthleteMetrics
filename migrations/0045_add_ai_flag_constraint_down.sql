-- Rollback Migration 0045: Remove AI flag hierarchy constraint

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_ai_flag_hierarchy;
