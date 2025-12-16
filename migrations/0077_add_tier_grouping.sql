-- Migration 0077: Add tier grouping support to benchmarks
-- Enables multi-tier benchmarks (e.g., Elite: 4.2-4.4s, Excellent: 4.4-4.6s, Good: 4.6-4.8s)

-- Add tier columns to site_benchmarks
ALTER TABLE site_benchmarks
  ADD COLUMN IF NOT EXISTS tier_group_id UUID,
  ADD COLUMN IF NOT EXISTS tier_order INTEGER,
  ADD COLUMN IF NOT EXISTS tier_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tier_color VARCHAR(20);

-- Add tier columns to custom_benchmarks
ALTER TABLE custom_benchmarks
  ADD COLUMN IF NOT EXISTS tier_group_id UUID,
  ADD COLUMN IF NOT EXISTS tier_order INTEGER,
  ADD COLUMN IF NOT EXISTS tier_name VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tier_color VARCHAR(20);

-- Add constraint: tier benchmarks require tier_order and tier_name when tier_group_id is set
-- This ensures data integrity for tier-grouped benchmarks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'site_benchmarks' AND constraint_name = 'chk_tier_fields'
  ) THEN
    ALTER TABLE site_benchmarks
      ADD CONSTRAINT chk_tier_fields
      CHECK (tier_group_id IS NULL OR (tier_order IS NOT NULL AND tier_name IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_benchmarks' AND constraint_name = 'chk_tier_fields_custom'
  ) THEN
    ALTER TABLE custom_benchmarks
      ADD CONSTRAINT chk_tier_fields_custom
      CHECK (tier_group_id IS NULL OR (tier_order IS NOT NULL AND tier_name IS NOT NULL));
  END IF;
END $$;

-- Add indexes for tier queries (filtering/sorting by tier_group_id and tier_order)
CREATE INDEX IF NOT EXISTS site_benchmarks_tier_group_idx
  ON site_benchmarks(tier_group_id, tier_order)
  WHERE tier_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS custom_benchmarks_tier_group_idx
  ON custom_benchmarks(tier_group_id, tier_order)
  WHERE tier_group_id IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN site_benchmarks.tier_group_id IS 'Groups related tier benchmarks together (e.g., all Elite/Excellent/Good tiers for same metric)';
COMMENT ON COLUMN site_benchmarks.tier_order IS 'Ranking within tier group (1 = best tier, 2 = second best, etc.)';
COMMENT ON COLUMN site_benchmarks.tier_name IS 'Display name for this tier (e.g., Elite, Excellent, Good)';
COMMENT ON COLUMN site_benchmarks.tier_color IS 'Color for UI display (e.g., gold, silver, bronze)';

COMMENT ON COLUMN custom_benchmarks.tier_group_id IS 'Groups related tier benchmarks together (e.g., all Elite/Excellent/Good tiers for same metric)';
COMMENT ON COLUMN custom_benchmarks.tier_order IS 'Ranking within tier group (1 = best tier, 2 = second best, etc.)';
COMMENT ON COLUMN custom_benchmarks.tier_name IS 'Display name for this tier (e.g., Elite, Excellent, Good)';
COMMENT ON COLUMN custom_benchmarks.tier_color IS 'Color for UI display (e.g., gold, silver, bronze)';
