-- Migration 0032: Add benchmark group tables for composite benchmarks
-- Allows benchmarks to be organized into groups (e.g., "NCAA D1 Women's Soccer")
-- Supports both site-wide groups (site admin managed) and org-specific groups

-- Site-level benchmark groups (master catalog)
CREATE TABLE IF NOT EXISTS "site_benchmark_groups" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "display_order" integer DEFAULT 999 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp,
  CONSTRAINT "site_benchmark_groups_name_unique" UNIQUE("name")
);

CREATE INDEX IF NOT EXISTS "site_benchmark_groups_active_idx" ON "site_benchmark_groups" USING btree ("is_active");
CREATE INDEX IF NOT EXISTS "site_benchmark_groups_display_order_idx" ON "site_benchmark_groups" USING btree ("display_order");

-- Organization-specific custom benchmark groups
CREATE TABLE IF NOT EXISTS "custom_benchmark_groups" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "display_order" integer DEFAULT 999 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp,
  CONSTRAINT "custom_benchmark_groups_org_name_unique" UNIQUE("organization_id", "name")
);

CREATE INDEX IF NOT EXISTS "custom_benchmark_groups_org_idx" ON "custom_benchmark_groups" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "custom_benchmark_groups_org_active_idx" ON "custom_benchmark_groups" USING btree ("organization_id", "is_active");

-- Many-to-many: Site benchmarks to site benchmark groups
CREATE TABLE IF NOT EXISTS "site_benchmark_group_members" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" varchar NOT NULL REFERENCES "site_benchmark_groups"("id") ON DELETE CASCADE,
  "benchmark_id" varchar NOT NULL REFERENCES "site_benchmarks"("id") ON DELETE CASCADE,
  "display_order" integer DEFAULT 999 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "site_benchmark_group_members_unique" UNIQUE("group_id", "benchmark_id")
);

CREATE INDEX IF NOT EXISTS "site_benchmark_group_members_group_idx" ON "site_benchmark_group_members" USING btree ("group_id");
CREATE INDEX IF NOT EXISTS "site_benchmark_group_members_benchmark_idx" ON "site_benchmark_group_members" USING btree ("benchmark_id");

-- Many-to-many: Custom benchmarks to custom benchmark groups
CREATE TABLE IF NOT EXISTS "custom_benchmark_group_members" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" varchar NOT NULL REFERENCES "custom_benchmark_groups"("id") ON DELETE CASCADE,
  "benchmark_id" varchar NOT NULL REFERENCES "custom_benchmarks"("id") ON DELETE CASCADE,
  "display_order" integer DEFAULT 999 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "custom_benchmark_group_members_unique" UNIQUE("group_id", "benchmark_id")
);

CREATE INDEX IF NOT EXISTS "custom_benchmark_group_members_group_idx" ON "custom_benchmark_group_members" USING btree ("group_id");
CREATE INDEX IF NOT EXISTS "custom_benchmark_group_members_benchmark_idx" ON "custom_benchmark_group_members" USING btree ("benchmark_id");
