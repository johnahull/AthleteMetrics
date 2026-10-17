-- Migration 0164: correct the women's-soccer yard-sprint benchmarks (AM-FEAT-022)
--
-- The seeded Female SOCCER DASH_20YD / DASH_30YD / DASH_40YD benchmarks (0129, 0132) are much faster than the
-- only large electronically timed dataset found, Vescovi, Rupf, Brown & Marques 2011 (Scand J Med Sci Sports
-- 21:670-678; 113 college-age women, Brower gates, upright self-start, clock started at first movement). The
-- gap grows with distance: the seeded D1 40 yd average (5.10 s) is faster than anyone in that sample.
--
-- Re-sourced (value, description, is_active = true), time = distance / speed with 9.144 m per 10 yd:
--   D1 Average          20 yd 3.33 | 30 yd 4.61 | 40 yd 5.85 (median speed)
--   D1 Top 25%          40 yd 5.70 (75th-percentile speed 6.42 m/s)
--   HS MS (11-13)       40 yd 6.15 | HS JV (14-15) 40 yd 5.94 | HS Varsity (16-18) 40 yd Average 5.90
-- Switched off (is_active = false; value and description untouched, so a later release can re-enable them):
--   D1 Top 25% 20 yd and 30 yd (Table 1 percentiles for those splits not yet read from the paper),
--   HS Varsity 30 yd Average and 40 yd Top 25%, DII and DIII 30 yd and 40 yd thresholds (no source found).
-- Not touched: every DASH_10YD row, DII / DIII 20 yd, HS 20 / 30 yd except Varsity 30 yd, FLY10_TIME,
-- TOP_SPEED_MPH, AGILITY_505_M, JUMP_CMJ_HOH, male and volleyball rows, athlete measurements.
-- Saved eval reports keep their frozen gauge; they are not regenerated.
--
-- Row key is (metric_code, name). Each row is a plain UPDATE followed by a row-count check, so a prod row that
-- was renamed fails the migration loudly instead of being skipped or duplicated.
-- Idempotent (absolute values only). Reversible: 0164_correct_yard_sprint_benchmarks_down.sql.
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT here.

DO $$
DECLARE
  r record;
  n integer;
BEGIN
  -- Re-sourced rows: value, description, active
  FOR r IN
    SELECT * FROM (VALUES
      ('DASH_20YD', 'Soccer D1 Average', 3.33::numeric,
       '~3.33s. Vescovi 2011 (Scand J Med Sci Sports 21:670-678): n=113 college-age (18-21 yr) high-level US women. Brower infrared gates, upright self-start (athlete starts when ready), clock started at first movement (first-movement trigger). Mean cumulative speed 5.50 m/s over 18.3 m; time = distance / speed. Confidence: MEDIUM-HIGH; provisional - replace with BTA internal data at N>=30.'),
      ('DASH_30YD', 'Soccer D1 Average', 4.61::numeric,
       '~4.61s. Vescovi 2011 (Scand J Med Sci Sports 21:670-678): n=113 college-age (18-21 yr) high-level US women. Brower infrared gates, upright self-start (athlete starts when ready), clock started at first movement (first-movement trigger). Mean cumulative speed 5.94 m/s over 27.4 m; time = distance / speed. Confidence: MEDIUM-HIGH; provisional - replace with BTA internal data at N>=30.'),
      ('DASH_40YD', 'Soccer D1 Average', 5.85::numeric,
       '~5.85s. Vescovi 2011 (Scand J Med Sci Sports 21:670-678): n=113 college-age (18-21 yr) high-level US women. Brower infrared gates, upright self-start (athlete starts when ready), clock started at first movement (first-movement trigger). Median speed 6.26 m/s over 36.6 m (the mean, 6.24 m/s, gives 5.87 s); time = distance / speed. Confidence: MEDIUM-HIGH; provisional - replace with BTA internal data at N>=30.'),
      ('DASH_40YD', 'Soccer D1 Top 25%', 5.70::numeric,
       '~5.70s. Vescovi 2011 (Scand J Med Sci Sports 21:670-678): n=113 college-age (18-21 yr) high-level US women. Brower infrared gates, upright self-start (athlete starts when ready), clock started at first movement (first-movement trigger). Fast quartile = 75th-percentile speed 6.42 m/s over 36.6 m; time = distance / speed. Confidence: MEDIUM-HIGH; provisional - replace with BTA internal data at N>=30.'),
      ('DASH_40YD', 'HS MS Female Soccer (Ages 11-13) Average', 6.15::numeric,
       '~6.15s. Vescovi 2011 (Scand J Med Sci Sports 21:670-678; n=113 is the 18-21 group, this row uses the 12-13 yr group, not 11-13). Brower infrared gates, upright self-start (athlete starts when ready), clock started at first movement (first-movement trigger). Mean speed 5.95 m/s over 36.6 m; time = distance / speed. Confidence: MEDIUM-LOW; provisional - replace with BTA internal data at N>=30.'),
      ('DASH_40YD', 'HS JV Female Soccer (Ages 14-15) Average', 5.94::numeric,
       '~5.94s. Vescovi 2011 (Scand J Med Sci Sports 21:670-678; n=113 is the 18-21 group, this row uses the pooled 14-17 yr group, not 14-15). Brower infrared gates, upright self-start (athlete starts when ready), clock started at first movement (first-movement trigger). Mean speed 6.16 m/s over 36.6 m; time = distance / speed. Confidence: MEDIUM-LOW; provisional - replace with BTA internal data at N>=30.'),
      ('DASH_40YD', 'HS Varsity Female Soccer (Ages 16-18) Average', 5.90::numeric,
       '~5.90s (approximate). Vescovi 2011 (Scand J Med Sci Sports 21:670-678; n=113 is the 18-21 group) has no 16-18 group: this row sits between the pooled 14-17 yr group (5.94 s) and the 18-21 yr group (5.87 s). Brower infrared gates, upright self-start (athlete starts when ready), clock started at first movement (first-movement trigger); time = distance / speed over 36.6 m. Confidence: LOW-MEDIUM; provisional - replace with BTA internal data at N>=30.')
    ) AS t(code, nm, val, descr)
  LOOP
    UPDATE site_benchmarks
       SET benchmark_value = r.val, description = r.descr, is_active = true
     WHERE metric_code = r.code AND name = r.nm;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'Migration 0164: expected 1 row for % / %, updated %', r.code, r.nm, n;
    END IF;
  END LOOP;

  -- Switched-off rows
  FOR r IN
    SELECT * FROM (VALUES
      ('DASH_20YD', 'Soccer D1 Top 25%'),
      ('DASH_30YD', 'Soccer D1 Top 25%'),
      ('DASH_30YD', 'HS Varsity Female Soccer (Ages 16-18) Average'),
      ('DASH_40YD', 'HS Varsity Female Soccer (Ages 16-18) Top 25%'),
      ('DASH_30YD', 'Soccer DII Threshold'),
      ('DASH_40YD', 'Soccer DII Threshold'),
      ('DASH_30YD', 'Soccer DIII Threshold'),
      ('DASH_40YD', 'Soccer DIII Threshold')
    ) AS t(code, nm)
  LOOP
    UPDATE site_benchmarks SET is_active = false WHERE metric_code = r.code AND name = r.nm;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'Migration 0164: expected 1 row for % / %, updated %', r.code, r.nm, n;
    END IF;
  END LOOP;
END $$;
