-- Migration 0178: age-group tiers for JUMP_CMJ_HOH (counter-movement jump, hands on hips; inches) per sex
--
-- Source: OVR Performance (@ovrperformance) "CMJ Height Normative Data" chart, male and female jump height in inches for
-- Middle School, High School, Collegiate and Professional, with the bands Average / Good / Advanced / Elite. Compiled norms,
-- no primary citation. Hands on hips, no arm swing (VERTICAL_JUMP permits arm swing and is NOT comparable).
--   Male   : MS 14.9/17.0/19.2; HS 19.2/21.3/22.4; College 20.4/22.4/23.5; Pro 21.3/23.5/24.5
--   Female : MS 11.7/13.8/16.0; HS 14.9/17.0/18.1; College 16.0/18.1/19.2; Pro 17.0/19.2/20.2
--   (Good / Advanced / Elite lower bounds, inches.)
--
-- Chart-to-tier mapping: the chart lists Average-Good-Advanced-Elite; stored as tier_order 1 Elite (green), 2 Advanced (blue),
-- 3 Good (gray), 4 Average (yellow), so tier_order 1 is best as for every higher_is_better group. The chart has no band below
-- Average, so Average runs from 0 up; the chart's one gap (College male 20.2-20.4) is closed into Average. Elite is open-ended
-- (stored up to 50, the metric's validation_max). Bands step by 0.001 (measurements are decimal(10,3)), as in 0172:
-- evaluateTierBenchmark gives a shared boundary to the better tier.
--
-- Levels map to age, because tier selection uses age and sex, not a level label: MS 11-13, HS 14-18, College 19-22, Pro 23+
-- (no upper bound). `level` is free text on site_benchmarks; no code filters it for this metric.
--
-- Block A adds 32 tier rows (8 groups x 4 tiers), id prefix cmjhoh-; Block B adds 2 template sets ("CMJ HOH Tiers - Male" /
-- "- Female", sport NULL) with 16 items each; Block B2 ENABLES all 32 rows for EVERY organization (analytics reach site
-- benchmarks only through enabled organization_benchmarks rows), display_order continuing after the org's current max.
-- Existing rows, including ones an admin disabled, are left alone (ON CONFLICT DO NOTHING). Organizations created after this
-- migration enable the rows themselves.
--
-- NULL sport and the eval report: matchTierGroup (tier-match.ts) requires sameText(row.sport, athlete.sport), false for a NULL
-- sport, so eval reports are unchanged. The tiers show in athlete analytics (GET /api/analytics/benchmark-tiers, which
-- narrows to the athlete's sex and age before picking a group) and in benchmark views.
--
-- Female display_order is offset by +100 so the 32 rows have distinct orders.
-- Idempotent. No upsert touches is_active, so a re-run does not re-enable a row or set an admin switched off.
-- Reversible: 0178_seed_cmj_hoh_tiers_down.sql.
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT here.
-- Requires the JUMP_CMJ_HOH site_metrics row (0135); the FK on metric_code fails the migration loudly if it is missing.

-- ============================================================================
-- Block A — 32 tier rows
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
)
SELECT
  'cmjhoh-' || lower(left(b.sex, 1)) || '-' || b.lcode || '-' || t.tcode,
  'JUMP_CMJ_HOH',
  'CMJ HOH ' || b.sex || ' ' || b.llabel || ' - ' || t.tname,
  'Hands-on-hips counter-movement jump height, inches (no arm swing). Source: OVR Performance "CMJ Height Normative Data" '
    || '(compiled norms, no primary citation). Confidence: LOW; provisional - replace with BTA internal data at N>=30.',
  'range',
  CASE t.tier_order
    WHEN 1 THEN b.c3
    WHEN 2 THEN b.c2
    WHEN 3 THEN b.c1
    ELSE 0
  END,
  CASE t.tier_order
    WHEN 1 THEN 50
    WHEN 2 THEN b.c3 - 0.001
    WHEN 3 THEN b.c2 - 0.001
    ELSE b.c1 - 0.001
  END,
  md5('cmjhoh-' || b.sex || '-' || b.lcode)::uuid,
  t.tier_order, t.tname, t.color,
  b.sex, NULL, b.level, b.age_min, b.age_max,
  true, true, b.lord * 10 + t.tier_order + CASE WHEN b.sex = 'Female' THEN 100 ELSE 0 END
FROM (VALUES
  ('Male',   1, 'ms',  'Middle School (11-13)', 'MS',      11, 13,        14.9, 17.0, 19.2),
  ('Male',   2, 'hs',  'High School (14-18)',   'HS',      14, 18,        19.2, 21.3, 22.4),
  ('Male',   3, 'col', 'Collegiate (19-22)',    'College', 19, 22,        20.4, 22.4, 23.5),
  ('Male',   4, 'pro', 'Professional (23+)',    'Pro',     23, NULL::int, 21.3, 23.5, 24.5),
  ('Female', 1, 'ms',  'Middle School (11-13)', 'MS',      11, 13,        11.7, 13.8, 16.0),
  ('Female', 2, 'hs',  'High School (14-18)',   'HS',      14, 18,        14.9, 17.0, 18.1),
  ('Female', 3, 'col', 'Collegiate (19-22)',    'College', 19, 22,        16.0, 18.1, 19.2),
  ('Female', 4, 'pro', 'Professional (23+)',    'Pro',     23, NULL::int, 17.0, 19.2, 20.2)
) AS b(sex, lord, lcode, llabel, level, age_min, age_max, c1, c2, c3)
CROSS JOIN (VALUES
  (1, 'elite', 'Elite',    'green'),
  (2, 'adv',   'Advanced', 'blue'),
  (3, 'good',  'Good',     'gray'),
  (4, 'avg',   'Average',  'yellow')
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
-- Block B — 2 template sets (one per sex) and their 32 items
-- ============================================================================
INSERT INTO benchmark_sets (id, organization_id, name, description, sport, level, gender, is_template, is_active)
SELECT
  'set-cmjhoh-' || lower(left(s.sex, 1)),
  NULL,
  'CMJ HOH Tiers - ' || s.sex,
  'Hands-on-hips CMJ height tiers (Elite / Advanced / Good / Average) for ' || lower(s.sex)
    || ' athletes: Middle School (11-13), High School (14-18), Collegiate (19-22), Professional (23+). '
    || 'Provisional compiled norms. Not sport-specific.',
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
SELECT 'bsi-' || bm.id, 'set-cmjhoh-' || lower(left(bm.gender, 1)), bm.id, 'site', bm.display_order
FROM site_benchmarks bm
WHERE bm.metric_code = 'JUMP_CMJ_HOH' AND bm.id LIKE 'cmjhoh-%'
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block B2 — enable the 32 rows for every organization
-- ============================================================================
INSERT INTO organization_benchmarks (organization_id, benchmark_id, benchmark_type, is_enabled, display_order)
SELECT
  c.organization_id, c.benchmark_id, 'site', true,
  COALESCE(mx.max_order, 0) + row_number() OVER (PARTITION BY c.organization_id ORDER BY c.display_order, c.benchmark_id)
FROM (
  SELECT o.id AS organization_id, g.id AS benchmark_id, g.display_order
  FROM organizations o
  CROSS JOIN site_benchmarks g
  WHERE g.metric_code = 'JUMP_CMJ_HOH' AND g.id LIKE 'cmjhoh-%'
    AND NOT EXISTS (
      SELECT 1 FROM organization_benchmarks e
       WHERE e.organization_id = o.id AND e.benchmark_id = g.id AND e.benchmark_type = 'site'
    )
) c
LEFT JOIN (
  SELECT organization_id, max(display_order) AS max_order FROM organization_benchmarks GROUP BY organization_id
) mx ON mx.organization_id = c.organization_id
-- Explicit target: only the (org, benchmark, type) duplicate is skipped. A display_order clash with a concurrent app enable
-- violates the separate partial unique index org_benchmarks_display_order_unique (0024) and is NOT covered, so it raises
-- and rolls the migration back instead of silently dropping a row. (CI test DBs are built with db:push and lack that index.)
ON CONFLICT (organization_id, benchmark_id, benchmark_type) DO NOTHING;

-- ============================================================================
-- Block C — count checks
-- ============================================================================
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM site_benchmarks
   WHERE metric_code = 'JUMP_CMJ_HOH' AND id LIKE 'cmjhoh-%' AND tier_group_id IS NOT NULL AND sport IS NULL;
  IF n <> 32 THEN
    RAISE EXCEPTION 'Migration 0178: expected 32 CMJ HOH tier rows, got %', n;
  END IF;

  SELECT count(*) INTO n FROM benchmark_sets WHERE id LIKE 'set-cmjhoh-%';
  IF n <> 2 THEN
    RAISE EXCEPTION 'Migration 0178: expected 2 CMJ HOH sets, got %', n;
  END IF;

  SELECT count(*) INTO n FROM benchmark_set_items WHERE set_id LIKE 'set-cmjhoh-%';
  IF n <> 32 THEN
    RAISE EXCEPTION 'Migration 0178: expected 32 CMJ HOH set items, got %', n;
  END IF;

  SELECT count(*) INTO n FROM organizations o
   WHERE (SELECT count(*) FROM organization_benchmarks e
           WHERE e.organization_id = o.id AND e.benchmark_type = 'site' AND e.benchmark_id LIKE 'cmjhoh-%') <> 32;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Migration 0178: % organizations do not have all 32 CMJ HOH rows (enabled or disabled by an admin)', n;
  END IF;

  RAISE NOTICE 'Migration 0178: 32 CMJ HOH tier rows, 2 sets, 32 set items, enablement rows for every organization';
END $$;
