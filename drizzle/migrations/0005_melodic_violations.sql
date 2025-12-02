CREATE TABLE "global_athlete_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_athlete_id" varchar NOT NULL,
	"action" text NOT NULL,
	"actor_id" varchar,
	"actor_type" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_athlete_claims" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_athlete_id" varchar NOT NULL,
	"claimed_email" text NOT NULL,
	"token" varchar(64) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified_at" timestamp,
	CONSTRAINT "global_athlete_claims_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "global_athletes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verified_emails" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"primary_email" text,
	"canonical_first_name" text NOT NULL,
	"canonical_last_name" text NOT NULL,
	"canonical_full_name" text NOT NULL,
	"birth_date" date,
	"allow_cross_org_linking" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "user_global_athlete_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"global_athlete_id" varchar NOT NULL,
	"link_status" text DEFAULT 'pending' NOT NULL,
	"link_type" text NOT NULL,
	"proposed_by" varchar,
	"proposed_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_by" varchar,
	"confirmed_at" timestamp,
	"share_measurements" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"notified_at" timestamp,
	"notification_acknowledged_at" timestamp,
	CONSTRAINT "user_global_athlete_links_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_achievements" DROP CONSTRAINT "user_achievements_user_id_achievement_id_unique";--> statement-breakpoint
ALTER TABLE "user_achievements" DROP CONSTRAINT "user_achievements_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "user_achievements" DROP CONSTRAINT "user_achievements_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_achievements" DROP CONSTRAINT "user_achievements_achievement_id_achievement_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "site_positions" ALTER COLUMN "display_order" SET DEFAULT 999;--> statement-breakpoint
ALTER TABLE "site_positions" ALTER COLUMN "display_order" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "site_sports" ALTER COLUMN "display_order" SET DEFAULT 999;--> statement-breakpoint
ALTER TABLE "site_sports" ALTER COLUMN "display_order" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "global_athlete_id" varchar;--> statement-breakpoint
ALTER TABLE "global_athlete_audit_log" ADD CONSTRAINT "global_athlete_audit_log_global_athlete_id_global_athletes_id_fk" FOREIGN KEY ("global_athlete_id") REFERENCES "public"."global_athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_athlete_audit_log" ADD CONSTRAINT "global_athlete_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_athlete_claims" ADD CONSTRAINT "global_athlete_claims_global_athlete_id_global_athletes_id_fk" FOREIGN KEY ("global_athlete_id") REFERENCES "public"."global_athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_athletes" ADD CONSTRAINT "global_athletes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_global_athlete_links" ADD CONSTRAINT "user_global_athlete_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_global_athlete_links" ADD CONSTRAINT "user_global_athlete_links_global_athlete_id_global_athletes_id_fk" FOREIGN KEY ("global_athlete_id") REFERENCES "public"."global_athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_global_athlete_links" ADD CONSTRAINT "user_global_athlete_links_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_global_athlete_links" ADD CONSTRAINT "user_global_athlete_links_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gaal_global_athlete_idx" ON "global_athlete_audit_log" USING btree ("global_athlete_id","created_at");--> statement-breakpoint
CREATE INDEX "gaal_action_idx" ON "global_athlete_audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "gac_global_athlete_idx" ON "global_athlete_claims" USING btree ("global_athlete_id");--> statement-breakpoint
CREATE INDEX "gac_token_idx" ON "global_athlete_claims" USING btree ("token");--> statement-breakpoint
CREATE INDEX "gac_email_idx" ON "global_athlete_claims" USING btree ("claimed_email");--> statement-breakpoint
CREATE INDEX "gac_status_idx" ON "global_athlete_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "global_athletes_verified_emails_gin" ON "global_athletes" USING gin ("verified_emails");--> statement-breakpoint
CREATE INDEX "global_athletes_primary_email_idx" ON "global_athletes" USING btree ("primary_email");--> statement-breakpoint
CREATE INDEX "global_athletes_canonical_name_idx" ON "global_athletes" USING btree ("canonical_first_name","canonical_last_name");--> statement-breakpoint
CREATE INDEX "ugal_global_athlete_id_idx" ON "user_global_athlete_links" USING btree ("global_athlete_id");--> statement-breakpoint
CREATE INDEX "ugal_status_idx" ON "user_global_athlete_links" USING btree ("link_status");--> statement-breakpoint
CREATE INDEX "ugal_global_confirmed_idx" ON "user_global_athlete_links" USING btree ("global_athlete_id","link_status");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_metric_site_metrics_code_fk" FOREIGN KEY ("metric") REFERENCES "public"."site_metrics"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievement_definitions_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievement_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "measurements_global_athlete_idx" ON "measurements" USING btree ("global_athlete_id","date");--> statement-breakpoint
CREATE INDEX "user_achievements_user_org_idx" ON "user_achievements" USING btree ("user_id","organization_id");--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_organization_id_achievement_id_unique" UNIQUE("user_id","organization_id","achievement_id");