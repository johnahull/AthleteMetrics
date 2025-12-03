-- Migration: Add metric_type enum to replace lower_is_better boolean
-- Description: Introduces a 3-value metric_type column to support tracking metrics like HEIGHT/WEIGHT
--              that are neither "higher is better" nor "lower is better"
--
-- Valid metric_type values:
--   - lower_is_better: Decreasing values = improvement (e.g., FLY10_TIME, DASH_40YD)
--   - higher_is_better: Increasing values = improvement (e.g., VERTICAL_JUMP, TOP_SPEED)
--   - tracking: No better/worse direction, just informational (e.g., HEIGHT, WEIGHT)

-- Step 1: Add the new metric_type column with default value
-- Using text type with CHECK constraint instead of enum for easier migration
ALTER TABLE site_metrics
ADD COLUMN IF NOT EXISTS metric_type TEXT;

-- Step 2: Add CHECK constraint for valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_metrics_metric_type_check'
  ) THEN
    ALTER TABLE site_metrics
    ADD CONSTRAINT site_metrics_metric_type_check
    CHECK (metric_type IN ('lower_is_better', 'higher_is_better', 'tracking'));
  END IF;
END $$;

-- Step 3: Migrate existing data based on lower_is_better boolean
-- Only update rows where metric_type is NULL (idempotent)
UPDATE site_metrics
SET metric_type = CASE
  WHEN lower_is_better = true THEN 'lower_is_better'
  ELSE 'higher_is_better'
END
WHERE metric_type IS NULL;

-- Step 4: Set metric_type as NOT NULL with default
ALTER TABLE site_metrics
ALTER COLUMN metric_type SET DEFAULT 'lower_is_better';

ALTER TABLE site_metrics
ALTER COLUMN metric_type SET NOT NULL;

-- Step 5: Drop the old lower_is_better column
ALTER TABLE site_metrics
DROP COLUMN IF EXISTS lower_is_better;

-- Step 6: Add index for metric_type queries
CREATE INDEX IF NOT EXISTS site_metrics_metric_type_idx
ON site_metrics(metric_type);

-- Step 7: Set HEIGHT and WEIGHT to 'tracking' type
-- These are informational metrics where neither higher nor lower is inherently "better"
UPDATE site_metrics
SET metric_type = 'tracking'
WHERE code IN ('HEIGHT', 'WEIGHT')
  AND metric_type != 'tracking';

-- Add comment for documentation
COMMENT ON COLUMN site_metrics.metric_type IS
'Metric performance direction: lower_is_better (time metrics), higher_is_better (performance metrics), tracking (informational only like height/weight)';
