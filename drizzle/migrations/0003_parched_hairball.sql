CREATE TABLE "goals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"metric" text NOT NULL,
	"goal_type" text NOT NULL,
	"target_value" numeric(10, 3) NOT NULL,
	"baseline_value" numeric(10, 3) NOT NULL,
	"current_value" numeric(10, 3) NOT NULL,
	"target_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"achieved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "site_positions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport_id" varchar NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"short_name" varchar(10),
	"description" text,
	"display_order" integer,
	"color" varchar(20),
	"is_system_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp,
	CONSTRAINT "site_positions_sport_code_unique" UNIQUE("sport_id","code")
);
--> statement-breakpoint
CREATE TABLE "site_sports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"color" varchar(20),
	"display_order" integer,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_at" timestamp,
	CONSTRAINT "site_sports_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "wellness_templates" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "wellness_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "wellness_module_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "wellness_templates" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "wellness_templates" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "wellness_templates" ADD COLUMN "is_system_seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "wellness_templates" ADD COLUMN "source_template_id" varchar;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_positions" ADD CONSTRAINT "site_positions_sport_id_site_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."site_sports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_positions" ADD CONSTRAINT "site_positions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_sports" ADD CONSTRAINT "site_sports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_status_idx" ON "goals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "goals_user_status_idx" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "goals_metric_idx" ON "goals" USING btree ("metric");--> statement-breakpoint
CREATE INDEX "goals_target_date_idx" ON "goals" USING btree ("target_date");--> statement-breakpoint
CREATE INDEX "goals_user_metric_idx" ON "goals" USING btree ("user_id","metric");--> statement-breakpoint
CREATE INDEX "site_positions_sport_idx" ON "site_positions" USING btree ("sport_id");--> statement-breakpoint
CREATE INDEX "site_positions_active_idx" ON "site_positions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "site_positions_sport_active_idx" ON "site_positions" USING btree ("sport_id","is_active");--> statement-breakpoint
CREATE INDEX "site_sports_active_idx" ON "site_sports" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "site_sports_code_idx" ON "site_sports" USING btree ("code");--> statement-breakpoint
CREATE INDEX "site_sports_display_order_idx" ON "site_sports" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "idx_wellness_responses_recent" ON "wellness_responses" USING btree ("submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_wellness_responses_org_date_submitted" ON "wellness_responses" USING btree ("organization_id","date" DESC NULLS LAST,"submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_wellness_responses_request_user" ON "wellness_responses" USING btree ("request_id","user_id") WHERE "wellness_responses"."request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_wellness_responses_team_date_submitted" ON "wellness_responses" USING btree ("team_id","date" DESC NULLS LAST,"submitted_at" DESC NULLS LAST) WHERE "wellness_responses"."team_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_wellness_responses_user_submitted" ON "wellness_responses" USING btree ("user_id","submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "wellness_templates_category_idx" ON "wellness_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "wellness_templates_system_seeded_idx" ON "wellness_templates" USING btree ("is_system_seeded");--> statement-breakpoint
CREATE INDEX "idx_wellness_templates_system_active" ON "wellness_templates" USING btree ("is_system_seeded","is_active","created_at" DESC NULLS LAST) WHERE "wellness_templates"."organization_id" IS NULL AND "wellness_templates"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_wellness_templates_org_active" ON "wellness_templates" USING btree ("organization_id","is_active","created_at" DESC NULLS LAST) WHERE "wellness_templates"."organization_id" IS NOT NULL;