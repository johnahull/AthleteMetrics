-- Rollback: Convert sportAssociations from codes back to names
-- Description: Reverts site_metrics.sport_associations to use sport names (e.g., 'Soccer')
--              instead of sport codes (e.g., 'SOCCER')
-- Author: Claude Code
-- Date: 2025-12-17

-- Revert all metrics back to using sport names
UPDATE site_metrics
SET sport_associations = ARRAY(
  SELECT CASE
    WHEN unnest = 'SOCCER' THEN 'Soccer'
    WHEN unnest = 'BASKETBALL' THEN 'Basketball'
    WHEN unnest = 'VOLLEYBALL' THEN 'Volleyball'
    WHEN unnest = 'TENNIS' THEN 'Tennis'
    WHEN unnest = 'BASEBALL' THEN 'Baseball'
    WHEN unnest = 'FOOTBALL' THEN 'Football'
    ELSE unnest
  END
  FROM unnest(sport_associations)
)
WHERE sport_associations IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(sport_associations) AS sport
    WHERE sport ~ '^[A-Z0-9_]+$' -- Match uppercase codes like 'SOCCER' or 'BASKETBALL_5V5'
  );
