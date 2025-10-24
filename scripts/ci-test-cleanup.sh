#!/bin/bash
set -e

# CI Test Database Cleanup Script
#
# This script drops all tables from the test database to ensure a clean state
# between CI runs. It runs even if tests fail to prevent data leakage.
#
# Usage: ./scripts/ci-test-cleanup.sh
# Required env vars: DATABASE_URL

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL environment variable is required"
  exit 1
fi

# Safety check: ensure we're targeting a test database
if [[ ! "$DATABASE_URL" =~ _test$ ]] && [[ ! "$DATABASE_URL" =~ test_ ]]; then
  echo "❌ Error: DATABASE_URL must contain 'test' to prevent accidental production cleanup"
  echo "   Current database name does not match test naming pattern"
  exit 1
fi

echo "🧹 Cleaning up test database..."

# Use psql with connection string directly (safer than parsing)
# This prevents command injection vulnerabilities from malformed URLs
psql "$DATABASE_URL" <<EOF
DO \$\$
DECLARE
  r RECORD;
BEGIN
  -- Drop all tables
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;

  -- Drop all sequences
  FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequence_name) || ' CASCADE';
  END LOOP;

  -- Drop all views
  FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.viewname) || ' CASCADE';
  END LOOP;
END \$\$;
EOF

echo "✅ Test database cleaned up successfully"
echo "   - All tables dropped"
echo "   - All sequences dropped"
echo "   - All views dropped"
