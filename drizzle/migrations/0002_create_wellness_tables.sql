-- Migration: Create Wellness Tables
-- Description: Create base wellness_templates, wellness_requests, and wellness_responses tables
-- Author: Claude (automated fix)
-- Date: 2025-11-26

-- Create wellness_templates table
CREATE TABLE IF NOT EXISTS "wellness_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" varchar, -- Nullable for system templates, no CASCADE (see fix below)
  "name" varchar(200) NOT NULL,
  "description" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "config" jsonb NOT NULL,
  "created_by" varchar,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create wellness_requests table
CREATE TABLE IF NOT EXISTS "wellness_requests" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" varchar NOT NULL,
  "template_id" varchar NOT NULL,
  "requested_by" varchar,
  "distribution_method" varchar(50) NOT NULL,
  "target_athlete_ids" text[],
  "target_team_ids" text[],
  "public_token" varchar(64) UNIQUE,
  "requires_auth" boolean DEFAULT false NOT NULL,
  "scheduled_for" timestamp,
  "expires_at" timestamp,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create wellness_responses table (historical references pattern)
CREATE TABLE IF NOT EXISTS "wellness_responses" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" varchar,
  "organization_id" varchar NOT NULL, -- Historical reference (no FK)
  "template_id" varchar NOT NULL, -- Historical reference (no FK)
  "user_id" varchar NOT NULL, -- Historical reference (no FK)
  "user_full_name" text NOT NULL,
  "team_id" varchar, -- Historical reference (no FK)
  "team_name_snapshot" text,
  "submitted_at" timestamp NOT NULL,
  "date" date NOT NULL,
  "responses" jsonb NOT NULL,
  "access_method" varchar(50),
  "ip_address" varchar(45),
  "user_agent" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints (NO CASCADE for templates to preserve historical data)
ALTER TABLE "wellness_templates"
  ADD CONSTRAINT "wellness_templates_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL;

ALTER TABLE "wellness_templates"
  ADD CONSTRAINT "wellness_templates_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "wellness_requests"
  ADD CONSTRAINT "wellness_requests_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "wellness_requests"
  ADD CONSTRAINT "wellness_requests_template_id_fk"
  FOREIGN KEY ("template_id") REFERENCES "wellness_templates"("id") ON DELETE CASCADE;

ALTER TABLE "wellness_requests"
  ADD CONSTRAINT "wellness_requests_requested_by_fk"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- wellness_responses uses requestId with SET NULL (request can be deleted but response preserved)
ALTER TABLE "wellness_responses"
  ADD CONSTRAINT "wellness_responses_request_id_fk"
  FOREIGN KEY ("request_id") REFERENCES "wellness_requests"("id") ON DELETE SET NULL;

-- Note: Base indexes are created in migration 0049 (wellness indexes migration)
-- This migration only creates the tables and foreign key constraints
