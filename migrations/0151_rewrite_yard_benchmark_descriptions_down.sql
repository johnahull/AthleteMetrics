-- Down Migration 0151: restore the verbatim-copy descriptions on the yard 5-0-5 benchmarks
--
-- Reverses 0151 exactly for rows it rewrote: the generated sentence is replaced by 0144's
-- prefix and the labelled note goes back after it unchanged. Rows whose text does not have
-- the 0151 shape (admin edits) are left alone, so this is idempotent.
--
-- Tracking: the runner skips a migration by name once recorded, so the tracking row is
-- removed or the next forward deploy would silently skip 0151.
--
-- Transaction supplied by the runner; no BEGIN/COMMIT.

UPDATE site_benchmarks sb
   SET description =
         'Approximate: converted from metric-protocol research (x0.914); recalibrate with BTA data.'
         || CASE
              WHEN strpos(sb.description, m.marker) > 0
                THEN substr(sb.description, strpos(sb.description, m.marker) + length(m.marker))
              ELSE ''
            END
  FROM (SELECT ' Metric-protocol source note (times in seconds, not converted):'::text AS marker) m
 WHERE sb.metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R')
   AND sb.description ~ '^Approximate yard-protocol (threshold|range)[^,]*, converted from metric-protocol research \(x0\.914\); recalibrate with BTA data\.'
   AND (
     strpos(sb.description, m.marker) > 0
     OR sb.description ~ 'recalibrate with BTA data\.$'
   );

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0151_rewrite_yard_benchmark_descriptions';
  END IF;
  RAISE NOTICE 'Migration 0151 down complete: yard 5-0-5 benchmark descriptions restored.';
END $$;
