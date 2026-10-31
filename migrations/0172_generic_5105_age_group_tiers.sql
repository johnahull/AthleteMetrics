-- Migration 0172: generic age-group 5-10-5 Pro Agility (AGILITY_5105) tiers per sex; retire the sport-specific ones
--
-- 0170 seeded 200 sport-specific tier rows (b5105-*), 10 sets (set-5105-*) and 200 set items. The product owner wants
-- generic age-group benchmarks per sex only. The 0170 cutoffs never varied by sport (they depend only on sex x level),
-- so the 10 sex x level cutoff triples are carried over unchanged, with sport = NULL:
--   Male   : D1 19+ 4.10/4.25/4.40; HS Varsity 16-18 4.30/4.50/4.75; HS JV 14-15 4.50/4.70/4.95;
--            MS 8th 13 4.70/4.95/5.25; MS 6th-7th 11-12 4.90/5.20/5.55
--   Female : D1 19+ 4.45/4.65/4.85; Varsity 4.70/4.95/5.20; JV 4.90/5.15/5.40; MS 8th 5.10/5.35/5.65; MS 6th-7th 5.30/5.60/6.00
--   (Elite / Competitive / Average upper bounds, seconds, electronic FAT timing.)
--
-- Block A adds 40 tier rows (10 groups x 4 tiers), id prefix b5105g-; Block B adds 2 template sets
-- ("5-10-5 Tiers - Male" / "- Female", sport NULL) with 20 items each; Block C DEACTIVATES (never deletes) the 200
-- b5105-% rows and the 10 set-5105-% sets, so saved reports, org selections and set items that reference them do not break.
--
-- NULL sport and the eval report: matchTierGroup (tier-match.ts) requires sameText(row.sport, athlete.sport), which is
-- false for a NULL sport, and AVERAGE_ONLY_CODES keeps AGILITY_5105 off tier groups anyway. The eval report therefore
-- still compares only against the single age-group Average rows; the 0129 Female SOCCER / VOLLEYBALL rows are untouched.
--
-- Bands step by 0.001 (measurements are decimal(10,3)), as in 0170: evaluateTierBenchmark gives a shared boundary to the
-- better tier. Names are "<Group> - <Tier>" so deriveTierGroupName gives one label per group (see 0167).
-- Idempotent. No upsert touches is_active, so a re-run does not re-enable a row or set an admin switched off.
-- Reversible: 0172_generic_5105_age_group_tiers_down.sql.
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT here.
-- Requires 0170 (the rows to retire) and the AGILITY_5105 site_metrics row.

-- ============================================================================
-- Block A — 40 generic tier rows
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
)
SELECT
  'b5105g-' || lower(left(b.sex, 1)) || '-' || b.lcode || '-' || t.tcode,
  'AGILITY_5105',
  '5-10-5 ' || b.sex || ' ' || b.llabel || ' - ' || t.tname,
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
  md5('5105g-' || b.sex || '-' || b.lcode)::uuid,
  t.tier_order, t.tname, t.color,
  b.sex, NULL, b.level, b.age_min, b.age_max,
  true, true, b.lord * 10 + t.tier_order
FROM (VALUES
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
) AS b(sex, lord, lcode, llabel, level, age_min, age_max, c1, c2, c3)
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
-- Block B — 2 template sets (one per sex) and their 40 items
-- ============================================================================
INSERT INTO benchmark_sets (id, organization_id, name, description, sport, level, gender, is_template, is_active)
SELECT
  'set-5105g-' || lower(left(s.sex, 1)),
  NULL,
  '5-10-5 Tiers - ' || s.sex,
  '5-10-5 Pro Agility tiers (Elite / Competitive / Average / Developing) for ' || lower(s.sex)
    || ' athletes: NCAA D1 (19+), HS Varsity (16-18), HS JV / Freshman (14-15), MS 8th grade (13), MS 6th-7th grade (11-12). '
    || 'Electronic timing; provisional compiled norms. Not sport-specific.',
  NULL, NULL, s.sex, true, true
FROM (VALUES ('Male'), ('Female')) AS s(sex)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sport = EXCLUDED.sport,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template,
  updated_at = NOW();

INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
SELECT 'bsi-' || bm.id, 'set-5105g-' || lower(left(bm.gender, 1)), bm.id, 'site', bm.display_order
FROM site_benchmarks bm
WHERE bm.metric_code = 'AGILITY_5105' AND bm.id LIKE 'b5105g-%'
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block C — retire the sport-specific rows from 0170 (deactivate, keep the data)
-- ============================================================================
UPDATE site_benchmarks SET is_active = false
 WHERE metric_code = 'AGILITY_5105' AND id LIKE 'b5105-%' AND is_active;

UPDATE benchmark_sets SET is_active = false, updated_at = NOW()
 WHERE id LIKE 'set-5105-%' AND is_active;

-- ============================================================================
-- Block D — count checks
-- ============================================================================
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM site_benchmarks
   WHERE metric_code = 'AGILITY_5105' AND id LIKE 'b5105g-%' AND tier_group_id IS NOT NULL AND sport IS NULL;
  IF n <> 40 THEN
    RAISE EXCEPTION 'Migration 0172: expected 40 generic 5-10-5 tier rows, got %', n;
  END IF;

  SELECT count(*) INTO n FROM benchmark_sets WHERE id LIKE 'set-5105g-%';
  IF n <> 2 THEN
    RAISE EXCEPTION 'Migration 0172: expected 2 generic 5-10-5 sets, got %', n;
  END IF;

  SELECT count(*) INTO n FROM benchmark_set_items WHERE set_id LIKE 'set-5105g-%';
  IF n <> 40 THEN
    RAISE EXCEPTION 'Migration 0172: expected 40 generic 5-10-5 set items, got %', n;
  END IF;

  SELECT count(*) INTO n FROM site_benchmarks WHERE metric_code = 'AGILITY_5105' AND id LIKE 'b5105-%' AND is_active;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Migration 0172: % sport-specific 5-10-5 rows are still active', n;
  END IF;

  SELECT count(*) INTO n FROM benchmark_sets WHERE id LIKE 'set-5105-%' AND is_active;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Migration 0172: % sport-specific 5-10-5 sets are still active', n;
  END IF;

  RAISE NOTICE 'Migration 0172: 40 generic 5-10-5 tier rows, 2 sets; sport-specific rows and sets deactivated';
END $$;
