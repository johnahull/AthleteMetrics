-- Rollback Migration: Revert metric_type enum back to lower_is_better boolean
-- WARNING: This will convert 'tracking' metrics to 'higher_is_better' (false) by default

-- Step 1: Add the lower_is_better column back
ALTER TABLE site_metrics
ADD COLUMN IF NOT EXISTS lower_is_better BOOLEAN;

-- Step 2: Migrate data back from metric_type to lower_is_better
-- Note: 'tracking' metrics will become higher_is_better (false) since there's no boolean equivalent
UPDATE site_metrics
SET lower_is_better = CASE
  WHEN metric_type = 'lower_is_better' THEN true
  ELSE false
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
