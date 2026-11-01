-- Migration 0174: single-leg triple hop, bilateral landing (HOP_SL_TRIPLE_BL_L / HOP_SL_TRIPLE_BL_R), its LSI and the LSI screening set
--
-- The bilateral-landing protocol is three consecutive maximal hops on ONE leg, the final hop landing on BOTH feet. It is a
-- separate test from the stick-landing triple hop (HOP_SL_TRIPLE_L / _R: final hop landed on the hopping leg), so it gets its
-- own codes and the stick-landing rows are never modified.
--
-- Block layout:
--   A - HOP_SL_TRIPLE_BL_L / HOP_SL_TRIPLE_BL_R site_metrics rows, copied from the stick-landing legs (feet, see 0168)
--   B - HOP_SL_TRIPLE_BL_LSI derived metric: (min(L, R) / max(L, R)) * 100, higher is better, 100 = symmetric
--   C - organization enablement: an organization with HOP_SL_TRIPLE_L enabled gets all three codes enabled
--   D - 'Triple Hop Bilateral Landing Asymmetry Screening' set: Symmetrical >= 90 / Mild Deficit 85-90 / High Asymmetry Flag < 85
--   E - RAISE NOTICE summary
--
-- Copied from the stick-landing leg: category, unit, metric_type, is_system_default, is_active, available_org_types,
-- sport_associations, validation_min, validation_max, decimal_precision, display_format, color, icon, display_order.
-- Written for this protocol (NOT copied): label, description, short_description, what_it_measures, why_it_matters. The source
-- text describes the stick-landing test and would mislead athletes. The validation range is copied as is: a two-foot final
-- landing can travel a little further, so an admin can widen it in the UI if real values are rejected.
--
-- No distance tiers are seeded: no published norms for a two-foot final landing were found, and the stick-landing soccer tiers
-- from 0169 do not transfer. The LSI cutoffs are injury-risk screening thresholds, so they are the same as 0169's.
--
-- Everything is skipped (and the migration is still recorded as applied) unless BOTH HOP_SL_TRIPLE_L and HOP_SL_TRIPLE_R
-- exist: those rows are created in the admin UI, not by a migration. Confirm they exist in the target environment first. If
-- either is present but not in feet (0168 not applied), the migration raises instead.
-- An existing row is never modified (ON CONFLICT DO NOTHING). Sets are inserted with explicit ids and a bare ON CONFLICT DO
-- NOTHING: the partial unique index benchmark_sets_unique_site_name (name WHERE organization_id IS NULL) would otherwise abort
-- the migration when a site template of that name exists. Benchmark, set and item ids use a 'bl' infix so 0169's down
-- migration (which deletes by id prefix) can never touch them.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- Do not re-run by hand: a manual re-run re-adds org rows an admin deleted.
-- Number is provisional: renumber at merge if another branch lands 0174 first.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_L')
     AND EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_R')
     AND EXISTS (SELECT 1 FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R') AND unit IS DISTINCT FROM 'ft') THEN
    RAISE EXCEPTION 'Migration 0174: HOP_SL_TRIPLE_L / _R must be in ft. Apply 0168_triple_hop_meters_to_feet first.';
  END IF;
END $$;

-- ============================================================================
-- Block A - leg metrics copied from the stick-landing legs
-- ============================================================================
-- Inline VALUES (the 0156 pattern). Both stick-landing legs must exist, so a pair is never created half.
INSERT INTO site_metrics (
  code, label, display_order, description,
  category, unit, metric_type, is_system_default, is_active,
  short_description, what_it_measures, why_it_matters,
  available_org_types, sport_associations, validation_min, validation_max, decimal_precision, display_format, color, icon
)
SELECT n.code, n.label, COALESCE(src.display_order, 999), n.description,
       src.category, src.unit, src.metric_type, src.is_system_default, src.is_active,
       n.short_description, n.what_it_measures, n.why_it_matters,
       src.available_org_types, src.sport_associations, src.validation_min, src.validation_max, src.decimal_precision, src.display_format, src.color, src.icon
  FROM (VALUES
    ('HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_L', 'Single-Leg Triple Hop, Bilateral Landing (Left Leg)',
     'Single-leg triple hop for distance with a bilateral landing, left leg: the athlete takes three consecutive maximal hops on the left leg only and lands the final hop on both feet. Same unit and range as HOP_SL_TRIPLE_L. Not interchangeable with the stick-landing triple hop (final hop landed on one leg), which is a separate metric.',
     'How far you travel in three hops on your left leg, finishing with a two-foot landing.',
     'Three consecutive maximal hops on the left leg for distance, with the last hop landing on both feet. It shows single-leg horizontal power and reactive strength without the balance demand of sticking the final landing on one leg.',
     'Comparing the left and right legs on the same hop shows side-to-side differences in horizontal power. A large gap points to single-leg strength and power work for the weaker leg.'),
    ('HOP_SL_TRIPLE_BL_R', 'HOP_SL_TRIPLE_R', 'Single-Leg Triple Hop, Bilateral Landing (Right Leg)',
     'Single-leg triple hop for distance with a bilateral landing, right leg: the athlete takes three consecutive maximal hops on the right leg only and lands the final hop on both feet. Same unit and range as HOP_SL_TRIPLE_R. Not interchangeable with the stick-landing triple hop (final hop landed on one leg), which is a separate metric.',
     'How far you travel in three hops on your right leg, finishing with a two-foot landing.',
     'Three consecutive maximal hops on the right leg for distance, with the last hop landing on both feet. It shows single-leg horizontal power and reactive strength without the balance demand of sticking the final landing on one leg.',
     'Comparing the left and right legs on the same hop shows side-to-side differences in horizontal power. A large gap points to single-leg strength and power work for the weaker leg.')
  ) AS n(code, source_code, label, description, short_description, what_it_measures, why_it_matters)
  JOIN site_metrics src ON src.code = n.source_code
 WHERE EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_L')
   AND EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_R')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Block B - HOP_SL_TRIPLE_BL_LSI derived metric
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
)
SELECT
  'HOP_SL_TRIPLE_BL_LSI',
  'Single-Leg Triple Hop, Bilateral Landing Limb Symmetry Index',
  l.category,
  '%',
  'higher_is_better',
  true, true,
  COALESCE(l.display_order, 999),
  'Limb Symmetry Index between left- and right-leg single-leg triple hop distance with a bilateral landing. Computed as (shorter leg / longer leg) x 100. 100% = perfectly symmetric; 90% or more is symmetrical, 85-90% is a mild deficit, under 85% flags a high asymmetry (eccentric deceleration or horizontal force deficit, elevated non-contact injury risk).',
  1, 'green', 'Activity',
  0, 100,
  true,
  '(min(HOP_SL_TRIPLE_BL_L, HOP_SL_TRIPLE_BL_R) / max(HOP_SL_TRIPLE_BL_L, HOP_SL_TRIPLE_BL_R)) * 100',
  ARRAY['HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R'],
  '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb
FROM site_metrics l
WHERE l.code = 'HOP_SL_TRIPLE_BL_L'
  AND EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_BL_R')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Block C - Organization enablement
-- ============================================================================
-- An organization with the stick-landing left leg enabled gets the three new codes enabled (the 0156 / 0169 pattern).
-- ON CONFLICT DO NOTHING: an existing row, e.g. an admin's choice, is never overridden.
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled)
SELECT om.organization_id, n.code, true
  FROM organization_metrics om
 CROSS JOIN (VALUES ('HOP_SL_TRIPLE_BL_L'), ('HOP_SL_TRIPLE_BL_R'), ('HOP_SL_TRIPLE_BL_LSI')) AS n(code)
  JOIN site_metrics sm ON sm.code = n.code
 WHERE om.metric_code = 'HOP_SL_TRIPLE_L' AND om.is_enabled = true
ON CONFLICT (organization_id, metric_code) DO NOTHING;

-- ============================================================================
-- Block D - LSI screening set (all genders, no sport)
-- ============================================================================
INSERT INTO benchmark_sets (id, organization_id, name, description, sport, level, gender, is_template, is_active)
SELECT 'set-screening-triple-hop-bl-asymmetry', NULL, 'Triple Hop Bilateral Landing Asymmetry Screening',
       'Screening tiers for HOP_SL_TRIPLE_BL_LSI, all genders: 90% or more symmetrical, 85-90% mild deficit, under 85% high asymmetry flag. Tiers reflect injury-risk screening thresholds, not competitive levels.',
       NULL, NULL, NULL, true, true
 WHERE EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_BL_LSI')
ON CONFLICT DO NOTHING;

INSERT INTO site_benchmarks (
  id, metric_code, name, description, comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color, coaching_note,
  is_system_default, is_active, display_order
)
SELECT t.id, 'HOP_SL_TRIPLE_BL_LSI', t.name, t.description, 'range', t.min_value, t.max_value,
       'a7c0b0e1-0174-4174-8174-000000000001'::uuid, t.tier_order, t.tier_name, t.tier_color, t.coaching_note,
       true, true, t.tier_order
  FROM (VALUES
    ('bench-triple-hop-bl-lsi-symmetrical', 'Triple Hop BL LSI - Symmetrical', 'LSI 90% or more. Symmetrical / optimal.',
     90::numeric, 100::numeric, 1, 'Symmetrical', 'green',
     'Clear for the high-velocity unilateral demands of the sport.'),
    ('bench-triple-hop-bl-lsi-mild', 'Triple Hop BL LSI - Mild Deficit', 'LSI 85-90%. Mild deficit.',
     85, 89.999, 2, 'Mild Deficit', 'yellow',
     'Monitor. Add unilateral strength and bounding progressions.'),
    ('bench-triple-hop-bl-lsi-flag', 'Triple Hop BL LSI - High Asymmetry Flag', 'LSI under 85%. High asymmetry flag.',
     0, 84.999, 3, 'High Asymmetry Flag', 'red',
     'Significant eccentric deceleration or horizontal force deficit; elevated non-contact injury risk. Targeted unilateral work on the weaker leg before progressing to high-intensity reactive work.')
  ) AS t(id, name, description, min_value, max_value, tier_order, tier_name, tier_color, coaching_note)
 WHERE EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_BL_LSI')
ON CONFLICT (metric_code, name) DO NOTHING;

INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
SELECT 'bsi-' || substr(b.id, 7), 'set-screening-triple-hop-bl-asymmetry', b.id, 'site', b.tier_order
  FROM site_benchmarks b
 WHERE b.id IN ('bench-triple-hop-bl-lsi-symmetrical', 'bench-triple-hop-bl-lsi-mild', 'bench-triple-hop-bl-lsi-flag')
   AND EXISTS (SELECT 1 FROM benchmark_sets WHERE id = 'set-screening-triple-hop-bl-asymmetry')
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO NOTHING;

-- ============================================================================
-- Block E - Summary
-- ============================================================================
DO $$
DECLARE
  v_metrics TEXT;
  v_tiers   INTEGER;
BEGIN
  SELECT string_agg(code, ', ' ORDER BY code) INTO v_metrics FROM site_metrics WHERE code LIKE 'HOP_SL_TRIPLE_BL_%';
  SELECT COUNT(*) INTO v_tiers FROM site_benchmarks WHERE metric_code = 'HOP_SL_TRIPLE_BL_LSI';
  RAISE NOTICE 'Migration 0174 complete: metrics present: %; % LSI tier rows.', COALESCE(v_metrics, 'none (HOP_SL_TRIPLE_L / _R not found, skipped)'), v_tiers;
END $$;
