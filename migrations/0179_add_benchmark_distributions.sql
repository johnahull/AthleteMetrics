-- Migration 0179 (PROVISIONAL number, take the next free one at merge): reference distributions (AM-FEAT-024).
--
-- A version is one loaded source (label unique). Each distribution row is one raw sample for a
-- (metric, sex, age band): values are stored sorted ascending as DOUBLE PRECISION (float4 would merge
-- distinct ties). Rows are immutable: a BEFORE UPDATE OR DELETE trigger on benchmark_distributions
-- rejects any change. The trigger is NOT on the versions table, because users ON DELETE SET NULL is an
-- UPDATE of created_by and would block COPPA user deletion.
-- The db:push shape used by CI never runs this file, so the loader service enforces the same rules.
--
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT.
-- Ids are varchar(36) with gen_random_uuid().

CREATE TABLE IF NOT EXISTS benchmark_distribution_versions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(200) NOT NULL,
  source VARCHAR(200) NOT NULL,
  notes TEXT,
  created_by VARCHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Constraint names are explicit and match the Drizzle tables (generated FK names exceed 63 chars)
  CONSTRAINT benchmark_distribution_versions_label_uniq UNIQUE (label),
  CONSTRAINT bdv_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS benchmark_distributions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id VARCHAR(36) NOT NULL,
  metric_code VARCHAR(50) NOT NULL,
  sex VARCHAR(6) NOT NULL CHECK (sex IN ('male', 'female')),
  age_min INTEGER NOT NULL,
  age_max INTEGER NOT NULL,
  kind VARCHAR(10) NOT NULL DEFAULT 'raw' CHECK (kind IN ('raw', 'quantiles')),
  n INTEGER NOT NULL CHECK (n > 0),
  values DOUBLE PRECISION[] NOT NULL,
  CONSTRAINT bd_version_id_fk FOREIGN KEY (version_id) REFERENCES benchmark_distribution_versions(id) ON DELETE RESTRICT,
  CONSTRAINT bd_metric_code_fk FOREIGN KEY (metric_code) REFERENCES site_metrics(code) ON DELETE RESTRICT,
  CONSTRAINT benchmark_distributions_age_chk CHECK (age_min <= age_max),
  CONSTRAINT benchmark_distributions_raw_n_chk CHECK (kind <> 'raw' OR n = array_length(values, 1)),
  CONSTRAINT benchmark_distributions_band_uniq UNIQUE (version_id, metric_code, sex, age_min)
);

CREATE INDEX IF NOT EXISTS benchmark_distributions_metric_sex_idx ON benchmark_distributions (metric_code, sex);

CREATE OR REPLACE FUNCTION benchmark_distributions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'benchmark_distributions rows are immutable (% refused)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS benchmark_distributions_immutable_trg ON benchmark_distributions;
CREATE TRIGGER benchmark_distributions_immutable_trg
  BEFORE UPDATE OR DELETE ON benchmark_distributions
  FOR EACH ROW EXECUTE FUNCTION benchmark_distributions_immutable();
