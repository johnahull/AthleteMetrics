#!/bin/bash
set -e

# Apply PostgreSQL cascade delete triggers for benchmarks system
# These triggers are part of migration 0024 but must be applied separately
# because db:push only handles schema changes, not functions/triggers

echo "📋 Applying cascade delete triggers..."

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is required"
  exit 1
fi

psql "$DATABASE_URL" <<'EOF'
-- Create trigger function for cascading deletes on polymorphic relationship
CREATE OR REPLACE FUNCTION cleanup_org_benchmarks()
RETURNS TRIGGER AS $trigger$
BEGIN
  DELETE FROM organization_benchmarks
  WHERE benchmark_id = OLD.id
  AND benchmark_type = TG_ARGV[0];
  RETURN OLD;
END;
$trigger$ LANGUAGE plpgsql;

-- Create triggers for cascading deletes from site_benchmarks
DROP TRIGGER IF EXISTS cleanup_org_benchmarks_site ON site_benchmarks;
CREATE TRIGGER cleanup_org_benchmarks_site
AFTER DELETE ON site_benchmarks
FOR EACH ROW EXECUTE FUNCTION cleanup_org_benchmarks('site');

-- Create triggers for cascading deletes from custom_benchmarks
DROP TRIGGER IF EXISTS cleanup_org_benchmarks_custom ON custom_benchmarks;
CREATE TRIGGER cleanup_org_benchmarks_custom
AFTER DELETE ON custom_benchmarks
FOR EACH ROW EXECUTE FUNCTION cleanup_org_benchmarks('custom');

-- Verify triggers were created
SELECT count(*) as trigger_count FROM pg_trigger WHERE tgname LIKE '%cleanup_org_benchmarks%';
EOF

echo "✅ Cascade delete triggers applied successfully"
