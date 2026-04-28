-- Migration 0128: Bilateral 5-0-5 + Limb Symmetry Index (LSI) Screening
--
-- Spec: AM-FEAT-008 (/home/hulla/devel/bta-company/specs/AM-FEAT-008_bilateral-505-lsi.md)
--
-- Adds the LSI derived metric and screening benchmark set for bilateral
-- asymmetry detection. Per-leg base metrics AGILITY_505_L / AGILITY_505_R
-- already exist (seeded by migration 0107).
--
-- Bilateral asymmetry (>10% LSI / >0.15s absolute difference) is the
-- contemporary clinical predictor of non-contact ACL, hamstring, and adductor
-- injury in female soccer athletes. See /docs/benchmarks/cod-research-context.md §9
-- (Bishop et al. on LSI cutoffs; Hewett et al. ACL prospective; Dos'Santos
-- on 180° turn biomechanics).
--
-- Block layout:
--   A — AGILITY_505_LSI derived metric definition
--   B — Screening benchmark set (Female Bilateral Asymmetry Screening)
--   C — Three LSI tier rows (Normal / Monitor / Elevated Risk)
--   D — Wire LSI tiers into the screening set
--   E — Per-leg AGILITY_505_L / _R tier copies derived from existing
--       AGILITY_505 tier rows (no-op if AM-FEAT-007 hasn't landed yet)
--   F — Per-leg benchmark_set_items mirroring AGILITY_505 set memberships
--
-- All inserts are idempotent (ON CONFLICT DO UPDATE) per spec §Acceptance.

-- ============================================================================
-- Block A — AGILITY_505_LSI derived metric
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES (
  'AGILITY_505_LSI',
  '5-0-5 Limb Symmetry Index',
  'agility',
  '%',
  'higher_is_better',
  true, true,
  40,
  'Limb Symmetry Index between left- and right-foot 5-0-5 turn times. Computed as (faster_leg / slower_leg) × 100. 100% = perfectly symmetric; <90% indicates clinically meaningful asymmetry and elevated lower-limb injury risk per Bishop et al., Hewett et al., and Dos''Santos et al. See cod-research-context.md §9.',
  1, 'green', 'Activity',
  0, 100,
  true,
  '(min(AGILITY_505_L, AGILITY_505_R) / max(AGILITY_505_L, AGILITY_505_R)) * 100',
  ARRAY['AGILITY_505_L', 'AGILITY_505_R'],
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
-- Block B — Screening benchmark set
-- ============================================================================
INSERT INTO benchmark_sets (
  id, organization_id, name, description, sport, level, gender,
  is_template, is_active
) VALUES (
  'set-screening-female-bilateral-asymmetry',
  NULL,
  'Female Bilateral Asymmetry Screening',
  'Screening tiers for AGILITY_505_LSI applying to female athletes in soccer and volleyball. Tiers reflect clinical injury-risk thresholds, not competitive levels. Sources: Bishop et al. (LSI cutoffs in athletic populations), Hewett et al. (prospective ACL injury studies), Dos''Santos et al. (180° turn biomechanics). See cod-research-context.md §9.',
  NULL,
  NULL,
  'Female',
  true, true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block C — LSI tier rows (Normal / Monitor / Elevated Risk)
--
-- All three rows share tier_group_id 'tg-screening-asym-lsi'.
-- LSI is higher_is_better, so tier_order 1 = best (highest LSI = most symmetric).
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color,
  gender, is_system_default, is_active, display_order
) VALUES
  ('bench-screening-asym-lsi-normal',
   'AGILITY_505_LSI',
   'LSI Normal (>=95%)',
   'LSI ≥ 95%. Within expected range; continue programming. Source: Bishop et al.',
   'range', 95, 100,
   'a505a505-0128-4505-9151-aaaaaaaaaaaa'::uuid, 1, 'Normal', 'green',
   'Female', true, true, 1),

  ('bench-screening-asym-lsi-monitor',
   'AGILITY_505_LSI',
   'LSI Monitor (90-95%)',
   'LSI 90–95%. Borderline; bias bilateral loading toward weak side. Source: Bishop et al.',
   'range', 90, 94.999,
   'a505a505-0128-4505-9151-aaaaaaaaaaaa'::uuid, 2, 'Monitor', 'yellow',
   'Female', true, true, 2),

  ('bench-screening-asym-lsi-elevated',
   'AGILITY_505_LSI',
   'LSI Elevated Risk (<90%)',
   'LSI < 90% — clinically meaningful asymmetry. Targeted unilateral strength on weak side; do not progress to high-intensity reactive work until corrected. Sources: Bishop, Hewett, Dos''Santos.',
   'range', 0, 89.999,
   'a505a505-0128-4505-9151-aaaaaaaaaaaa'::uuid, 3, 'Elevated Risk', 'red',
   'Female', true, true, 3)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  comparison_operator = EXCLUDED.comparison_operator,
  tier_group_id = EXCLUDED.tier_group_id,
  tier_order = EXCLUDED.tier_order,
  tier_color = EXCLUDED.tier_color,
  is_active = true;

-- ============================================================================
-- Block D — Wire LSI tier rows into the screening set
-- ============================================================================
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  ('bsi-screening-asym-lsi-normal',   'set-screening-female-bilateral-asymmetry', 'bench-screening-asym-lsi-normal',   'site', 1),
  ('bsi-screening-asym-lsi-monitor',  'set-screening-female-bilateral-asymmetry', 'bench-screening-asym-lsi-monitor',  'site', 2),
  ('bsi-screening-asym-lsi-elevated', 'set-screening-female-bilateral-asymmetry', 'bench-screening-asym-lsi-elevated', 'site', 3)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block E — Per-leg tier copies from existing AGILITY_505 rows
--
-- Generates AGILITY_505_L and AGILITY_505_R tier-group copies of every
-- AGILITY_505 site_benchmarks row that AM-FEAT-007 created. Robust to
-- whatever IDs / set memberships AM-FEAT-007 chooses — runs as a no-op
-- if no AGILITY_505 tier rows exist yet.
--
-- Deterministic ID derivation:
--   id            : <source id>-l  / <source id>-r        (varchar)
--   tier_group_id : md5(<source uuid>::text || '-l')::uuid (uuid; PostgreSQL
--                   accepts 32-hex-char strings as UUIDs without hyphens, and
--                   md5() returns exactly that — no extensions required.)
--
-- Name disambiguation: append ' (Left)' / ' (Right)' to the source name,
-- which preserves the uniqueness constraint on (metric_code, name).
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color,
  applicable_org_types,
  gender, age_min, age_max, sport, position, level,
  is_system_default, is_active, display_order,
  benchmark_source, peer_percentile_target, peer_filter_criteria,
  color, icon
)
SELECT
  src.id || '-l',
  'AGILITY_505_L',
  src.name || ' (Left)',
  COALESCE(src.description, '') || ' Applies to left-foot pivot.',
  src.comparison_operator, src.benchmark_value, src.min_value, src.max_value,
  md5(src.tier_group_id::text || '-l')::uuid,
  src.tier_order, src.tier_name, src.tier_color,
  src.applicable_org_types,
  src.gender, src.age_min, src.age_max, src.sport, src.position, src.level,
  src.is_system_default, src.is_active, src.display_order,
  src.benchmark_source, src.peer_percentile_target, src.peer_filter_criteria,
  src.color, src.icon
FROM site_benchmarks src
WHERE src.metric_code = 'AGILITY_505'
  AND src.tier_group_id IS NOT NULL
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  benchmark_value = EXCLUDED.benchmark_value,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  tier_order = EXCLUDED.tier_order,
  tier_color = EXCLUDED.tier_color,
  is_active = EXCLUDED.is_active;

INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color,
  applicable_org_types,
  gender, age_min, age_max, sport, position, level,
  is_system_default, is_active, display_order,
  benchmark_source, peer_percentile_target, peer_filter_criteria,
  color, icon
)
SELECT
  src.id || '-r',
  'AGILITY_505_R',
  src.name || ' (Right)',
  COALESCE(src.description, '') || ' Applies to right-foot pivot.',
  src.comparison_operator, src.benchmark_value, src.min_value, src.max_value,
  md5(src.tier_group_id::text || '-r')::uuid,
  src.tier_order, src.tier_name, src.tier_color,
  src.applicable_org_types,
  src.gender, src.age_min, src.age_max, src.sport, src.position, src.level,
  src.is_system_default, src.is_active, src.display_order,
  src.benchmark_source, src.peer_percentile_target, src.peer_filter_criteria,
  src.color, src.icon
FROM site_benchmarks src
WHERE src.metric_code = 'AGILITY_505'
  AND src.tier_group_id IS NOT NULL
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  benchmark_value = EXCLUDED.benchmark_value,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  tier_order = EXCLUDED.tier_order,
  tier_color = EXCLUDED.tier_color,
  is_active = EXCLUDED.is_active;

-- ============================================================================
-- Block F — Per-leg benchmark_set_items mirroring AGILITY_505 memberships
--
-- For every existing benchmark_set_items row that points at a tiered
-- AGILITY_505 site_benchmark (tier_group_id IS NOT NULL, matching Block E),
-- create two parallel rows pointing at the freshly-seeded _L and _R copies.
-- ID derivation matches Block E: <source bsi id>-l / -r.
--
-- The tier_group_id filter mirrors Block E so non-tiered AGILITY_505 rows
-- (which Block E does not duplicate) do not produce dangling _l/_r references
-- here.
-- ============================================================================
INSERT INTO benchmark_set_items (
  id, set_id, benchmark_id, benchmark_type, display_order, custom_label
)
SELECT
  bsi.id || '-l',
  bsi.set_id,
  bsi.benchmark_id || '-l',
  'site',
  bsi.display_order,
  bsi.custom_label
FROM benchmark_set_items bsi
JOIN site_benchmarks sb
  ON bsi.benchmark_id = sb.id
 AND bsi.benchmark_type = 'site'
WHERE sb.metric_code = 'AGILITY_505'
  AND sb.tier_group_id IS NOT NULL
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order,
  custom_label = EXCLUDED.custom_label;

INSERT INTO benchmark_set_items (
  id, set_id, benchmark_id, benchmark_type, display_order, custom_label
)
SELECT
  bsi.id || '-r',
  bsi.set_id,
  bsi.benchmark_id || '-r',
  'site',
  bsi.display_order,
  bsi.custom_label
FROM benchmark_set_items bsi
JOIN site_benchmarks sb
  ON bsi.benchmark_id = sb.id
 AND bsi.benchmark_type = 'site'
WHERE sb.metric_code = 'AGILITY_505'
  AND sb.tier_group_id IS NOT NULL
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order,
  custom_label = EXCLUDED.custom_label;

DO $$
DECLARE
  v_lsi_tiers      INTEGER;
  v_per_leg_rows   INTEGER;
  v_per_leg_items  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_lsi_tiers FROM site_benchmarks WHERE tier_group_id = 'a505a505-0128-4505-9151-aaaaaaaaaaaa'::uuid;
  SELECT COUNT(*) INTO v_per_leg_rows FROM site_benchmarks WHERE metric_code IN ('AGILITY_505_L', 'AGILITY_505_R');
  SELECT COUNT(*) INTO v_per_leg_items FROM benchmark_set_items WHERE id LIKE '%-l' OR id LIKE '%-r';

  RAISE NOTICE 'Migration 0128 complete: AGILITY_505_LSI derived metric, % LSI tier rows, % per-leg site_benchmarks rows, % per-leg benchmark_set_items rows.',
    v_lsi_tiers, v_per_leg_rows, v_per_leg_items;
END $$;
