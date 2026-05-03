-- Migration 0137: Add coaching_note column + seed EUR diagnostic tiers + bilateral RSI metrics + RSI tiers
--
-- Three connected pieces:
--
--   1. ADD column site_benchmarks.coaching_note (TEXT NULL) — tier-specific
--      coaching prose surfaced by the report renderer alongside tier labels.
--      Distinct from the existing `description` column (which carries source
--      citations and benchmark-management metadata).
--
--   2. SEED POWER_EUR's 4-tier diagnostic interpretation from AM-FEAT-012 §5
--      (Concentric-dominant <1.05 / Functional SSC use 1.05–1.15 / Trained
--      reactive 1.15–1.25 / Elite reactive >1.25). Coaching prose per
--      AM-FEAT-012 §6. Migrating EUR from "render-time table" (aspirational,
--      never built) to "DB-driven tier benchmarks" — plugs into the existing
--      evaluateTierBenchmark() in report-service.ts with zero per-metric code.
--
--   3. ADD bilateral RSI single-leg metrics (RSI_L, RSI_R) + RSI_ASYM derived
--      metric (asymmetry %, lower_is_better, per BTA assessment-system.md).
--      Seed RSI_L and RSI_R normative tiers (Elite/Trained/General/Floor —
--      universal-athletic, single-leg-specific) and RSI_ASYM screening tiers
--      (Symmetrical/Borderline/Significant Deficit/Clinical Red Flag — per
--      user-provided research synthesizing JOSPT Open 2025 + Bishop et al.).
--
-- Block layout:
--   A — ALTER TABLE add coaching_note column
--   B — POWER_EUR 4-tier rows (shared tier_group_id; coaching_note populated)
--   C — EUR screening benchmark set
--   D — Wire EUR tiers into the screening set
--   E — RSI_L base metric
--   F — RSI_R base metric
--   G — RSI_ASYM derived metric (asymmetry %, lower_is_better)
--   H — RSI screening sets (normative + asymmetry)
--   I — RSI_L and RSI_R normative tier rows (4 tiers each)
--   J — RSI_ASYM screening tier rows (4 tiers)
--   K — Wire RSI tiers into screening sets
--   L — RAISE NOTICE summary

-- ============================================================================
-- Block A — Add coaching_note column to site_benchmarks
-- ============================================================================
ALTER TABLE site_benchmarks
  ADD COLUMN IF NOT EXISTS coaching_note TEXT;

-- ============================================================================
-- Block B — POWER_EUR 4-tier diagnostic interpretation
--
-- All four rows share tier_group_id 'e0eeeeee-0137-4eee-9eee-eeeeeeeeeeee'.
-- POWER_EUR is higher_is_better, so tier_order 1 = best (Elite reactive).
-- gender/sport/level/age all NULL (sport-agnostic; applies to any jumping athlete).
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description, coaching_note,
  comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color,
  is_system_default, is_active, display_order
) VALUES
  ('bench-eur-elite-reactive',
   'POWER_EUR',
   'EUR Elite Reactive (>1.25)',
   'EUR > 1.25. Top-end SSC efficiency; rare in HS-age athletes. Source: AM-FEAT-012 §5; vertical-jump-research-context.md §2 (CMJ vs SJ — EUR Framework).',
   'Top-end SSC efficiency. Verify protocol consistency on next test; if confirmed, focus on sport-specific application.',
   'range', 1.25, 1.5,
   'e0eeeeee-0137-4eee-9eee-eeeeeeeeeeee'::uuid, 1, 'Elite reactive', 'green',
   true, true, 1),

  ('bench-eur-trained-reactive',
   'POWER_EUR',
   'EUR Trained Reactive (1.15-1.25)',
   'EUR 1.15–1.25. Plyometrics-trained profile; D1-level SSC efficiency. Source: AM-FEAT-012 §5.',
   'Strong SSC use. Focus on raising the SJ floor (concentric strength) to lift the whole curve.',
   'range', 1.15, 1.249,
   'e0eeeeee-0137-4eee-9eee-eeeeeeeeeeee'::uuid, 2, 'Trained reactive', 'blue',
   true, true, 2),

  ('bench-eur-functional-ssc',
   'POWER_EUR',
   'EUR Functional SSC Use (1.05-1.15)',
   'EUR 1.05–1.15. Within trained-female athlete range. Source: AM-FEAT-012 §5.',
   'Balanced jump profile. Continue current programming.',
   'range', 1.05, 1.149,
   'e0eeeeee-0137-4eee-9eee-eeeeeeeeeeee'::uuid, 3, 'Functional SSC use', 'gray',
   true, true, 3),

  ('bench-eur-concentric-dominant',
   'POWER_EUR',
   'EUR Concentric-Dominant (<1.05)',
   'EUR < 1.05. Athlete relies on raw concentric strength; SSC use is minimal. Source: AM-FEAT-012 §5.',
   'Concentric power is the lever. Plyometric block (depth jumps, bounding) before further strength gains.',
   'range', 0, 1.049,
   'e0eeeeee-0137-4eee-9eee-eeeeeeeeeeee'::uuid, 4, 'Concentric-dominant', 'yellow',
   true, true, 4)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  coaching_note = EXCLUDED.coaching_note,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  comparison_operator = EXCLUDED.comparison_operator,
  tier_group_id = EXCLUDED.tier_group_id,
  tier_order = EXCLUDED.tier_order,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true;

-- ============================================================================
-- Block C — EUR screening benchmark set
-- ============================================================================
INSERT INTO benchmark_sets (
  id, organization_id, name, description, sport, level, gender,
  is_template, is_active
) VALUES (
  'set-screening-eur-diagnostic',
  NULL,
  'EUR Diagnostic Tiers',
  'Eccentric Utilization Ratio interpretation tiers — SSC efficiency zones (not competitive levels). Tier label drives plyometric vs. concentric prescription. Source: AM-FEAT-012 §5; vertical-jump-research-context.md §2.',
  NULL,
  NULL,
  NULL,
  true, true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_template = EXCLUDED.is_template,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block D — Wire EUR tiers into the screening set
-- ============================================================================
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  ('bsi-eur-elite-reactive',       'set-screening-eur-diagnostic', 'bench-eur-elite-reactive',       'site', 1),
  ('bsi-eur-trained-reactive',     'set-screening-eur-diagnostic', 'bench-eur-trained-reactive',     'site', 2),
  ('bsi-eur-functional-ssc',       'set-screening-eur-diagnostic', 'bench-eur-functional-ssc',       'site', 3),
  ('bsi-eur-concentric-dominant',  'set-screening-eur-diagnostic', 'bench-eur-concentric-dominant',  'site', 4)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block E — RSI_L base metric (single-leg, 10/5 Repeat Hop, left)
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max
) VALUES (
  'RSI_L',
  'RSI Left Leg (10/5 Repeat Hop)',
  'Power',
  'ratio',
  'higher_is_better',
  true, true,
  72,
  'Single-leg Reactive Strength Index, left leg, via 10/5 Repeat Hop protocol: 10 maximal single-leg hops; first hop discarded; mean RSI of best 5 of remaining 9. RSI = flight time ÷ ground contact time. Higher RSI = better elastic energy use and reactive control. Pair with RSI_R to compute RSI_ASYM (asymmetry %). Source: BTA assessment-system.md §1; tiered-assessment-system.md §3.',
  2, 'red', 'Activity',
  0, 5
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  is_active = true;

-- ============================================================================
-- Block F — RSI_R base metric (single-leg, 10/5 Repeat Hop, right)
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max
) VALUES (
  'RSI_R',
  'RSI Right Leg (10/5 Repeat Hop)',
  'Power',
  'ratio',
  'higher_is_better',
  true, true,
  73,
  'Single-leg Reactive Strength Index, right leg, via 10/5 Repeat Hop protocol: 10 maximal single-leg hops; first hop discarded; mean RSI of best 5 of remaining 9. RSI = flight time ÷ ground contact time. Higher RSI = better elastic energy use and reactive control. Pair with RSI_L to compute RSI_ASYM (asymmetry %). Source: BTA assessment-system.md §1; tiered-assessment-system.md §3.',
  2, 'red', 'Activity',
  0, 5
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  is_active = true;

-- ============================================================================
-- Block G — RSI_ASYM derived metric (asymmetry %, lower_is_better)
--
-- Formula: ((max(RSI_L, RSI_R) - min(RSI_L, RSI_R)) / max(RSI_L, RSI_R)) * 100
-- Output: 0% = perfect symmetry; 12.5% = 12.5% asymmetry.
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES (
  'RSI_ASYM',
  'RSI L/R Asymmetry',
  'Power',
  '%',
  'lower_is_better',
  true, true,
  74,
  'Asymmetry % between single-leg RSI values: ((max - min) / max) * 100. 0% = perfect symmetry. RSI asymmetry tolerates higher CV (~7–10%) than 5-0-5 LSI; thresholds calibrated accordingly. RSI asymmetry is "stickier" than other LSI metrics in return-to-play — an athlete passing 5-0-5 LSI but failing RSI symmetry is likely "muscling" through movement vs. using elastic energy. Source: AM-FEAT-008 family; user-provided research synthesizing JOSPT Open 2025 + Bishop et al.',
  1, 'red', 'Activity',
  0, 100,
  true,
  '((max(RSI_L, RSI_R) - min(RSI_L, RSI_R)) / max(RSI_L, RSI_R)) * 100',
  ARRAY['RSI_L', 'RSI_R'],
  '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  formula = EXCLUDED.formula,
  dependent_metrics = EXCLUDED.dependent_metrics,
  calculation_config = EXCLUDED.calculation_config,
  is_derived = EXCLUDED.is_derived,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  is_active = true;

-- ============================================================================
-- Block H — RSI screening benchmark sets
-- ============================================================================
INSERT INTO benchmark_sets (
  id, organization_id, name, description, sport, level, gender,
  is_template, is_active
) VALUES
  ('set-screening-female-rsi-normative',
   NULL,
   'Female Single-Leg RSI Normative Tiers',
   'Per-leg single-leg RSI normative tiers (10/5 Repeat Hop): Elite >1.5 / Trained 1.1–1.5 / General 0.5–1.1 / Below Floor <0.5. Universal-athletic, single-leg-specific (bilateral RSI norms differ — not seeded here). Source: user-provided research; SimpliFaster RSI primers; field-validated across collegiate female athletes.',
   NULL,
   NULL,
   'Female',
   true, true),

  ('set-screening-female-rsi-asymmetry',
   NULL,
   'Female RSI Bilateral Asymmetry Screening',
   'Screening tiers for RSI_ASYM applying to female athletes. Tiers reflect clinical injury-risk thresholds, not competitive levels. <10% Symmetrical / 10–15% Borderline / 15–20% Significant Deficit / >20% Clinical Red Flag. Sources: User-provided research synthesizing JOSPT Open 2025 + Bishop et al. (LSI cutoffs); RSI tolerates higher CV than 5-0-5.',
   NULL,
   NULL,
   'Female',
   true, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block I — RSI_L and RSI_R normative tier rows
--
-- 4 tiers each, separate tier_group_id per leg (per 0128's per-leg pattern).
-- Both RSI_L and RSI_R are higher_is_better → tier_order 1 = best (Elite).
-- Coaching note is identical across legs (training prescription is the same).
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description, coaching_note,
  comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color,
  gender, is_system_default, is_active, display_order
) VALUES
  -- RSI_L normative tiers
  ('bench-rsi-l-elite',
   'RSI_L', 'RSI_L Elite (≥1.5)',
   'Single-leg RSI ≥ 1.5. Elite reactive capacity. Source: user-provided research.',
   'Elite reactive capacity. Maintain via low-volume / high-intensity plyometric exposure.',
   'range', 1.5, 5,
   '15151515-0137-4151-9151-aaaaaaaaaaaa'::uuid, 1, 'Elite', 'green',
   'Female', true, true, 1),

  ('bench-rsi-l-trained',
   'RSI_L', 'RSI_L Trained (1.1-1.5)',
   'Single-leg RSI 1.1–1.5. Trained reactive profile.',
   'Trained reactive profile; continue progressive plyometric loading.',
   'range', 1.1, 1.499,
   '15151515-0137-4151-9151-aaaaaaaaaaaa'::uuid, 2, 'Trained', 'blue',
   'Female', true, true, 2),

  ('bench-rsi-l-general',
   'RSI_L', 'RSI_L General (0.5-1.1)',
   'Single-leg RSI 0.5–1.1. General-athletic-population range.',
   'General-population range; build reactive base before progressing intensity.',
   'range', 0.5, 1.099,
   '15151515-0137-4151-9151-aaaaaaaaaaaa'::uuid, 3, 'General', 'gray',
   'Female', true, true, 3),

  ('bench-rsi-l-floor',
   'RSI_L', 'RSI_L Below Floor (<0.5)',
   'Single-leg RSI < 0.5. Below the minimum floor for safe reactive athletic play.',
   'Below safe-play floor. Prioritize tendon prep + low-amplitude pogos before reactive progression.',
   'range', 0, 0.499,
   '15151515-0137-4151-9151-aaaaaaaaaaaa'::uuid, 4, 'Below Floor', 'red',
   'Female', true, true, 4),

  -- RSI_R normative tiers (mirror of RSI_L; separate tier_group_id)
  ('bench-rsi-r-elite',
   'RSI_R', 'RSI_R Elite (≥1.5)',
   'Single-leg RSI ≥ 1.5. Elite reactive capacity. Source: user-provided research.',
   'Elite reactive capacity. Maintain via low-volume / high-intensity plyometric exposure.',
   'range', 1.5, 5,
   '26262626-0137-4262-a262-bbbbbbbbbbbb'::uuid, 1, 'Elite', 'green',
   'Female', true, true, 1),

  ('bench-rsi-r-trained',
   'RSI_R', 'RSI_R Trained (1.1-1.5)',
   'Single-leg RSI 1.1–1.5. Trained reactive profile.',
   'Trained reactive profile; continue progressive plyometric loading.',
   'range', 1.1, 1.499,
   '26262626-0137-4262-a262-bbbbbbbbbbbb'::uuid, 2, 'Trained', 'blue',
   'Female', true, true, 2),

  ('bench-rsi-r-general',
   'RSI_R', 'RSI_R General (0.5-1.1)',
   'Single-leg RSI 0.5–1.1. General-athletic-population range.',
   'General-population range; build reactive base before progressing intensity.',
   'range', 0.5, 1.099,
   '26262626-0137-4262-a262-bbbbbbbbbbbb'::uuid, 3, 'General', 'gray',
   'Female', true, true, 3),

  ('bench-rsi-r-floor',
   'RSI_R', 'RSI_R Below Floor (<0.5)',
   'Single-leg RSI < 0.5. Below the minimum floor for safe reactive athletic play.',
   'Below safe-play floor. Prioritize tendon prep + low-amplitude pogos before reactive progression.',
   'range', 0, 0.499,
   '26262626-0137-4262-a262-bbbbbbbbbbbb'::uuid, 4, 'Below Floor', 'red',
   'Female', true, true, 4)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  coaching_note = EXCLUDED.coaching_note,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  comparison_operator = EXCLUDED.comparison_operator,
  tier_group_id = EXCLUDED.tier_group_id,
  tier_order = EXCLUDED.tier_order,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true;

-- ============================================================================
-- Block J — RSI_ASYM screening tier rows
--
-- 4 tiers, shared tier_group_id. RSI_ASYM is lower_is_better →
-- tier_order 1 = best (Symmetrical).
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description, coaching_note,
  comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color,
  gender, is_system_default, is_active, display_order
) VALUES
  ('bench-rsi-asym-symmetric',
   'RSI_ASYM',
   'RSI Symmetrical (<10%)',
   'RSI asymmetry < 10%. Acceptable variance for most athletes — within typical CV (~7–10%) for single-leg RSI. Source: user-provided research; Bishop et al.',
   'Acceptable variance for most athletes. Continue programming.',
   'range', 0, 9.999,
   'c0c0c0c0-0137-4ccc-bccc-cccccccccccc'::uuid, 1, 'Symmetrical', 'green',
   'Female', true, true, 1),

  ('bench-rsi-asym-borderline',
   'RSI_ASYM',
   'RSI Borderline (10-15%)',
   'RSI asymmetry 10–15%. Borderline; potentially normal during heavy-usage phase. Source: user-provided research.',
   'Monitor; potentially normal during heavy-usage phase. Bias bilateral loading toward weak side.',
   'range', 10, 14.999,
   'c0c0c0c0-0137-4ccc-bccc-cccccccccccc'::uuid, 2, 'Borderline', 'yellow',
   'Female', true, true, 2),

  ('bench-rsi-asym-significant',
   'RSI_ASYM',
   'RSI Significant Deficit (15-20%)',
   'RSI asymmetry 15–20%. Significant deficit indicating SSC breakdown / "energy leaking" on weak side. Source: user-provided research; JOSPT Open 2025.',
   'High alert. SSC breakdown / energy leaking on weak side. Targeted unilateral plyometric work; reassess in 4 weeks.',
   'range', 15, 19.999,
   'c0c0c0c0-0137-4ccc-bccc-cccccccccccc'::uuid, 3, 'Significant Deficit', 'orange',
   'Female', true, true, 3),

  ('bench-rsi-asym-redflag',
   'RSI_ASYM',
   'RSI Clinical Red Flag (>20%)',
   'RSI asymmetry > 20%. Strongly correlated with lingering ACL/joint deficits or significant eccentric weakness. Source: user-provided research; JOSPT Open 2025.',
   'Strongly correlated with lingering ACL/joint deficits or significant eccentric weakness. Pause high-intensity reactive work; refer to clinical screening if recent injury history.',
   'range', 20, 100,
   'c0c0c0c0-0137-4ccc-bccc-cccccccccccc'::uuid, 4, 'Clinical Red Flag', 'red',
   'Female', true, true, 4)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  coaching_note = EXCLUDED.coaching_note,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  comparison_operator = EXCLUDED.comparison_operator,
  tier_group_id = EXCLUDED.tier_group_id,
  tier_order = EXCLUDED.tier_order,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true;

-- ============================================================================
-- Block K — Wire RSI tier rows into screening sets
-- ============================================================================
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  -- Normative set: both legs share the set
  ('bsi-rsi-l-elite',     'set-screening-female-rsi-normative', 'bench-rsi-l-elite',    'site', 1),
  ('bsi-rsi-l-trained',   'set-screening-female-rsi-normative', 'bench-rsi-l-trained',  'site', 2),
  ('bsi-rsi-l-general',   'set-screening-female-rsi-normative', 'bench-rsi-l-general',  'site', 3),
  ('bsi-rsi-l-floor',     'set-screening-female-rsi-normative', 'bench-rsi-l-floor',    'site', 4),
  ('bsi-rsi-r-elite',     'set-screening-female-rsi-normative', 'bench-rsi-r-elite',    'site', 5),
  ('bsi-rsi-r-trained',   'set-screening-female-rsi-normative', 'bench-rsi-r-trained',  'site', 6),
  ('bsi-rsi-r-general',   'set-screening-female-rsi-normative', 'bench-rsi-r-general',  'site', 7),
  ('bsi-rsi-r-floor',     'set-screening-female-rsi-normative', 'bench-rsi-r-floor',    'site', 8),
  -- Asymmetry set
  ('bsi-rsi-asym-symmetric',     'set-screening-female-rsi-asymmetry', 'bench-rsi-asym-symmetric',     'site', 1),
  ('bsi-rsi-asym-borderline',    'set-screening-female-rsi-asymmetry', 'bench-rsi-asym-borderline',    'site', 2),
  ('bsi-rsi-asym-significant',   'set-screening-female-rsi-asymmetry', 'bench-rsi-asym-significant',   'site', 3),
  ('bsi-rsi-asym-redflag',       'set-screening-female-rsi-asymmetry', 'bench-rsi-asym-redflag',       'site', 4)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block L — Summary
-- ============================================================================
DO $$
DECLARE
  v_eur_tiers     INTEGER;
  v_rsi_norm      INTEGER;
  v_rsi_asym      INTEGER;
  v_coaching_col  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_coaching_col FROM information_schema.columns
    WHERE table_name = 'site_benchmarks' AND column_name = 'coaching_note';
  SELECT COUNT(*) INTO v_eur_tiers FROM site_benchmarks
    WHERE tier_group_id = 'e0eeeeee-0137-4eee-9eee-eeeeeeeeeeee'::uuid;
  SELECT COUNT(*) INTO v_rsi_norm FROM site_benchmarks
    WHERE metric_code IN ('RSI_L', 'RSI_R');
  SELECT COUNT(*) INTO v_rsi_asym FROM site_benchmarks
    WHERE metric_code = 'RSI_ASYM';

  RAISE NOTICE 'Migration 0137 complete: coaching_note column present (%), POWER_EUR % tiers, RSI_L+RSI_R % normative tiers, RSI_ASYM % screening tiers.',
    v_coaching_col, v_eur_tiers, v_rsi_norm, v_rsi_asym;
END $$;
