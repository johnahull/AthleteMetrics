-- Down Migration 0164: restore the Female SOCCER yard-sprint benchmarks to their 0129 / 0132 state
--
-- Literal prior value, description and is_active of all 15 rows, taken from a read-only production SELECT
-- on 2026-10-17 and cross-checked against 0129 / 0132. Rows 0164 only switched off get their (unchanged)
-- value and description written back too, which is a no-op for them. Each row is checked: a missing
-- row raises instead of being skipped. Forgets this migration's manual_migrations row so the next forward
-- deploy re-applies it. Athlete measurements are not touched.

DO $$
DECLARE
  r record;
  n integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('DASH_20YD', 'Soccer D1 Average', 3.12::numeric,
       'Mid of 3.05-3.20 (Lockie 30m derived); externally corroborated by recruiting standards. Confidence: MEDIUM-HIGH.'),
      ('DASH_30YD', 'Soccer D1 Average', 4.20::numeric,
       '~4.20s. Stankovic 2025 (national-team-selected female 30m: 4.49-4.78s × 0.914 yd conversion). Confidence: MEDIUM.'),
      ('DASH_40YD', 'Soccer D1 Average', 5.10::numeric,
       '~5.10s. Aggregated US recruiting data (NCSA, college program data). Confidence: MEDIUM-HIGH.'),
      ('DASH_40YD', 'Soccer D1 Top 25%', 4.95::numeric,
       '~4.95s. Sub-5.0s = recruiting elite threshold; All-American level. Confidence: MEDIUM-HIGH.'),
      ('DASH_40YD', 'HS MS Female Soccer (Ages 11-13) Average', 6.30::numeric,
       '~6.30s. Confidence: LOW — estimated, pending BTA internal data.'),
      ('DASH_40YD', 'HS JV Female Soccer (Ages 14-15) Average', 5.85::numeric,
       '~5.85s. Confidence: MEDIUM.'),
      ('DASH_40YD', 'HS Varsity Female Soccer (Ages 16-18) Average', 5.50::numeric,
       '~5.50s. Confidence: MEDIUM.'),
      ('DASH_20YD', 'Soccer D1 Top 25%', 2.95::numeric,
       'Auburn extrapolated. Confidence: MEDIUM.'),
      ('DASH_30YD', 'Soccer D1 Top 25%', 4.05::numeric,
       '~4.05s. Extrapolated from D1 elite 30m thresholds. Confidence: MEDIUM-LOW.'),
      ('DASH_30YD', 'HS Varsity Female Soccer (Ages 16-18) Average', 4.40::numeric,
       '~4.40s. Confidence: MEDIUM.'),
      ('DASH_40YD', 'HS Varsity Female Soccer (Ages 16-18) Top 25%', 5.20::numeric,
       '~5.20s. Approaches D1 Average — high-tier HS achievable. Confidence: MEDIUM.'),
      ('DASH_30YD', 'Soccer DII Threshold', 4.30::numeric,
       '< 4.30s. Extrapolated from D1 thresholds. Confidence: MEDIUM.'),
      ('DASH_40YD', 'Soccer DII Threshold', 5.30::numeric,
       '< 5.30s. NCSA recruiting standards. Confidence: MEDIUM-HIGH.'),
      ('DASH_30YD', 'Soccer DIII Threshold', 4.50::numeric,
       '< 4.50s. Extrapolated. Confidence: MEDIUM.'),
      ('DASH_40YD', 'Soccer DIII Threshold', 5.60::numeric,
       '< 5.60s. NCSA recruiting standards. Confidence: MEDIUM-HIGH.')
    ) AS t(code, nm, val, descr)
  LOOP
    UPDATE site_benchmarks
       SET benchmark_value = r.val, description = r.descr, is_active = true
     WHERE metric_code = r.code AND name = r.nm;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'Down 0164: expected 1 row for % / %, updated %', r.code, r.nm, n;
    END IF;
  END LOOP;

  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0164_correct_yard_sprint_benchmarks';
  END IF;
END $$;
