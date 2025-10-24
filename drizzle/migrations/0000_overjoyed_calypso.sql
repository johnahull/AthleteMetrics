CREATE TABLE "athlete_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"emergency_contact" text,
	"medical_notes" text,
	"coach_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36),
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(50),
	"resource_id" varchar(255),
	"details" text,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"organization_id" varchar NOT NULL,
	"team_ids" text[],
	"player_id" varchar,
	"role" text NOT NULL,
	"invited_by" varchar,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending',
	"is_used" boolean DEFAULT false NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp,
	"accepted_at" timestamp,
	"accepted_by" varchar,
	"cancelled_at" timestamp,
	"cancelled_by" varchar,
	"last_attempt_at" timestamp,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"submitted_by" varchar NOT NULL,
	"verified_by" varchar,
	"is_verified" boolean DEFAULT false NOT NULL,
	"date" date NOT NULL,
	"age" integer NOT NULL,
	"metric" text NOT NULL,
	"value" numeric(10, 3) NOT NULL,
	"units" text NOT NULL,
	"fly_in_distance" numeric(10, 3),
	"notes" text,
	"team_id" varchar,
	"team_name_snapshot" text,
	"organization_id" varchar,
	"season" text,
	"team_context_auto" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"location" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar(255) PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL,
	"user_id" varchar
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" text NOT NULL,
	"level" text,
	"notes" text,
	"archived_at" timestamp,
	"season" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "user_organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"season" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"emails" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"password" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"full_name" text NOT NULL,
	"birth_date" date,
	"birth_year" integer,
	"graduation_year" integer,
	"school" text,
	"phone_numbers" text[],
	"sports" text[],
	"positions" text[],
	"height" integer,
	"weight" integer,
	"gender" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret" text,
	"backup_codes" text[],
	"last_login_at" timestamp,
	"login_attempts" integer DEFAULT 0,
	"locked_until" timestamp,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"requires_password_change" boolean DEFAULT false NOT NULL,
	"password_changed_at" timestamp,
	"is_site_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_teams" ADD CONSTRAINT "user_teams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_teams" ADD CONSTRAINT "user_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "teams_org_name_idx" ON "teams" USING btree ("organization_id","name");