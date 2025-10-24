-- Migration: Add missing is_active and deleted_at columns to organizations
-- Purpose: Fix production schema inconsistency - these columns exist in schema but not in DB
-- Date: 2025-10-21
-- Issue: PR #144 deployment revealed that migration 0002 assumed these columns existed
--        but they were never actually added to the production database

-- Add is_active column with default true (all existing organizations are active)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add deleted_at column for soft delete support
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

COMMENT ON COLUMN organizations.is_active IS
  'Active status of organization. True = active, False = deactivated. Deactivated organizations prevent member login.';

COMMENT ON COLUMN organizations.deleted_at IS
  'Soft delete timestamp. NULL = active, non-NULL = deleted. Deleted organizations are hidden from normal queries.';
