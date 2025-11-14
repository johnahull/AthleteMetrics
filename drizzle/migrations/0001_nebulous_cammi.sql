CREATE TABLE "custom_benchmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"metric_code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"benchmark_value" numeric(10, 3) NOT NULL,
	"comparison_operator" varchar(10) DEFAULT 'lte' NOT NULL,
	"gender" varchar(20),
	"age_min" integer,
	"age_max" integer,
	"position" varchar(50),
	"level" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 999 NOT NULL,
	"color" varchar(20),
	"icon" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "organization_benchmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"benchmark_id" varchar NOT NULL,
	"benchmark_type" varchar(10) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"custom_name" varchar(100),
	"display_order" integer DEFAULT 999 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "organization_benchmarks_organization_id_benchmark_id_benchmark_type_unique" UNIQUE("organization_id","benchmark_id","benchmark_type"),
	CONSTRAINT "org_benchmarks_display_order_unique" UNIQUE("organization_id","display_order")
);
--> statement-breakpoint
CREATE TABLE "organization_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"metric_code" varchar(50) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"display_order" integer,
	"custom_label" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "organization_metrics_organization_id_metric_code_unique" UNIQUE("organization_id","metric_code")
);
--> statement-breakpoint
CREATE TABLE "report_benchmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar NOT NULL,
	"metric_code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"benchmark_value" numeric(10, 3) NOT NULL,
	"comparison_operator" varchar(10) DEFAULT 'lte' NOT NULL,
	"gender" varchar(20),
	"age_min" integer,
	"age_max" integer,
	"position" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar NOT NULL,
	"public_token" varchar(64) NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"created_by" varchar,
	"expires_at" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" varchar,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_snapshots_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar,
	"name" varchar(200) NOT NULL,
	"description" text,
	"report_type" varchar(50) NOT NULL,
	"config" jsonb NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "site_benchmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"benchmark_value" numeric(10, 3) NOT NULL,
	"comparison_operator" varchar(10) DEFAULT 'lte' NOT NULL,
	"gender" varchar(20),
	"age_min" integer,
	"age_max" integer,
	"position" varchar(50),
	"level" varchar(50),
	"is_system_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 999 NOT NULL,
	"color" varchar(20),
	"icon" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp,
	CONSTRAINT "site_benchmarks_metric_name_unique" UNIQUE("metric_code","name")
);
--> statement-breakpoint
CREATE TABLE "site_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"category" varchar(50),
	"unit" varchar(20),
	"lower_is_better" boolean DEFAULT true NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer,
	"description" text,
	"sport_associations" text[],
	"validation_min" numeric(10, 3),
	"validation_max" numeric(10, 3),
	"decimal_precision" integer DEFAULT 3 NOT NULL,
	"color" varchar(20),
	"icon" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp,
	CONSTRAINT "site_metrics_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "benchmarks_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "allow_custom_benchmarks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_benchmarks" ADD CONSTRAINT "custom_benchmarks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_benchmarks" ADD CONSTRAINT "custom_benchmarks_metric_code_site_metrics_code_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."site_metrics"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_benchmarks" ADD CONSTRAINT "custom_benchmarks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_benchmarks" ADD CONSTRAINT "organization_benchmarks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_metrics" ADD CONSTRAINT "organization_metrics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_metrics" ADD CONSTRAINT "organization_metrics_metric_code_site_metrics_code_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."site_metrics"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_benchmarks" ADD CONSTRAINT "report_benchmarks_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_benchmarks" ADD CONSTRAINT "report_benchmarks_metric_code_site_metrics_code_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."site_metrics"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_benchmarks" ADD CONSTRAINT "site_benchmarks_metric_code_site_metrics_code_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."site_metrics"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_benchmarks" ADD CONSTRAINT "site_benchmarks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_metrics" ADD CONSTRAINT "site_metrics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_benchmarks_org_idx" ON "custom_benchmarks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "custom_benchmarks_metric_idx" ON "custom_benchmarks" USING btree ("metric_code");--> statement-breakpoint
CREATE INDEX "custom_benchmarks_org_active_idx" ON "custom_benchmarks" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "org_benchmarks_org_enabled_idx" ON "organization_benchmarks" USING btree ("organization_id","is_enabled");--> statement-breakpoint
CREATE INDEX "org_benchmarks_benchmark_idx" ON "organization_benchmarks" USING btree ("benchmark_id","benchmark_type");--> statement-breakpoint
CREATE INDEX "org_benchmarks_type_id_idx" ON "organization_benchmarks" USING btree ("benchmark_type","benchmark_id");--> statement-breakpoint
CREATE INDEX "org_benchmarks_org_benchmark_idx" ON "organization_benchmarks" USING btree ("organization_id","benchmark_id");--> statement-breakpoint
CREATE INDEX "org_benchmarks_enabled_idx" ON "organization_benchmarks" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "org_metrics_org_idx" ON "organization_metrics" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_metrics_org_enabled_idx" ON "organization_metrics" USING btree ("organization_id","is_enabled");--> statement-breakpoint
CREATE INDEX "report_benchmarks_report_idx" ON "report_benchmarks" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_benchmarks_metric_idx" ON "report_benchmarks" USING btree ("metric_code");--> statement-breakpoint
CREATE INDEX "report_snapshots_token_idx" ON "report_snapshots" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "report_snapshots_report_idx" ON "report_snapshots" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_snapshots_expires_idx" ON "report_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "report_snapshots_active_idx" ON "report_snapshots" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "report_snapshots_active_expires_idx" ON "report_snapshots" USING btree ("is_active","expires_at");--> statement-breakpoint
CREATE INDEX "reports_org_idx" ON "reports" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reports_created_by_idx" ON "reports" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "reports_type_idx" ON "reports" USING btree ("report_type");--> statement-breakpoint
CREATE INDEX "reports_org_type_idx" ON "reports" USING btree ("organization_id","report_type");--> statement-breakpoint
CREATE INDEX "reports_pinned_idx" ON "reports" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "reports_org_pinned_idx" ON "reports" USING btree ("organization_id","is_pinned");--> statement-breakpoint
CREATE INDEX "site_benchmarks_metric_idx" ON "site_benchmarks" USING btree ("metric_code");--> statement-breakpoint
CREATE INDEX "site_benchmarks_active_idx" ON "site_benchmarks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "site_benchmarks_metric_active_idx" ON "site_benchmarks" USING btree ("metric_code","is_active");--> statement-breakpoint
CREATE INDEX "site_benchmarks_filters_idx" ON "site_benchmarks" USING btree ("metric_code","gender","level");--> statement-breakpoint
CREATE INDEX "site_metrics_active_idx" ON "site_metrics" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "site_metrics_code_idx" ON "site_metrics" USING btree ("code");--> statement-breakpoint
CREATE INDEX "site_metrics_category_idx" ON "site_metrics" USING btree ("category");