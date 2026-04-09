-- Migration 0117: Add Sprint Force-Velocity Profile support
-- Creates sprint_fv_profiles table and adds sprint_fv_enabled toggle to site_settings and organizations

-- Sprint F-V Profiles table
CREATE TABLE IF NOT EXISTS "sprint_fv_profiles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "submitted_by" varchar NOT NULL,
  "organization_id" varchar,
  "team_id" varchar,
  "team_name_snapshot" text,
  "date" date NOT NULL,
  "body_mass_kg" numeric(6, 2) NOT NULL,
  "distance_unit" text NOT NULL,
  "split_times_json" jsonb NOT NULL,
  "source_measurement_ids" text[] NOT NULL,
  "weight_measurement_id" varchar,
  "event_id" varchar,
  "vmax" numeric(10, 4),
  "tau" numeric(10, 4),
  "f0_rel" numeric(10, 4),
  "v0" numeric(10, 4),
  "pmax_rel" numeric(10, 4),
  "fv_slope" numeric(10, 6),
  "rf_peak" numeric(10, 4),
  "drf" numeric(10, 6),
  "fit_r2" numeric(6, 4),
  "fit_residuals" jsonb,
  "analysis_json" jsonb,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "sprint_fv_profiles_user_date_idx" ON "sprint_fv_profiles" ("user_id", "date");
CREATE INDEX IF NOT EXISTS "sprint_fv_profiles_org_idx" ON "sprint_fv_profiles" ("organization_id");
CREATE INDEX IF NOT EXISTS "sprint_fv_profiles_event_idx" ON "sprint_fv_profiles" ("event_id");

-- Feature toggle: site-level
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "sprint_fv_enabled" boolean NOT NULL DEFAULT false;

-- Feature toggle: org-level
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "sprint_fv_enabled" boolean NOT NULL DEFAULT false;
