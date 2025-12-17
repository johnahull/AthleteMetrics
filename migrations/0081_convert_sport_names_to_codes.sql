-- Migration: Convert sportAssociations from names to codes
-- Description: Updates site_metrics.sport_associations to use sport codes (e.g., 'SOCCER')
--              instead of sport names (e.g., 'Soccer')
-- Author: Claude Code
-- Date: 2025-12-17

-- Update all metrics that have 'Soccer' in sportAssociations to use 'SOCCER' instead
UPDATE site_metrics
SET sport_associations = ARRAY(
  SELECT CASE
    WHEN unnest = 'Soccer' THEN 'SOCCER'
    WHEN unnest = 'Basketball' THEN 'BASKETBALL'
    WHEN unnest = 'Volleyball' THEN 'VOLLEYBALL'
    WHEN unnest = 'Tennis' THEN 'TENNIS'
    WHEN unnest = 'Baseball' THEN 'BASEBALL'
    WHEN unnest = 'Football' THEN 'FOOTBALL'
    ELSE unnest -- Keep any codes that are already uppercase
  END
  FROM unnest(sport_associations)
)
WHERE sport_associations IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(sport_associations) AS sport
    WHERE sport ~ '^[A-Z][a-z]+$' -- Match mixed-case names like 'Soccer'
  );

-- Verify the migration
-- SELECT code, label, sport_associations
-- FROM site_metrics
-- WHERE sport_associations IS NOT NULL;
