-- Migration 0176: the 10/5 repeat hop metrics apply to every sport
--
-- RSI_105_HEIGHT and RSI_105_GCT were created by 0175 with {Soccer} (its COALESCE fallback), and RSI_105 may carry an admin-set
-- tag. The 10/5 repeat hop is not a soccer test, so sport_associations is cleared to NULL, which means "all sports" (the
-- organization metrics sport filter and validateSportAssociations both treat NULL as general).
--
-- Scope: RSI_105, RSI_105_HEIGHT and RSI_105_GCT only. Plain RSI is not touched.
-- This also clears a tag an admin set on purpose on one of these three codes; the prior value is kept in
-- site_metrics_sport_backup_0176 (NULL included) so the down migration restores each row exactly.
-- Idempotent: the backup is created once and never overwritten (ON CONFLICT DO NOTHING), and only rows that still have a
-- tag are updated, so a second run changes nothing. A missing code is simply not touched.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- Number is provisional: renumber at merge if another branch lands 0176 first.

CREATE TABLE IF NOT EXISTS site_metrics_sport_backup_0176 (
  code TEXT PRIMARY KEY,
  sport_associations TEXT[]
);

INSERT INTO site_metrics_sport_backup_0176 (code, sport_associations)
SELECT code, sport_associations
  FROM site_metrics
 WHERE code IN ('RSI_105', 'RSI_105_HEIGHT', 'RSI_105_GCT')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_cleared INTEGER;
BEGIN
  UPDATE site_metrics
     SET sport_associations = NULL, updated_at = now()
   WHERE code IN ('RSI_105', 'RSI_105_HEIGHT', 'RSI_105_GCT')
     AND sport_associations IS NOT NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  RAISE NOTICE 'Migration 0176 complete: cleared sport associations on % of the 10/5 repeat hop metrics (all sports).', v_cleared;
END $$;
