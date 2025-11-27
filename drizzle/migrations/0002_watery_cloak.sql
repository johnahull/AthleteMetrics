CREATE TABLE IF NOT EXISTS "site_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_model" text DEFAULT 'gpt-5-nano' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wellness_requests" (
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
CREATE TABLE IF NOT EXISTS "wellness_responses" (
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
CREATE TABLE IF NOT EXISTS "wellness_templates" (
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'org_type'
  ) THEN
    ALTER TABLE "organizations" ADD COLUMN "org_type" text DEFAULT 'club' NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'ai_enabled_by_site_admin'
  ) THEN
    ALTER TABLE "organizations" ADD COLUMN "ai_enabled_by_site_admin" boolean DEFAULT false NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'ai_enabled'
  ) THEN
    ALTER TABLE "organizations" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'coaching_insights'
  ) THEN
    ALTER TABLE "reports" ADD COLUMN "coaching_insights" text;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'coaching_insights_generated_at'
  ) THEN
    ALTER TABLE "reports" ADD COLUMN "coaching_insights_generated_at" timestamp;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'coaching_insights_model'
  ) THEN
    ALTER TABLE "reports" ADD COLUMN "coaching_insights_model" text;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_benchmarks' AND column_name = 'applicable_org_types'
  ) THEN
    ALTER TABLE "site_benchmarks" ADD COLUMN "applicable_org_types" text[];
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_metrics' AND column_name = 'available_org_types'
  ) THEN
    ALTER TABLE "site_metrics" ADD COLUMN "available_org_types" text[];
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'sport'
  ) THEN
    ALTER TABLE "teams" ADD COLUMN "sport" text;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_settings_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wellness_requests_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "wellness_requests" ADD CONSTRAINT "wellness_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wellness_requests_template_id_wellness_templates_id_fk'
  ) THEN
    ALTER TABLE "wellness_requests" ADD CONSTRAINT "wellness_requests_template_id_wellness_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."wellness_templates"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wellness_requests_requested_by_users_id_fk'
  ) THEN
    ALTER TABLE "wellness_requests" ADD CONSTRAINT "wellness_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wellness_responses_request_id_wellness_requests_id_fk'
  ) THEN
    ALTER TABLE "wellness_responses" ADD CONSTRAINT "wellness_responses_request_id_wellness_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."wellness_requests"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wellness_templates_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "wellness_templates" ADD CONSTRAINT "wellness_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wellness_templates_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "wellness_templates" ADD CONSTRAINT "wellness_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
