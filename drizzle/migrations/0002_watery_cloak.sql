CREATE TABLE "site_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_model" text DEFAULT 'gpt-5-nano' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "wellness_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"requested_by" varchar,
	"distribution_method" varchar(50) NOT NULL,
	"target_athlete_ids" text[],
	"target_team_ids" text[],
	"public_token" varchar(64),
	"requires_auth" boolean DEFAULT false NOT NULL,
	"scheduled_for" timestamp,
	"expires_at" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wellness_requests_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "wellness_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar,
	"organization_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"user_full_name" text NOT NULL,
	"team_id" varchar,
	"team_name_snapshot" text,
	"submitted_at" timestamp NOT NULL,
	"date" date NOT NULL,
	"responses" jsonb NOT NULL,
	"access_method" varchar(50),
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wellness_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "org_type" text DEFAULT 'club' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ai_enabled_by_site_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "coaching_insights" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "coaching_insights_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "coaching_insights_model" text;--> statement-breakpoint
ALTER TABLE "site_benchmarks" ADD COLUMN "applicable_org_types" text[];--> statement-breakpoint
ALTER TABLE "site_metrics" ADD COLUMN "available_org_types" text[];--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "sport" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_requests" ADD CONSTRAINT "wellness_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_requests" ADD CONSTRAINT "wellness_requests_template_id_wellness_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."wellness_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_requests" ADD CONSTRAINT "wellness_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_responses" ADD CONSTRAINT "wellness_responses_request_id_wellness_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."wellness_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_templates" ADD CONSTRAINT "wellness_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_templates" ADD CONSTRAINT "wellness_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wellness_requests_org_idx" ON "wellness_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wellness_requests_token_idx" ON "wellness_requests" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "wellness_requests_status_idx" ON "wellness_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wellness_requests_scheduled_idx" ON "wellness_requests" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "wellness_responses_user_idx" ON "wellness_responses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wellness_responses_org_idx" ON "wellness_responses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wellness_responses_date_idx" ON "wellness_responses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "wellness_responses_team_idx" ON "wellness_responses" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "wellness_responses_submitted_idx" ON "wellness_responses" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "wellness_responses_user_date_idx" ON "wellness_responses" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "wellness_templates_org_idx" ON "wellness_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wellness_templates_active_idx" ON "wellness_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "site_benchmarks_org_types_idx" ON "site_benchmarks" USING btree ("applicable_org_types");--> statement-breakpoint
CREATE INDEX "site_metrics_available_org_types_idx" ON "site_metrics" USING btree ("available_org_types");