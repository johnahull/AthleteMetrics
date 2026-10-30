-- Migration 0169: seed 5-10-5 Pro Agility (AGILITY_5105) tier benchmarks, per sex x sport x level
--
-- Source: compiled norms table supplied by the product owner (electronic / FAT timing; hand-timed runs read
-- about 0.15-0.25 s faster). No primary citation, so every row is marked provisional.
--
-- One 4-tier group (Elite / Competitive / Average / Developing) per sex x sport x level:
--   Male   : FOOTBALL, SOCCER, BASKETBALL, BASEBALL, LACROSSE
--   Female : SOCCER, BASKETBALL, VOLLEYBALL, SOFTBALL, LACROSSE
--   Levels : NCAA D1 (19+), HS Varsity (16-18), HS JV / Freshman (14-15), MS 8th grade (13), MS 6th-7th grade (11-12)
--   = 10 sports x 5 levels x 4 tiers = 200 site_benchmarks rows, 10 benchmark_sets (one per sex x sport), 200 set items.
-- Sport is never NULL: the eval report matches on sport, and a sport-specific tier group beats a single "Average" row.
-- Age bands do not overlap (age 14 is JV only). D1 starts at 19 so it does not match high-school athletes in
-- getAthleteBenchmarkStatus, which filters on age and sex only; the eval age-group matcher skips rows without both bounds.
--
-- Bands step by 0.001 (measurements are decimal(10,3)): evaluateTierBenchmark gives a shared boundary to the
-- better tier, so "Competitive 4.30-4.50" and "Elite < 4.30" need Elite to end at 4.299.
-- Names are "<Group> - <Tier>" with no range after the dash, so deriveTierGroupName gives one label per group (see 0167).
--
-- The 0129 Female SOCCER / VOLLEYBALL single "Average" rows are left active: the eval report keeps comparing against
-- the single Average (tier-match.ts ignores AGILITY_5105 tier groups) and saved report sets still reference them.
-- Idempotent. The upsert never touches is_active, so a re-run does not re-enable a row an admin switched off.
-- Reversible: 0169_seed_5105_tier_benchmarks_down.sql.
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT here.
-- Requires the AGILITY_5105 site_metrics row (0129 / seed-default-metrics).

-- ============================================================================
-- Block A — 200 tier rows
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
)
SELECT
  'b5105-' || lower(left(s.sex, 1)) || '-' || s.scode || '-' || b.lcode || '-' || t.tcode,
  'AGILITY_5105',
  '5-10-5 ' || s.sex || ' ' || initcap(s.sport) || ' ' || b.llabel || ' - ' || t.tname,
  'Electronic timing (FAT); hand-timed runs read ~0.15-0.25 s faster. Compiled norms, no primary citation. '
    || 'Confidence: LOW-MEDIUM; provisional - replace with BTA internal data at N>=30.',
  'range',
  CASE t.tier_order
    WHEN 1 THEN 0
    WHEN 2 THEN b.c1
    WHEN 3 THEN b.c2 + 0.001
    ELSE b.c3 + 0.001
  END,
  CASE t.tier_order
    WHEN 1 THEN b.c1 - 0.001
    WHEN 2 THEN b.c2
    WHEN 3 THEN b.c3
    ELSE 10
  END,
  md5('5105-' || s.sex || '-' || s.sport || '-' || b.lcode)::uuid,
  t.tier_order, t.tname, t.color,
  s.sex, s.sport, b.level, b.age_min, b.age_max,
  true, true, b.lord * 10 + t.tier_order
FROM (VALUES
  ('Male',   'FOOTBALL',   'ftb'),
  ('Male',   'SOCCER',     'soc'),
  ('Male',   'BASKETBALL', 'bsk'),
  ('Male',   'BASEBALL',   'bsb'),
  ('Male',   'LACROSSE',   'lax'),
  ('Female', 'SOCCER',     'soc'),
  ('Female', 'BASKETBALL', 'bsk'),
  ('Female', 'VOLLEYBALL', 'vb'),
  ('Female', 'SOFTBALL',   'sb'),
  ('Female', 'LACROSSE',   'lax')
) AS s(sex, sport, scode)
-- level is 'HS' for the MS rows too: no dedicated MS level value exists, so HS is the catch-all
JOIN (VALUES
  ('Male',   1, 'd1',   'NCAA D1 (19+)',            'D1', 19, NULL::int, 4.10, 4.25, 4.40),
  ('Male',   2, 'var',  'HS Varsity (16-18)',       'HS', 16, 18,        4.30, 4.50, 4.75),
  ('Male',   3, 'jv',   'HS JV Freshman (14-15)',   'HS', 14, 15,        4.50, 4.70, 4.95),
  ('Male',   4, 'ms8',  'MS 8th Grade (13)',        'HS', 13, 13,        4.70, 4.95, 5.25),
  ('Male',   5, 'ms67', 'MS 6th-7th Grade (11-12)', 'HS', 11, 12,        4.90, 5.20, 5.55),
  ('Female', 1, 'd1',   'NCAA D1 (19+)',            'D1', 19, NULL::int, 4.45, 4.65, 4.85),
  ('Female', 2, 'var',  'HS Varsity (16-18)',       'HS', 16, 18,        4.70, 4.95, 5.20),
  ('Female', 3, 'jv',   'HS JV Freshman (14-15)',   'HS', 14, 15,        4.90, 5.15, 5.40),
  ('Female', 4, 'ms8',  'MS 8th Grade (13)',        'HS', 13, 13,        5.10, 5.35, 5.65),
  ('Female', 5, 'ms67', 'MS 6th-7th Grade (11-12)', 'HS', 11, 12,        5.30, 5.60, 6.00)
) AS b(sex, lord, lcode, llabel, level, age_min, age_max, c1, c2, c3) ON b.sex = s.sex
CROSS JOIN (VALUES
  (1, 'elite', 'Elite',       'green'),
  (2, 'comp',  'Competitive', 'blue'),
  (3, 'avg',   'Average',     'gray'),
  (4, 'dev',   'Developing',  'yellow')
) AS t(tier_order, tcode, tname, color)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  tier_group_id = EXCLUDED.tier_group_id,
  tier_order = EXCLUDED.tier_order,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  age_min = EXCLUDED.age_min,
  age_max = EXCLUDED.age_max,
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block B — 10 benchmark sets (sex x sport) and their 200 items
-- ============================================================================
INSERT INTO benchmark_sets (id, organization_id, name, description, sport, level, gender, is_template, is_active)
SELECT
  'set-5105-' || lower(left(s.sex, 1)) || '-' || s.scode,
  NULL,
  '5-10-5 Tiers - ' || s.sex || ' ' || initcap(s.sport),
  '5-10-5 Pro Agility tiers (Elite / Competitive / Average / Developing) for ' || s.sex || ' ' || lower(s.sport)
    || ' athletes: NCAA D1 (19+), HS Varsity (16-18), HS JV / Freshman (14-15), MS 8th grade (13), MS 6th-7th grade (11-12). '
    || 'Electronic timing; provisional compiled norms.',
  s.sport, NULL, s.sex, true, true
FROM (VALUES
  ('Male',   'FOOTBALL',   'ftb'),
  ('Male',   'SOCCER',     'soc'),
  ('Male',   'BASKETBALL', 'bsk'),
  ('Male',   'BASEBALL',   'bsb'),
  ('Male',   'LACROSSE',   'lax'),
  ('Female', 'SOCCER',     'soc'),
  ('Female', 'BASKETBALL', 'bsk'),
  ('Female', 'VOLLEYBALL', 'vb'),
  ('Female', 'SOFTBALL',   'sb'),
  ('Female', 'LACROSSE',   'lax')
) AS s(sex, sport, scode)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sport = EXCLUDED.sport,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template,
  updated_at = NOW();

-- split_part(bm.id, '-', 3) is the sport code in 'b5105-<sex>-<scode>-...'
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
SELECT 'bsi-' || bm.id, 'set-5105-' || lower(left(bm.gender, 1)) || '-' || split_part(bm.id, '-', 3), bm.id, 'site', bm.display_order
FROM site_benchmarks bm
WHERE bm.metric_code = 'AGILITY_5105' AND bm.id LIKE 'b5105-%'
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block C — count checks
-- ============================================================================
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM site_benchmarks
   WHERE metric_code = 'AGILITY_5105' AND id LIKE 'b5105-%' AND tier_group_id IS NOT NULL;
  IF n <> 200 THEN
    RAISE EXCEPTION 'Migration 0169: expected 200 5-10-5 tier rows, got %', n;
  END IF;

  SELECT count(*) INTO n FROM benchmark_set_items WHERE set_id LIKE 'set-5105-%';
  IF n <> 200 THEN
    RAISE EXCEPTION 'Migration 0169: expected 200 5-10-5 set items, got %', n;
  END IF;

  SELECT count(*) INTO n FROM benchmark_sets WHERE id LIKE 'set-5105-%';
  IF n <> 10 THEN
    RAISE EXCEPTION 'Migration 0169: expected 10 5-10-5 benchmark sets, got %', n;
  END IF;

  RAISE NOTICE 'Migration 0169: seeded 200 5-10-5 tier rows, 10 sets';
END $$;
