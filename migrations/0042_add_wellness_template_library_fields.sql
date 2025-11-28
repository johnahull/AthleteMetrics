-- ============================================================================
-- Migration: Add Wellness Template Library Fields
-- ============================================================================
-- Purpose: Add category, tags, is_system_seeded, and source_template_id fields
--          to wellness_templates table and make organization_id nullable
-- Author: Database Schema Agent
-- Date: 2025-11-28
--
-- This migration consolidates drizzle migrations 0003 and 0004 that were
-- missing snapshot files and therefore not being applied to production.
-- ============================================================================

-- Part 1: Add library fields to wellness_templates table (from drizzle 0003)
ALTER TABLE "wellness_templates"
  ADD COLUMN IF NOT EXISTS "category" text,
  ADD COLUMN IF NOT EXISTS "tags" text[],
  ADD COLUMN IF NOT EXISTS "is_system_seeded" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "source_template_id" varchar;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "wellness_templates_category_idx" ON "wellness_templates" ("category");
CREATE INDEX IF NOT EXISTS "wellness_templates_system_seeded_idx" ON "wellness_templates" ("is_system_seeded");

-- Add comments for documentation
COMMENT ON COLUMN "wellness_templates"."source_template_id" IS 'ID of template this was cloned from (self-reference without FK to allow deleting source templates)';
COMMENT ON COLUMN "wellness_templates"."category" IS 'Template category for library browsing (e.g., general, recovery, performance, injury, training)';
COMMENT ON COLUMN "wellness_templates"."tags" IS 'Searchable tags for filtering (e.g., [daily, wellness, fatigue])';
COMMENT ON COLUMN "wellness_templates"."is_system_seeded" IS 'True for pre-built system templates seeded by administrators';

-- Part 2: Make organization_id nullable for system templates (from drizzle 0004)

-- Make organization_id column nullable (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wellness_templates'
    AND column_name = 'organization_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE wellness_templates ALTER COLUMN organization_id DROP NOT NULL;
  END IF;
END $$;

-- Add check constraint for system templates (idempotent)
-- System templates (is_system_seeded=true) must have NULL organization_id
-- Organization templates must have non-NULL organization_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'system_templates_null_org'
  ) THEN
    ALTER TABLE wellness_templates
      ADD CONSTRAINT system_templates_null_org CHECK (
        (is_system_seeded = true AND organization_id IS NULL) OR
        (is_system_seeded = false AND organization_id IS NOT NULL)
      );
  END IF;
END $$;

-- Add index for system templates (where organization_id IS NULL)
CREATE INDEX IF NOT EXISTS wellness_templates_system_null_org_idx
  ON wellness_templates (is_system_seeded, organization_id)
  WHERE is_system_seeded = true AND organization_id IS NULL;

-- Add constraint comments
DO $$
BEGIN
  COMMENT ON CONSTRAINT system_templates_null_org ON wellness_templates IS
    'System templates (is_system_seeded=true) must have NULL organization_id. Organization templates must have non-NULL organization_id.';
EXCEPTION WHEN undefined_object THEN
  NULL; -- Ignore if constraint doesn't exist
END $$;

COMMENT ON INDEX wellness_templates_system_null_org_idx IS
  'Optimized index for querying global system templates (is_system_seeded=true, organization_id IS NULL)';

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  col_count INT;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'wellness_templates'
  AND column_name IN ('category', 'tags', 'is_system_seeded', 'source_template_id');

  IF col_count < 4 THEN
    RAISE EXCEPTION 'Migration verification failed: expected 4 columns, found %', col_count;
  END IF;

  RAISE NOTICE 'Migration 0042 verified: All wellness library columns present';
END $$;
