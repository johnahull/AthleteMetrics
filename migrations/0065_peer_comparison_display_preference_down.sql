-- Rollback Migration 0065: Revert show_peer_comparisons to peer_comparison_opt_in

-- Step 1: Rename the column back
ALTER TABLE "users" RENAME COLUMN "show_peer_comparisons" TO "peer_comparison_opt_in";

-- Step 2: Change the default back to false
ALTER TABLE "users" ALTER COLUMN "peer_comparison_opt_in" SET DEFAULT false;

-- Note: We don't rollback the data values since the previous state was mixed
