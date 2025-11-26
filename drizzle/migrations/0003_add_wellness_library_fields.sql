-- Migration: Add Wellness Template Library Fields
-- Description: Add category, tags, is_system_seeded, and source_template_id fields to wellness_templates table
-- Author: Claude (test-driven-feature-agent)
-- Date: 2025-11-24

-- Add library fields to wellness_templates table
ALTER TABLE "wellness_templates"
  ADD COLUMN IF NOT EXISTS "category" text,
  ADD COLUMN IF NOT EXISTS "tags" text[],
  ADD COLUMN IF NOT EXISTS "is_system_seeded" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "source_template_id" varchar;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "wellness_templates_category_idx" ON "wellness_templates" ("category");
CREATE INDEX IF NOT EXISTS "wellness_templates_system_seeded_idx" ON "wellness_templates" ("is_system_seeded");

-- Add comment to clarify self-reference for source_template_id
COMMENT ON COLUMN "wellness_templates"."source_template_id" IS 'ID of template this was cloned from (self-reference without FK to allow deleting source templates)';
COMMENT ON COLUMN "wellness_templates"."category" IS 'Template category for library browsing (e.g., general, recovery, performance, injury, training)';
COMMENT ON COLUMN "wellness_templates"."tags" IS 'Searchable tags for filtering (e.g., [daily, wellness, fatigue])';
COMMENT ON COLUMN "wellness_templates"."is_system_seeded" IS 'True for pre-built system templates seeded by administrators';
