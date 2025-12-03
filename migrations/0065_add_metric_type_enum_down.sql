-- Rollback Migration: Revert metric_type enum back to lower_is_better boolean
--
-- ⚠️  WARNING: DATA LOSS ON ROLLBACK ⚠️
-- This rollback migration will lose semantic information for tracking metrics (HEIGHT, WEIGHT).
-- All 'tracking' metrics will be converted to 'higher_is_better' (false), which is incorrect
-- semantically since tracking metrics have no performance direction.
--
-- If you need to rollback this migration, you will need to manually restore tracking metrics
-- like HEIGHT and WEIGHT after the rollback completes. Consider creating a backup of the
-- site_metrics table before rolling back.
--
-- To backup before rollback:
--   CREATE TABLE site_metrics_backup AS SELECT * FROM site_metrics;

-- Step 1: Add the lower_is_better column back
ALTER TABLE site_metrics
ADD COLUMN IF NOT EXISTS lower_is_better BOOLEAN;

-- Step 2: Migrate data back from metric_type to lower_is_better
-- ⚠️  'tracking' metrics (HEIGHT, WEIGHT) will become 'higher_is_better' (false)
-- ⚠️  This loses the semantic meaning that these metrics have no performance direction
UPDATE site_metrics
SET lower_is_better = CASE
  WHEN metric_type = 'lower_is_better' THEN true
  ELSE false  -- Both 'higher_is_better' AND 'tracking' become false
END
WHERE lower_is_better IS NULL;

-- Step 3: Set lower_is_better as NOT NULL with default
ALTER TABLE site_metrics
ALTER COLUMN lower_is_better SET DEFAULT true;

ALTER TABLE site_metrics
ALTER COLUMN lower_is_better SET NOT NULL;

-- Step 4: Drop the metric_type column and its constraint
ALTER TABLE site_metrics
DROP CONSTRAINT IF EXISTS site_metrics_metric_type_check;

DROP INDEX IF EXISTS site_metrics_metric_type_idx;

ALTER TABLE site_metrics
DROP COLUMN IF EXISTS metric_type;
