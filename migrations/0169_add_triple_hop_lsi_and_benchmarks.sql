-- Migration 0169: single-leg triple hop Limb Symmetry Index and benchmarks
--
-- Adds on top of HOP_SL_TRIPLE_L / HOP_SL_TRIPLE_R (feet, see 0168):
--   A - HOP_SL_TRIPLE_LSI derived metric: (min(L, R) / max(L, R)) * 100, higher is better, 100 = symmetric
--   B - organization enablement: an organization with HOP_SL_TRIPLE_L enabled gets the LSI enabled
--   C - 'Triple Hop Asymmetry Screening' set: Symmetrical >= 90 / Mild Deficit 85-90 / High Asymmetry Flag < 85 (all genders)
--   D - soccer distance tiers per leg for male and female athletes: College / HS Varsity / Youth / Below Youth
--   E - RAISE NOTICE summary
--
-- The protocol research defines LSI as non-dominant / dominant. Limb dominance is not stored, so the metric uses the
-- shorter leg over the longer leg. Distance tiers use each level's lower bound (the research ranges overlap), converted
-- from meters to feet and rounded to 0.1; 'Below Youth' is a floor tier added below the lowest research level.
--
-- If HOP_SL_TRIPLE_L or _R is absent when this runs, everything is skipped and the migration is still recorded as
-- applied: a metric an admin creates later gets no LSI and no tiers. If either is present but not in feet (0168 not
-- applied), the distance tiers would sit on meter data, so the migration raises instead.
-- Sets are inserted with explicit ids and a bare ON CONFLICT DO NOTHING: the partial unique index benchmark_sets_unique_site_name
-- (name WHERE organization_id IS NULL) would otherwise abort the migration when a site template of that name exists.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- Do not re-run by hand: a manual re-run re-adds org rows an admin deleted.
-- Number is provisional: renumber at merge if another branch lands 0169 first.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_L')
     AND EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_R')
     AND EXISTS (SELECT 1 FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R') AND unit IS DISTINCT FROM 'ft') THEN
    RAISE EXCEPTION 'Migration 0169: HOP_SL_TRIPLE_L / _R must be in ft. Apply 0168_triple_hop_meters_to_feet first.';
  END IF;
END $$;

-- ============================================================================
-- Block A - HOP_SL_TRIPLE_LSI derived metric
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
)
SELECT
  'HOP_SL_TRIPLE_LSI',
  'Single-Leg Triple Hop Limb Symmetry Index',
  l.category,
  '%',
  'higher_is_better',
  true, true,
  COALESCE(l.display_order, 999),
  'Limb Symmetry Index between left- and right-leg single-leg triple hop distance. Computed as (shorter leg / longer leg) x 100. 100% = perfectly symmetric; 90% or more is symmetrical, 85-90% is a mild deficit, under 85% flags a high asymmetry (eccentric deceleration or horizontal force deficit, elevated non-contact injury risk).',
  1, 'green', 'Activity',
  0, 100,
  true,
  '(min(HOP_SL_TRIPLE_L, HOP_SL_TRIPLE_R) / max(HOP_SL_TRIPLE_L, HOP_SL_TRIPLE_R)) * 100',
  ARRAY['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R'],
  '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb
FROM site_metrics l
WHERE l.code = 'HOP_SL_TRIPLE_L'
  AND EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_R')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Block B - Organization enablement
-- ============================================================================
-- ON CONFLICT DO NOTHING: an existing row, e.g. an admin's choice, is never overridden.
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled)
SELECT om.organization_id, 'HOP_SL_TRIPLE_LSI', true
  FROM organization_metrics om
  JOIN site_metrics sm ON sm.code = 'HOP_SL_TRIPLE_LSI'
 WHERE om.metric_code = 'HOP_SL_TRIPLE_L' AND om.is_enabled = true
ON CONFLICT (organization_id, metric_code) DO NOTHING;

-- ============================================================================
-- Block C - LSI screening set (all genders, no sport)
-- ============================================================================
INSERT INTO benchmark_sets (id, organization_id, name, description, sport, level, gender, is_template, is_active)
SELECT 'set-screening-triple-hop-asymmetry', NULL, 'Triple Hop Asymmetry Screening',
       'Screening tiers for HOP_SL_TRIPLE_LSI, all genders: 90% or more symmetrical, 85-90% mild deficit, under 85% high asymmetry flag. Tiers reflect injury-risk screening thresholds, not competitive levels.',
       NULL, NULL, NULL, true, true
 WHERE EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_LSI')
ON CONFLICT DO NOTHING;

INSERT INTO site_benchmarks (
  id, metric_code, name, description, comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color, coaching_note,
  is_system_default, is_active, display_order
)
SELECT t.id, 'HOP_SL_TRIPLE_LSI', t.name, t.description, 'range', t.min_value, t.max_value,
       'a7c0b0e1-0169-4169-8169-000000000001'::uuid, t.tier_order, t.tier_name, t.tier_color, t.coaching_note,
       true, true, t.tier_order
  FROM (VALUES
    ('bench-triple-hop-lsi-symmetrical', 'Triple Hop LSI - Symmetrical', 'LSI 90% or more. Symmetrical / optimal.',
     90::numeric, 100::numeric, 1, 'Symmetrical', 'green',
     'Clear for the high-velocity unilateral demands of the sport.'),
    ('bench-triple-hop-lsi-mild', 'Triple Hop LSI - Mild Deficit', 'LSI 85-90%. Mild deficit.',
     85, 89.999, 2, 'Mild Deficit', 'yellow',
     'Monitor. Add unilateral strength and bounding progressions.'),
    ('bench-triple-hop-lsi-flag', 'Triple Hop LSI - High Asymmetry Flag', 'LSI under 85%. High asymmetry flag.',
     0, 84.999, 3, 'High Asymmetry Flag', 'red',
     'Significant eccentric deceleration or horizontal force deficit; elevated non-contact injury risk. Targeted unilateral work on the weaker leg before progressing to high-intensity reactive work.')
  ) AS t(id, name, description, min_value, max_value, tier_order, tier_name, tier_color, coaching_note)
 WHERE EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_LSI')
ON CONFLICT (metric_code, name) DO NOTHING;

INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
SELECT 'bsi-' || substr(b.id, 7), 'set-screening-triple-hop-asymmetry', b.id, 'site', b.tier_order
  FROM site_benchmarks b
 WHERE b.id IN ('bench-triple-hop-lsi-symmetrical', 'bench-triple-hop-lsi-mild', 'bench-triple-hop-lsi-flag')
   AND EXISTS (SELECT 1 FROM benchmark_sets WHERE id = 'set-screening-triple-hop-asymmetry')
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO NOTHING;

-- ============================================================================
-- Block D - Soccer distance tiers per leg (feet)
-- ============================================================================
INSERT INTO benchmark_sets (id, organization_id, name, description, sport, level, gender, is_template, is_active)
SELECT s.id, NULL, s.name, s.description, 'SOCCER', NULL, s.gender, true, true
  FROM (VALUES
    ('set-soccer-triple-hop-male', 'Soccer Single-Leg Triple Hop (Male)', 'Male', 'Single-leg triple hop distance tiers for male soccer athletes: College / High-Level, HS Varsity, Youth Competitive. Each level starts at the lower bound of its research range.'),
    ('set-soccer-triple-hop-female', 'Soccer Single-Leg Triple Hop (Female)', 'Female', 'Single-leg triple hop distance tiers for female soccer athletes: College / High-Level, HS Varsity, Youth Competitive. Each level starts at the lower bound of its research range.')
  ) AS s(id, name, gender, description)
 WHERE EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_L')
   AND EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_R')
ON CONFLICT DO NOTHING;

-- (gender, tier_order, tier_name, color, lower bound ft, upper bound ft); the top tier has a fixed 99.999 ceiling
INSERT INTO site_benchmarks (
  id, metric_code, name, description, comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color, sport, gender,
  is_system_default, is_active, display_order
)
SELECT 'bench-triple-hop-' || lower(g.gender) || '-' || lower(leg.side) || '-' || t.slug,
       leg.code,
       'Triple Hop ' || leg.label || ' (' || g.gender || ') - ' || t.tier_name,
       leg.label || '-leg triple hop distance, ' || lower(g.gender) || ' soccer, ' || t.tier_name || ' level.',
       'range',
       t.min_value,
       CASE WHEN t.tier_order = 1 THEN 99.999 ELSE t.max_value END,
       md5('triple-hop-distance-' || g.gender || '-' || leg.side)::uuid,
       t.tier_order, t.tier_name, t.tier_color, 'SOCCER', g.gender,
       true, true, t.tier_order
  FROM (VALUES ('Male'), ('Female')) AS g(gender)
  CROSS JOIN (VALUES ('HOP_SL_TRIPLE_L', 'l', 'Left'), ('HOP_SL_TRIPLE_R', 'r', 'Right')) AS leg(code, side, label)
  JOIN site_metrics m ON m.code = leg.code
  JOIN (VALUES
    ('Male',   1, 'college', 'College / High-Level', 'green',  21.0::numeric, NULL::numeric),
    ('Male',   2, 'hs',      'HS Varsity',           'blue',   18.7, 20.999),
    ('Male',   3, 'youth',   'Youth Competitive',    'yellow', 15.7, 18.699),
    ('Male',   4, 'below',   'Below Youth',          'red',    0,    15.699),
    ('Female', 1, 'college', 'College / High-Level', 'green',  17.1, NULL),
    ('Female', 2, 'hs',      'HS Varsity',           'blue',   15.1, 17.099),
    ('Female', 3, 'youth',   'Youth Competitive',    'yellow', 13.1, 15.099),
    ('Female', 4, 'below',   'Below Youth',          'red',    0,    13.099)
  ) AS t(gender, tier_order, slug, tier_name, tier_color, min_value, max_value) ON t.gender = g.gender
 WHERE EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_L')
   AND EXISTS (SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_R')
ON CONFLICT (metric_code, name) DO NOTHING;

INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
SELECT 'bsi-' || substr(b.id, 7), 'set-soccer-triple-hop-' || lower(b.gender), b.id, 'site',
       b.tier_order * 2 - CASE WHEN b.metric_code = 'HOP_SL_TRIPLE_L' THEN 1 ELSE 0 END
  FROM site_benchmarks b
 WHERE (b.id LIKE 'bench-triple-hop-male-%' OR b.id LIKE 'bench-triple-hop-female-%')
   AND EXISTS (SELECT 1 FROM benchmark_sets WHERE id = 'set-soccer-triple-hop-' || lower(b.gender))
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO NOTHING;

-- ============================================================================
-- Block E - Summary
-- ============================================================================
DO $$
DECLARE
  v_lsi_tiers  INTEGER;
  v_dist_tiers INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_lsi_tiers FROM site_benchmarks WHERE metric_code = 'HOP_SL_TRIPLE_LSI';
  SELECT COUNT(*) INTO v_dist_tiers FROM site_benchmarks WHERE id LIKE 'bench-triple-hop-male-%' OR id LIKE 'bench-triple-hop-female-%';
  RAISE NOTICE 'Migration 0169 complete: % LSI tier rows, % distance tier rows.', v_lsi_tiers, v_dist_tiers;
END $$;
