-- Migration 0134: Re-anchor FLY10_TIME values per AM-FEAT-007 spec revision (2026-04-29)
--
-- Spec: AM-FEAT-007 — D1 + HS Female Benchmark Seeding
--
-- The spec's `SPRINT_10YD_FLY` rows (= codebase `FLY10_TIME`) were re-anchored
-- on 2026-04-29 to be derived from `SPEED_TOP_MPH` (= codebase `TOP_SPEED_MPH`)
-- via the BTA 20-yd-approach protocol formula:
--
--     time = 20.455 / mph
--
-- This produces internally-consistent values across the speed-family metrics
-- (TOP_SPEED_MPH and FLY10_TIME both derived from the same data point) and
-- supersedes the prior values that were extrapolated from less-comparable
-- protocols (Auburn 15-yd fly, Vescovi 2012 27.3 km/h derivation, etc.).
--
-- Migration 0129 (AM-FEAT-007) shipped before this re-anchoring landed in the
-- spec — so the 5 FLY10_TIME rows on develop have stale values. This forward-
-- only convergence migration UPDATEs them to the canonical 2026-04-29 values.
--
-- Spec validation reference: FIERCE 2026 baseline group avg 1.30 s (15.7 mph)
-- — competitive club, slightly above national HS Varsity avg — sanity-checks
-- the conversion formula against real-world measurement.
--
-- Block layout:
--   A — UPDATE D1 women's soccer FLY10_TIME rows (2 rows)
--   B — UPDATE HS age-grouped soccer FLY10_TIME rows (3 rows)
--   C — Row-count validation + RAISE NOTICE summary
--
-- Idempotency: re-applying produces no change (UPDATE to same value is a no-op).

DO $$
DECLARE
  v_count    INTEGER;
  v_d1_avg   NUMERIC;
  v_d1_top25 NUMERIC;
  v_ms       NUMERIC;
  v_jv       NUMERIC;
  v_var      NUMERIC;
BEGIN

  -- ==========================================================================
  -- Block A — D1 women's soccer FLY10_TIME re-anchoring
  -- ==========================================================================
  UPDATE site_benchmarks
     SET benchmark_value = 1.170,
         description = 'Computed from TOP_SPEED_MPH 17.5 (Stanford 18 + Mississippi State 17.8 convergent) via time = 20.455 / mph; BTA 20-yd-approach Fly-10 protocol. Confidence: MEDIUM-HIGH. Re-anchored 2026-04-29 from prior Auburn/Vescovi extrapolation.',
         updated_at = NOW()
   WHERE id = 'd1-soc-fly10-d1-avg';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Migration 0134: row d1-soc-fly10-d1-avg not found — migration 0129 may not be applied';
  END IF;

  UPDATE site_benchmarks
     SET benchmark_value = 1.050,
         description = 'Computed from TOP_SPEED_MPH 19.5 (Stanford 3 athletes at 20 mph + Auburn ~20 mph) via time = 20.455 / mph. Validated against FIERCE 2026 single-athlete high of 1.05 s. Confidence: MEDIUM-HIGH. Re-anchored 2026-04-29.',
         updated_at = NOW()
   WHERE id = 'd1-soc-fly10-d1-top25';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Migration 0134: row d1-soc-fly10-d1-top25 not found — migration 0129 may not be applied';
  END IF;

  -- ==========================================================================
  -- Block B — HS age-grouped soccer FLY10_TIME re-anchoring
  -- ==========================================================================
  UPDATE site_benchmarks
     SET benchmark_value = 1.640,
         description = 'Re-anchored 2026-04-29 to top-speed program data + BTA 20-yd-approach conversion. MS-tier estimate (limited published HS-MS Fly-10 norms). Confidence: LOW — pending BTA internal data accumulation.',
         updated_at = NOW()
   WHERE id = 'hs-ms-soc-fly10';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Migration 0134: row hs-ms-soc-fly10 not found — migration 0129 may not be applied';
  END IF;

  UPDATE site_benchmarks
     SET benchmark_value = 1.460,
         description = 'Computed from TOP_SPEED_MPH 14.0 via time = 20.455 / mph; BTA 20-yd-approach. Re-anchored 2026-04-29. Confidence: LOW — flagged in spec for BTA internal data validation.',
         updated_at = NOW()
   WHERE id = 'hs-jv-soc-fly10';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Migration 0134: row hs-jv-soc-fly10 not found — migration 0129 may not be applied';
  END IF;

  UPDATE site_benchmarks
     SET benchmark_value = 1.360,
         description = 'Computed from TOP_SPEED_MPH 15.0 via time = 20.455 / mph; BTA 20-yd-approach. Re-anchored 2026-04-29. FIERCE 2026 baseline group avg 1.30 s (15.7 mph) supports this Varsity-tier value. Confidence: MEDIUM.',
         updated_at = NOW()
   WHERE id = 'hs-var-soc-fly10';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Migration 0134: row hs-var-soc-fly10 not found — migration 0129 may not be applied';
  END IF;

  -- ==========================================================================
  -- Block C — Summary
  -- ==========================================================================
  SELECT benchmark_value INTO v_d1_avg   FROM site_benchmarks WHERE id = 'd1-soc-fly10-d1-avg';
  SELECT benchmark_value INTO v_d1_top25 FROM site_benchmarks WHERE id = 'd1-soc-fly10-d1-top25';
  SELECT benchmark_value INTO v_ms       FROM site_benchmarks WHERE id = 'hs-ms-soc-fly10';
  SELECT benchmark_value INTO v_jv       FROM site_benchmarks WHERE id = 'hs-jv-soc-fly10';
  SELECT benchmark_value INTO v_var      FROM site_benchmarks WHERE id = 'hs-var-soc-fly10';

  RAISE NOTICE 'Migration 0134 complete: FLY10_TIME re-anchored — D1 Avg %, D1 Top 25%% %, MS %, JV %, Varsity %.',
    v_d1_avg, v_d1_top25, v_ms, v_jv, v_var;

END $$;
