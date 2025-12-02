CREATE TABLE "peer_percentile_cache" (
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
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "peer_percentile_cache_metric_filters_unique" UNIQUE("metric_code","filter_criteria")
);
--> statement-breakpoint
ALTER TABLE "site_benchmarks" ADD COLUMN "benchmark_source" varchar(20) DEFAULT 'static' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_benchmarks" ADD COLUMN "peer_percentile_target" integer;--> statement-breakpoint
ALTER TABLE "site_benchmarks" ADD COLUMN "peer_filter_criteria" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "peer_comparison_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "peer_comparison_consented_at" timestamp;--> statement-breakpoint
ALTER TABLE "peer_percentile_cache" ADD CONSTRAINT "peer_percentile_cache_metric_code_site_metrics_code_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."site_metrics"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "peer_percentile_cache_metric_idx" ON "peer_percentile_cache" USING btree ("metric_code");--> statement-breakpoint
CREATE INDEX "peer_percentile_cache_expires_idx" ON "peer_percentile_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "site_benchmarks_peer_idx" ON "site_benchmarks" USING btree ("benchmark_source");