-- Migration: Create reports, report_snapshots, and report_benchmarks tables
-- Description: Adds support for customizable team and individual performance reports with public sharing
-- Date: 2025-11-14
-- NOTE: BEGIN/COMMIT removed - transaction is handled by apply-manual-migrations.js

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
	id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	organization_id varchar NOT NULL,
	created_by varchar,
	name varchar(200) NOT NULL,
	description text,
	report_type varchar(50) NOT NULL,
	config jsonb NOT NULL,
	is_template boolean DEFAULT false NOT NULL,
	is_pinned boolean DEFAULT false NOT NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp
);

-- Create report_snapshots table
CREATE TABLE IF NOT EXISTS report_snapshots (
	id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	report_id varchar NOT NULL,
	public_token varchar(64) NOT NULL,
	snapshot_data jsonb NOT NULL,
	created_by varchar,
	expires_at timestamp NOT NULL,
	is_active boolean DEFAULT true NOT NULL,
	revoked_at timestamp,
	revoked_by varchar,
	view_count integer DEFAULT 0 NOT NULL,
	last_viewed_at timestamp,
	created_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT report_snapshots_public_token_unique UNIQUE(public_token)
);

-- Create report_benchmarks table
CREATE TABLE IF NOT EXISTS report_benchmarks (
	id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	report_id varchar NOT NULL,
	metric_code varchar(50) NOT NULL,
	name varchar(100) NOT NULL,
	benchmark_value numeric(10, 3) NOT NULL,
	comparison_operator varchar(10) DEFAULT 'lte' NOT NULL,
	gender varchar(20),
	age_min integer,
	age_max integer,
	position varchar(50),
	created_at timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE cascade;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_created_by_users_id_fk'
  ) THEN
    ALTER TABLE reports ADD CONSTRAINT reports_created_by_users_id_fk
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE set null;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_snapshots_report_id_reports_id_fk'
  ) THEN
    ALTER TABLE report_snapshots ADD CONSTRAINT report_snapshots_report_id_reports_id_fk
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE cascade;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_snapshots_created_by_users_id_fk'
  ) THEN
    ALTER TABLE report_snapshots ADD CONSTRAINT report_snapshots_created_by_users_id_fk
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE set null;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_snapshots_revoked_by_users_id_fk'
  ) THEN
    ALTER TABLE report_snapshots ADD CONSTRAINT report_snapshots_revoked_by_users_id_fk
      FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE set null;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_benchmarks_report_id_reports_id_fk'
  ) THEN
    ALTER TABLE report_benchmarks ADD CONSTRAINT report_benchmarks_report_id_reports_id_fk
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE cascade;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_benchmarks_metric_code_site_metrics_code_fk'
  ) THEN
    ALTER TABLE report_benchmarks ADD CONSTRAINT report_benchmarks_metric_code_site_metrics_code_fk
      FOREIGN KEY (metric_code) REFERENCES site_metrics(code);
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS reports_org_idx ON reports USING btree (organization_id);
CREATE INDEX IF NOT EXISTS reports_created_by_idx ON reports USING btree (created_by);
CREATE INDEX IF NOT EXISTS reports_type_idx ON reports USING btree (report_type);
CREATE INDEX IF NOT EXISTS reports_org_type_idx ON reports USING btree (organization_id, report_type);
CREATE INDEX IF NOT EXISTS reports_pinned_idx ON reports USING btree (is_pinned);
CREATE INDEX IF NOT EXISTS reports_org_pinned_idx ON reports USING btree (organization_id, is_pinned);

CREATE INDEX IF NOT EXISTS report_snapshots_token_idx ON report_snapshots USING btree (public_token);
CREATE INDEX IF NOT EXISTS report_snapshots_report_idx ON report_snapshots USING btree (report_id);
CREATE INDEX IF NOT EXISTS report_snapshots_expires_idx ON report_snapshots USING btree (expires_at);
CREATE INDEX IF NOT EXISTS report_snapshots_active_idx ON report_snapshots USING btree (is_active);
CREATE INDEX IF NOT EXISTS report_snapshots_active_expires_idx ON report_snapshots USING btree (is_active, expires_at);

CREATE INDEX IF NOT EXISTS report_benchmarks_report_idx ON report_benchmarks USING btree (report_id);
CREATE INDEX IF NOT EXISTS report_benchmarks_metric_idx ON report_benchmarks USING btree (metric_code);
