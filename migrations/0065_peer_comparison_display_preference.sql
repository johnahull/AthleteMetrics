-- Migration 0065: Rename peer_comparison_opt_in to show_peer_comparisons
-- Privacy model change: All athlete data contributes to anonymous peer pool.
-- The toggle now controls whether an athlete SEES peer comparisons (display preference),
-- not whether they contribute data.

-- Step 1: Rename the column
ALTER TABLE "users" RENAME COLUMN "peer_comparison_opt_in" TO "show_peer_comparisons";

-- Step 2: Change the default from false to true (show comparisons by default)
ALTER TABLE "users" ALTER COLUMN "show_peer_comparisons" SET DEFAULT true;

-- Step 3: Update all existing users to show peer comparisons (backfill)
UPDATE "users" SET "show_peer_comparisons" = true;

-- Note: peer_comparison_consented_at is kept for historical records but is no longer used
-- since there's no data sharing consent needed (data is always anonymized in the pool)
