-- Migration 0065: Add show_peer_comparisons column (replaces peer_comparison_opt_in from migration 0006)
-- Privacy model change: All athlete data contributes to anonymous peer pool.
-- The toggle now controls whether an athlete SEES peer comparisons (display preference),
-- not whether they contribute data.

-- Step 1: Add show_peer_comparisons column if it doesn't exist
-- (Migration 0006 originally added peer_comparison_opt_in, but this migration supersedes that)
DO $$
BEGIN
  -- If the old column exists, rename it
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='peer_comparison_opt_in') THEN
    ALTER TABLE "users" RENAME COLUMN "peer_comparison_opt_in" TO "show_peer_comparisons";
  -- If neither column exists, create show_peer_comparisons
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='show_peer_comparisons') THEN
    ALTER TABLE "users" ADD COLUMN "show_peer_comparisons" boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Step 2: Ensure the default is true (show comparisons by default)
ALTER TABLE "users" ALTER COLUMN "show_peer_comparisons" SET DEFAULT true;

-- Note: No backfill UPDATE needed - PostgreSQL automatically applies DEFAULT values when
-- adding NOT NULL columns, so existing users already have show_peer_comparisons = true.
-- We intentionally preserve any user preferences if this migration runs multiple times.

-- Note: peer_comparison_consented_at is kept for historical records but is no longer used
-- since there's no data sharing consent needed (data is always anonymized in the pool)
