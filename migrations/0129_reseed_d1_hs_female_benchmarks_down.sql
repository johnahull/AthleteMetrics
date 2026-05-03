-- Down Migration 0129: Reverse D1 + HS Female Benchmark Seeding
--
-- Reverses migration 0129 in dependency-safe order:
--   Step 1 — benchmark_set_items rows (soft refs, no FK)
--   Step 2 — site_benchmarks rows (FK from set_items already cleared above)
--   Step 3 — benchmark_sets rows (FK from site_benchmarks via set membership;
--            site_benchmarks rows already deleted above)
--
-- Idempotent: bounded by deterministic IDs so re-running is a no-op once
-- rows are gone.
--
-- WARNING: This down migration cannot perfectly restore prior state if the
-- benchmark sets were modified outside the migration system after 0129
-- applied. It restores the schema state to "0129 not applied" but does not
-- attempt to recreate any earlier `0105`-style values (those were rejected
-- by John and never landed anywhere; restoring them is not desired).
--
-- Block A0 site_metrics rows (DASH_10YD, DASH_20YD, FLY10_TIME, TOP_SPEED_MPH,
-- AGILITY_505, AGILITY_5105, VERTICAL_JUMP, APPROACH_JUMP, BLOCK_JUMP) are
-- intentionally NOT removed by this down migration. They are shared prerequisites
-- that may have existed before 0129 (migration 0107 was supposed to seed them),
-- and removing them could break other migrations or data that depend on them.
-- An operator expecting a clean rollback should be aware: these metric definitions
-- will remain in site_metrics after this down migration runs.

-- ============================================================================
-- Step 1 — benchmark_set_items rows (Block F reversal)
-- ============================================================================
DELETE FROM benchmark_set_items
 WHERE id IN (
   -- D1 soccer
   'bsi-d1-soc-dash10-d1-avg', 'bsi-d1-soc-dash10-d1-top25',
   'bsi-d1-soc-dash20-hs-avg', 'bsi-d1-soc-dash20-d1-avg', 'bsi-d1-soc-dash20-d1-top25',
   'bsi-d1-soc-fly10-d1-avg', 'bsi-d1-soc-fly10-d1-top25',
   'bsi-d1-soc-tspd-hs-avg', 'bsi-d1-soc-tspd-d1-avg', 'bsi-d1-soc-tspd-d1-top25',
   'bsi-d1-soc-agi5105-d1-avg', 'bsi-d1-soc-agi5105-d1-top25',
   'bsi-d1-soc-agi505-d1-avg', 'bsi-d1-soc-agi505-d1-top25',
   'bsi-d1-soc-vj-d1-avg', 'bsi-d1-soc-vj-d1-top25',
   -- D1 volleyball
   'bsi-d1-vb-dash10-d1-avg', 'bsi-d1-vb-dash10-d1-top25',
   'bsi-d1-vb-dash20-hs-avg', 'bsi-d1-vb-dash20-d1-avg', 'bsi-d1-vb-dash20-d1-top25',
   'bsi-d1-vb-agi5105-d1-avg', 'bsi-d1-vb-agi5105-d1-top25',
   'bsi-d1-vb-agi505-d1-avg', 'bsi-d1-vb-agi505-d1-top25',
   'bsi-d1-vb-vj-d1-avg', 'bsi-d1-vb-vj-d1-top25',
   'bsi-d1-vb-appj-d1-avg', 'bsi-d1-vb-appj-d1-top25',
   'bsi-d1-vb-blkj-d1-avg', 'bsi-d1-vb-blkj-d1-top25',
   -- HS soccer
   'bsi-hs-ms-soc-dash10', 'bsi-hs-ms-soc-dash20', 'bsi-hs-ms-soc-fly10',
   'bsi-hs-ms-soc-tspd', 'bsi-hs-ms-soc-vj', 'bsi-hs-ms-soc-agi505', 'bsi-hs-ms-soc-agi5105',
   'bsi-hs-jv-soc-dash10', 'bsi-hs-jv-soc-dash20', 'bsi-hs-jv-soc-fly10',
   'bsi-hs-jv-soc-tspd', 'bsi-hs-jv-soc-vj', 'bsi-hs-jv-soc-agi505', 'bsi-hs-jv-soc-agi5105',
   'bsi-hs-var-soc-dash10', 'bsi-hs-var-soc-dash20', 'bsi-hs-var-soc-fly10',
   'bsi-hs-var-soc-tspd', 'bsi-hs-var-soc-vj', 'bsi-hs-var-soc-agi505', 'bsi-hs-var-soc-agi5105',
   -- HS volleyball
   'bsi-hs-ms-vb-dash10', 'bsi-hs-ms-vb-vj', 'bsi-hs-ms-vb-appj', 'bsi-hs-ms-vb-blkj',
   'bsi-hs-ms-vb-agi505', 'bsi-hs-ms-vb-agi5105',
   'bsi-hs-jv-vb-dash10', 'bsi-hs-jv-vb-vj', 'bsi-hs-jv-vb-appj', 'bsi-hs-jv-vb-blkj',
   'bsi-hs-jv-vb-agi505', 'bsi-hs-jv-vb-agi5105',
   'bsi-hs-var-vb-dash10', 'bsi-hs-var-vb-vj', 'bsi-hs-var-vb-appj', 'bsi-hs-var-vb-blkj',
   'bsi-hs-var-vb-agi505', 'bsi-hs-var-vb-agi5105'
 );

-- ============================================================================
-- Step 2 — site_benchmarks rows (Blocks B, C, D, E reversal)
-- ============================================================================
DELETE FROM site_benchmarks
 WHERE id IN (
   -- D1 soccer
   'd1-soc-dash10-d1-avg', 'd1-soc-dash10-d1-top25',
   'd1-soc-dash20-hs-avg', 'd1-soc-dash20-d1-avg', 'd1-soc-dash20-d1-top25',
   'd1-soc-fly10-d1-avg', 'd1-soc-fly10-d1-top25',
   'd1-soc-tspd-hs-avg', 'd1-soc-tspd-d1-avg', 'd1-soc-tspd-d1-top25',
   'd1-soc-agi5105-d1-avg', 'd1-soc-agi5105-d1-top25',
   'd1-soc-agi505-d1-avg', 'd1-soc-agi505-d1-top25',
   'd1-soc-vj-d1-avg', 'd1-soc-vj-d1-top25',
   -- D1 volleyball
   'd1-vb-dash10-d1-avg', 'd1-vb-dash10-d1-top25',
   'd1-vb-dash20-hs-avg', 'd1-vb-dash20-d1-avg', 'd1-vb-dash20-d1-top25',
   'd1-vb-agi5105-d1-avg', 'd1-vb-agi5105-d1-top25',
   'd1-vb-agi505-d1-avg', 'd1-vb-agi505-d1-top25',
   'd1-vb-vj-d1-avg', 'd1-vb-vj-d1-top25',
   'd1-vb-appj-d1-avg', 'd1-vb-appj-d1-top25',
   'd1-vb-blkj-d1-avg', 'd1-vb-blkj-d1-top25',
   -- HS soccer
   'hs-ms-soc-dash10', 'hs-ms-soc-dash20', 'hs-ms-soc-fly10',
   'hs-ms-soc-tspd', 'hs-ms-soc-vj', 'hs-ms-soc-agi505', 'hs-ms-soc-agi5105',
   'hs-jv-soc-dash10', 'hs-jv-soc-dash20', 'hs-jv-soc-fly10',
   'hs-jv-soc-tspd', 'hs-jv-soc-vj', 'hs-jv-soc-agi505', 'hs-jv-soc-agi5105',
   'hs-var-soc-dash10', 'hs-var-soc-dash20', 'hs-var-soc-fly10',
   'hs-var-soc-tspd', 'hs-var-soc-vj', 'hs-var-soc-agi505', 'hs-var-soc-agi5105',
   -- HS volleyball
   'hs-ms-vb-dash10', 'hs-ms-vb-vj', 'hs-ms-vb-appj', 'hs-ms-vb-blkj',
   'hs-ms-vb-agi505', 'hs-ms-vb-agi5105',
   'hs-jv-vb-dash10', 'hs-jv-vb-vj', 'hs-jv-vb-appj', 'hs-jv-vb-blkj',
   'hs-jv-vb-agi505', 'hs-jv-vb-agi5105',
   'hs-var-vb-dash10', 'hs-var-vb-vj', 'hs-var-vb-appj', 'hs-var-vb-blkj',
   'hs-var-vb-agi505', 'hs-var-vb-agi5105'
 );

-- ============================================================================
-- Step 3 — benchmark_sets rows (Block A reversal)
-- ============================================================================
DELETE FROM benchmark_sets
 WHERE id IN (
   'd1-womens-soccer',
   'd1-womens-volleyball',
   'hs-ms-female-soccer',
   'hs-jv-female-soccer',
   'hs-varsity-female-soccer',
   'hs-ms-female-volleyball',
   'hs-jv-female-volleyball',
   'hs-varsity-female-volleyball'
 );

DO $$
BEGIN
  RAISE NOTICE 'Migration 0129 (down): Removed 8 benchmark sets, all D1 + HS female benchmark rows, and all linking benchmark_set_items.';
END $$;
