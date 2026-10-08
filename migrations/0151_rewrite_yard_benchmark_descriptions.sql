-- Migration 0151: rewrite the descriptions of the copied yard 5-0-5 benchmarks
--
-- Follow-up from the #518 review (issue #541, item 4).
--
-- 0144 (Block E) created a yard twin of every metric-protocol 5-0-5 benchmark with
-- benchmark_value = ROUND(metric value x 0.914, 3) but copied the research text
-- verbatim after a one-sentence prefix, so a yard row with value 2.450 still said
-- "< 2.68s" (the metric threshold). Coaches reading the benchmark see two different
-- numbers for the same row.
--
-- Decision (documented here because the wording is a product call):
--   * The free-text notes embed metric-protocol seconds in many shapes ("< 2.68s",
--     "~2.51 +/- 0.14s", "Mid of 2.55-2.70", "mean 2.64-2.68s") next to numbers that must
--     NOT be scaled (ICC 0.99, years, percentages). Converting them by pattern would
--     silently corrupt some, so the notes are NOT rewritten. They are kept verbatim
--     and labelled as the metric-protocol source note.
--   * The sentence in front of them is regenerated from the row's own yard value, so
--     the row now states one threshold and it agrees with benchmark_value:
--       Approximate yard-protocol threshold of <= 2.450 s, converted from
--       metric-protocol research (x0.914); recalibrate with BTA data. Metric-protocol
--       source note (times in seconds, not converted): < 2.68s. Jones 2018 ...
--     (>= / = for gte / eq; "range of A to B s" for range rows; when the old text had
--     no note after the prefix, the source-note sentence is omitted.)
--
-- Column precision (the other half of item 4) needs no change: site_benchmarks and
-- custom_benchmarks min_value / max_value are numeric(10,3) in migration-built
-- databases (0076 added them as (10,2), 0079 widened them to (10,3)) and #520 aligned the Drizzle schema, so
-- ROUND(x * 0.914, 3) is stored without loss. The only yard rows with min/max are the
-- unitless LSI tiers, which 0144 copies with factor 1 and are not touched here.
--
-- Scope: site_benchmarks on AGILITY_505_YD / _YD_L / _YD_R whose description still
-- starts with 0144's exact prefix. Admin-edited text, NULL descriptions, the metric
-- rows and the LSI tiers do not match and are left alone. Re-running is a no-op (the
-- new text no longer starts with that prefix). Environments that have not run 0144
-- yet get 0144's copy and then this rewrite in the same deploy.
--
-- Reversible: 0151_rewrite_yard_benchmark_descriptions_down.sql restores the exact
-- previous text (prefix + one space + note).
--
-- Transaction supplied by the runner; no BEGIN/COMMIT.

UPDATE site_benchmarks sb
   SET description =
         'Approximate yard-protocol '
         || CASE
              WHEN sb.comparison_operator = 'range' AND sb.min_value IS NOT NULL AND sb.max_value IS NOT NULL
                THEN 'range of ' || sb.min_value::text || ' to ' || sb.max_value::text || ' s'
              WHEN sb.benchmark_value IS NOT NULL
                THEN 'threshold of '
                     || CASE sb.comparison_operator
                          WHEN 'lte' THEN E'≤ '
                          WHEN 'gte' THEN E'≥ '
                          ELSE '= '
                        END
                     || sb.benchmark_value::text || ' s'
              ELSE 'threshold'
            END
         || ', converted from metric-protocol research (x0.914); recalibrate with BTA data.'
         || CASE
              WHEN length(sb.description) > length(p.prefix)
                THEN ' Metric-protocol source note (times in seconds, not converted):' || substr(sb.description, length(p.prefix) + 1)
              ELSE ''
            END
  FROM (SELECT 'Approximate: converted from metric-protocol research (x0.914); recalibrate with BTA data.'::text AS prefix) p
 WHERE sb.metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R')
   AND left(sb.description, length(p.prefix)) = p.prefix;

DO $$
BEGIN
  RAISE NOTICE 'Migration 0151: yard 5-0-5 benchmark descriptions rewritten to match their yard values.';
END $$;
