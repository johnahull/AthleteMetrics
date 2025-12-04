-- Migration 0006: Peer Comparison Infrastructure (Idempotent)
--
-- ARCHITECTURAL DECISION: Cross-Organization Peer Comparisons
-- ============================================================
-- The peer_percentile_cache table intentionally does NOT include an organization_id column.
-- Peer comparisons are CROSS-ORGANIZATION by design for the following reasons:
--
-- 1. Larger Sample Sizes: Cross-org comparisons provide statistically valid benchmarks
--    with sufficient sample sizes (minimum 10 athletes required for any percentile)
-- 2. Fair Comparisons: Athletes can compare against peers across all organizations,
--    not just within their own org (which may be small)
-- 3. Privacy Protection: Only verified (coach-entered) measurements are included in
--    peer pools, and all data is anonymized through aggregate statistics
-- 4. Optional Display: Athletes can opt out of VIEWING peer comparisons via the
--    show_peer_comparisons preference, but verified measurements still contribute
--    to the anonymous peer pool (covered by Terms of Service)
--
-- Filters (age, gender, sport, team, org type) are applied at query time and
-- stored in filter_criteria JSONB field, NOT via foreign key constraints.
--
-- Create peer percentile cache table
CREATE TABLE IF NOT EXISTS "peer_percentile_cache" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_code" varchar(50) NOT NULL,
	"filter_criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sample_size" integer NOT NULL,
	"p10" numeric(10, 4),
	"p25" numeric(10, 4),
	"p50" numeric(10, 4),
	"p75" numeric(10, 4),
	"p90" numeric(10, 4),
	"mean" numeric(10, 4),
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
-- Add filter_hash column for deterministic JSONB lookups (avoids key ordering issues)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='peer_percentile_cache' AND column_name='filter_hash') THEN
    ALTER TABLE "peer_percentile_cache" ADD COLUMN "filter_hash" varchar(64) GENERATED ALWAYS AS (md5(filter_criteria::text)) STORED;
  END IF;
END $$;
--> statement-breakpoint
-- Add columns to site_benchmarks if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='site_benchmarks' AND column_name='benchmark_source') THEN
    ALTER TABLE "site_benchmarks" ADD COLUMN "benchmark_source" varchar(20) DEFAULT 'static' NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='site_benchmarks' AND column_name='peer_percentile_target') THEN
    ALTER TABLE "site_benchmarks" ADD COLUMN "peer_percentile_target" integer;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='site_benchmarks' AND column_name='peer_filter_criteria') THEN
    ALTER TABLE "site_benchmarks" ADD COLUMN "peer_filter_criteria" jsonb;
  END IF;
END $$;
--> statement-breakpoint
-- Add show_peer_comparisons column (display preference, not consent)
-- Note: Migration 0065 handles renaming if old column peer_comparison_opt_in exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='show_peer_comparisons') THEN
    ALTER TABLE "users" ADD COLUMN "show_peer_comparisons" boolean DEFAULT true NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='peer_comparison_consented_at') THEN
    ALTER TABLE "users" ADD COLUMN "peer_comparison_consented_at" timestamp;
  END IF;
END $$;
--> statement-breakpoint
-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'peer_percentile_cache_metric_code_site_metrics_code_fk'
    AND table_name = 'peer_percentile_cache'
  ) THEN
    ALTER TABLE "peer_percentile_cache" ADD CONSTRAINT "peer_percentile_cache_metric_code_site_metrics_code_fk"
    FOREIGN KEY ("metric_code") REFERENCES "public"."site_metrics"("code") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "peer_percentile_cache_metric_idx" ON "peer_percentile_cache" USING btree ("metric_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "peer_percentile_cache_expires_idx" ON "peer_percentile_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "peer_percentile_cache_metric_hash_unique" ON "peer_percentile_cache" ("metric_code", "filter_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_benchmarks_peer_idx" ON "site_benchmarks" USING btree ("benchmark_source");