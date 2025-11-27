-- Make organizationId nullable to support global system templates
-- Migration: 0004_make_org_id_nullable_for_system_templates
-- Description: Allows wellness templates to have NULL organization_id for global system templates

-- Step 1: Make organization_id column nullable (idempotent)
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

-- Step 2: Add check constraint for system templates (idempotent)
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

-- Step 3: Add index for system templates (where organization_id IS NULL)
CREATE INDEX IF NOT EXISTS wellness_templates_system_null_org_idx
  ON wellness_templates (is_system_seeded, organization_id)
  WHERE is_system_seeded = true AND organization_id IS NULL;

-- Step 4: Add comment for documentation
COMMENT ON CONSTRAINT system_templates_null_org ON wellness_templates IS
  'System templates (is_system_seeded=true) must have NULL organization_id. Organization templates must have non-NULL organization_id.';

COMMENT ON INDEX wellness_templates_system_null_org_idx IS
  'Optimized index for querying global system templates (is_system_seeded=true, organization_id IS NULL)';
