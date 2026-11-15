-- Migration 0181: HS football position tier groups (40 yd, pro agility, vertical jump, broad jump)
--
-- Source: McKay BD, Miramonti AA, Gillen ZM, et al. "Normative reference values for high school-aged American
-- football players." J Strength Cond Res 34(10): 2849-2856, 2020. Males, grades 9-11 pooled (n = 7,478), Zybek
-- recruiting combines 2015-16, laser timing gates started on hand release. Only the published position percentiles
-- (Tables 3, 4, 6, 7) are stored, not the article text.
--
-- Five tiers per position and metric from the published deciles: Elite = P90, Excellent = P80, Above Average = P60,
-- Average = P40, Below Average = P20. Values worse than P20 are graded Below Average by the tier evaluator's fallback.
-- Times use `lte`, jumps use `gte`. The paper's LB/DE/TE column is copied to LB, DE and TE.
-- Vertical and broad jump are published in cm and are converted to inches (the app unit) in SQL.
--
-- Rows are bounded to ages 13-18 (the paper has no ages; it covers grades 9-11), so adults are not graded on them.
-- The eval report matcher skips position-specific rows (tier-match.ts), since it does not know the position.
-- Each row carries position, so the athlete-profile tier lookup only grades a player against their own position's
-- group (filterTierRowsForAthlete). display_order 0 sorts these groups ahead of the generic HS boys sets. Not
-- auto-enabled: an organization enables the set (or the benchmarks) itself.
--
-- Block A — 180 tier benchmarks (9 positions x 4 metrics x 5 tiers)
-- Block B — site benchmark set
-- Block C — set items
-- Block D — summary

INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_group_id, tier_order, tier_name, tier_color,
  gender, sport, position, level, age_min, age_max, applicable_org_types,
  is_system_default, is_active, display_order
)
SELECT
  'mckay2020-' || lower(m.code) || '-' || lower(p.pos) || '-' || t.tcode,
  m.code,
  'HS Football ' || p.pos || ' ' || m.label || ' - ' || t.tname,
  'McKay et al. 2020, JSCR 34(10): HS football ' || p.pos || ' ' || m.label || ', males grades 9-11 pooled, laser timed from hand release. '
    || 'Cutoff = published ' || t.pctl || 'th percentile.',
  m.op,
  CASE WHEN m.conv THEN round((v.vals[t.vidx] / 2.54)::numeric, 1) ELSE v.vals[t.vidx]::numeric END,
  md5('mckay2020-' || m.code || '-' || p.pos)::uuid,
  t.tier_order, t.tname, t.color,
  'Male', 'FOOTBALL', p.pos, 'HS', 13, 18, ARRAY['high_school'],
  true, true, 0
FROM (VALUES
  ('DASH_40YD',     '40 yd',          'lte', false),
  ('AGILITY_5105',  'Pro agility',    'lte', false),
  ('VERTICAL_JUMP', 'Vertical jump',  'gte', true),
  ('JUMP_BROAD',    'Broad jump',     'gte', true)
) AS m(code, label, op, conv)
JOIN (VALUES
  ('DB', 'DB'), ('DL', 'DL'), ('LB', 'LBDETE'), ('DE', 'LBDETE'), ('TE', 'LBDETE'),
  ('OL', 'OL'), ('QB', 'QB'), ('RB', 'RB'), ('WR', 'WR')
) AS p(pos, col) ON true
JOIN (VALUES
  (1, 'elite',     'Elite',         'green',  90, 1),
  (2, 'excellent', 'Excellent',     'blue',   80, 2),
  (3, 'above-avg', 'Above Average', 'gray',   60, 3),
  (4, 'average',   'Average',       'yellow', 40, 4),
  (5, 'below-avg', 'Below Average', 'orange', 20, 5)
) AS t(tier_order, tcode, tname, color, pctl, vidx) ON true
-- vals = {P90, P80, P60, P40, P20} per paper column; vidx indexes into it
JOIN (VALUES
  -- Table 3: 40-yard dash (s)
  ('DASH_40YD', 'DB',     ARRAY[4.83, 4.91, 5.01, 5.11, 5.26]),
  ('DASH_40YD', 'DL',     ARRAY[5.10, 5.23, 5.44, 5.61, 5.87]),
  ('DASH_40YD', 'LBDETE', ARRAY[4.97, 5.06, 5.20, 5.33, 5.49]),
  ('DASH_40YD', 'OL',     ARRAY[5.43, 5.55, 5.75, 5.95, 6.20]),
  ('DASH_40YD', 'QB',     ARRAY[4.91, 5.01, 5.14, 5.26, 5.43]),
  ('DASH_40YD', 'RB',     ARRAY[4.80, 4.89, 5.00, 5.11, 5.25]),
  ('DASH_40YD', 'WR',     ARRAY[4.80, 4.88, 5.01, 5.12, 5.28]),
  -- Table 4: pro agility (s)
  ('AGILITY_5105', 'DB',     ARRAY[4.26, 4.33, 4.43, 4.53, 4.66]),
  ('AGILITY_5105', 'DL',     ARRAY[4.47, 4.57, 4.71, 4.87, 5.11]),
  ('AGILITY_5105', 'LBDETE', ARRAY[4.35, 4.43, 4.56, 4.68, 4.83]),
  ('AGILITY_5105', 'OL',     ARRAY[4.67, 4.77, 4.94, 5.10, 5.28]),
  ('AGILITY_5105', 'QB',     ARRAY[4.33, 4.40, 4.51, 4.61, 4.74]),
  ('AGILITY_5105', 'RB',     ARRAY[4.27, 4.35, 4.46, 4.57, 4.71]),
  ('AGILITY_5105', 'WR',     ARRAY[4.25, 4.32, 4.43, 4.53, 4.68]),
  -- Table 6: vertical jump (cm)
  ('VERTICAL_JUMP', 'DB',     ARRAY[78.7, 73.7, 68.6, 63.5, 58.4]),
  ('VERTICAL_JUMP', 'DL',     ARRAY[71.1, 66.0, 59.7, 54.6, 49.5]),
  ('VERTICAL_JUMP', 'LBDETE', ARRAY[74.2, 69.9, 63.5, 59.7, 54.6]),
  ('VERTICAL_JUMP', 'OL',     ARRAY[64.8, 61.0, 53.3, 49.5, 45.7]),
  ('VERTICAL_JUMP', 'QB',     ARRAY[76.2, 71.1, 66.0, 62.2, 57.2]),
  ('VERTICAL_JUMP', 'RB',     ARRAY[78.7, 73.7, 68.6, 63.5, 58.4]),
  ('VERTICAL_JUMP', 'WR',     ARRAY[78.7, 73.7, 67.3, 63.5, 58.4]),
  -- Table 7: broad jump (cm)
  ('JUMP_BROAD', 'DB',     ARRAY[284.5, 276.9, 264.2, 254.0, 241.3]),
  ('JUMP_BROAD', 'DL',     ARRAY[264.2, 251.5, 233.7, 221.0, 205.7]),
  ('JUMP_BROAD', 'LBDETE', ARRAY[274.3, 264.2, 248.9, 238.8, 225.6]),
  ('JUMP_BROAD', 'OL',     ARRAY[238.8, 228.6, 215.9, 205.7, 190.5]),
  ('JUMP_BROAD', 'QB',     ARRAY[276.9, 266.7, 254.0, 243.8, 231.1]),
  ('JUMP_BROAD', 'RB',     ARRAY[281.9, 271.8, 261.6, 248.9, 236.2]),
  ('JUMP_BROAD', 'WR',     ARRAY[284.5, 276.9, 264.2, 254.0, 241.3])
) AS v(code, col, vals) ON v.code = m.code AND v.col = p.col
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_group_id = EXCLUDED.tier_group_id,
  tier_order = EXCLUDED.tier_order,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  position = EXCLUDED.position,
  level = EXCLUDED.level,
  applicable_org_types = EXCLUDED.applicable_org_types,
  display_order = EXCLUDED.display_order,
  is_active = true,
  updated_at = NOW();

INSERT INTO benchmark_sets (
  id, organization_id, name, description, sport, level, gender,
  is_template, is_active
) VALUES (
  'set-hs-football-position-mckay2020',
  NULL,
  'HS Football by Position (McKay 2020)',
  'Five-tier high school football grading by position (DB, DL, LB, DE, TE, OL, QB, RB, WR) for the 40 yd, pro agility, vertical jump and broad jump. McKay et al. 2020, JSCR 34(10).',
  'FOOTBALL',
  'HS',
  'Male',
  true, true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template,
  is_active = true,
  updated_at = NOW();

INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
SELECT
  'bsi-' || substr(md5(sb.id), 1, 32), -- 36 chars: exactly the varchar(36) limit on the real DB; shortening the md5 slice is safe, lengthening or a longer prefix truncates
  'set-hs-football-position-mckay2020',
  sb.id,
  'site',
  row_number() OVER (ORDER BY sb.metric_code, sb.position, sb.tier_order)
FROM site_benchmarks sb
WHERE sb.id LIKE 'mckay2020-%'
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

DO $$
DECLARE
  v_tiers INTEGER;
  v_groups INTEGER;
  v_items INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT tier_group_id) INTO v_tiers, v_groups FROM site_benchmarks WHERE id LIKE 'mckay2020-%';
  SELECT COUNT(*) INTO v_items FROM benchmark_set_items WHERE set_id = 'set-hs-football-position-mckay2020';
  RAISE NOTICE 'Migration 0181 complete: % tier rows in % groups, % set items.', v_tiers, v_groups, v_items;
END $$;
