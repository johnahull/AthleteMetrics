# Migration Idempotency Guide

This guide ensures all database migrations in AthleteMetrics are **idempotent** - safe to run multiple times without errors or unintended side effects.

## Why Idempotency Matters

- **Safe re-runs**: Migrations can be re-executed during debugging or recovery
- **Consistent state**: Running migrations twice produces the same result as running once
- **Easier deployment**: No need to track partial migration states
- **Better CI/CD**: Migrations can run in any environment without manual checks

## Quick Reference Table

| Operation | Idempotent Pattern |
|-----------|-------------------|
| CREATE TABLE | `CREATE TABLE IF NOT EXISTS` |
| CREATE INDEX | `CREATE INDEX IF NOT EXISTS` |
| CREATE INDEX (large table) | `CREATE INDEX CONCURRENTLY IF NOT EXISTS` |
| ADD COLUMN | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| DROP COLUMN | `ALTER TABLE ... DROP COLUMN IF EXISTS` |
| ADD CONSTRAINT | Conditional DO $$ block |
| ADD FOREIGN KEY | Conditional DO $$ block |
| ADD ENUM VALUE | Conditional DO $$ block |
| INSERT seed data | `ON CONFLICT DO NOTHING` or `WHERE NOT EXISTS` |

---

## Detailed Patterns with Examples

### 1. CREATE TABLE

```sql
-- ✅ Idempotent
CREATE TABLE IF NOT EXISTS site_metrics (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ❌ NOT idempotent - will error if table exists
CREATE TABLE site_metrics (...);
```

### 2. CREATE INDEX

```sql
-- ✅ Idempotent (standard)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ✅ Idempotent (non-blocking for large tables)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_date
ON measurements(date);

-- ❌ NOT idempotent
CREATE INDEX idx_users_email ON users(email);
```

**Note**: `CONCURRENTLY` cannot run inside a transaction. The `apply-manual-migrations.js` script handles this automatically.

### 3. ADD COLUMN

```sql
-- ✅ Idempotent
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- ❌ NOT idempotent
ALTER TABLE organizations ADD COLUMN is_active BOOLEAN;
```

### 4. ADD CONSTRAINT (CHECK, UNIQUE)

PostgreSQL doesn't have `ADD CONSTRAINT IF NOT EXISTS`, so use a conditional block:

```sql
-- ✅ Idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_metrics_code_format'
  ) THEN
    ALTER TABLE site_metrics ADD CONSTRAINT site_metrics_code_format
    CHECK (code ~ '^[A-Z0-9_]+$' AND code !~ '^_');
  END IF;
END $$;

-- ✅ Alternative: Use information_schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_email_unique'
    AND table_name = 'users'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;
```

### 5. ADD FOREIGN KEY

```sql
-- ✅ Idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_metrics_created_by_fkey'
    AND contype = 'f'
  ) THEN
    ALTER TABLE site_metrics
    ADD CONSTRAINT site_metrics_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
```

### 6. ADD ENUM VALUE

```sql
-- ✅ Idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'benchmark_created'
    AND enumtypid = 'audit_action'::regtype
  ) THEN
    ALTER TYPE audit_action ADD VALUE 'benchmark_created';
  END IF;
END $$;
```

**Important**: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction in PostgreSQL < 12. The migration script handles this.

### 7. INSERT SEED DATA

#### Using ON CONFLICT

```sql
-- ✅ Idempotent - uses unique constraint
INSERT INTO site_metrics (code, label, category, unit, is_system_default)
VALUES
  ('FLY10_TIME', '10-Yard Fly Time', 'speed', 's', true),
  ('VERTICAL_JUMP', 'Vertical Jump', 'power', 'in', true)
ON CONFLICT (code) DO NOTHING;
```

#### Using WHERE NOT EXISTS

```sql
-- ✅ Idempotent - checks before insert
INSERT INTO organization_metrics (organization_id, metric_code, is_enabled)
SELECT
  o.id AS organization_id,
  sm.code AS metric_code,
  true AS is_enabled
FROM organizations o
CROSS JOIN site_metrics sm
WHERE sm.is_system_default = true
  AND NOT EXISTS (
    SELECT 1 FROM organization_metrics om
    WHERE om.organization_id = o.id
      AND om.metric_code = sm.code
  );
```

### 8. DROP Operations

```sql
-- ✅ Idempotent
DROP TABLE IF EXISTS temp_migration_data;
DROP INDEX IF EXISTS idx_old_index;
ALTER TABLE users DROP COLUMN IF EXISTS deprecated_field;

-- ✅ Drop constraint idempotently
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'old_constraint'
  ) THEN
    ALTER TABLE table_name DROP CONSTRAINT old_constraint;
  END IF;
END $$;
```

---

## Real Examples from AthleteMetrics

### Example 1: Migration 0008 - Adding Indexes

```sql
-- File: migrations/0008_add_missing_indexes.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_organizations_user_org
ON user_organizations(user_id, organization_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_user_team
ON user_teams(user_id, team_id);

COMMENT ON INDEX idx_user_organizations_user_org IS 'Composite index for user-to-organization lookups';
```

### Example 2: Migration 0022 - Creating Tables with Seed Data

```sql
-- File: migrations/0022_add_metric_management_system.sql

-- Create table idempotently
CREATE TABLE IF NOT EXISTS site_metrics (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  ...
);

-- Create indexes idempotently
CREATE INDEX IF NOT EXISTS site_metrics_active_idx ON site_metrics(is_active);

-- Seed data idempotently
INSERT INTO site_metrics (code, label, category, ...)
VALUES ('FLY10_TIME', '10-Yard Fly Time', 'speed', ...)
ON CONFLICT (code) DO NOTHING;

-- Backfill with NOT EXISTS check
INSERT INTO organization_metrics (organization_id, metric_code, ...)
SELECT o.id, sm.code, ...
FROM organizations o
CROSS JOIN site_metrics sm
WHERE NOT EXISTS (
  SELECT 1 FROM organization_metrics om
  WHERE om.organization_id = o.id AND om.metric_code = sm.code
);
```

### Example 3: Migration 0013 - Adding Columns

```sql
-- File: migrations/0013_add_organization_soft_delete_columns.sql
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

COMMENT ON COLUMN organizations.is_active IS
  'Active status of organization...';
```

---

## Pre-Migration Checklist

Before submitting any migration:

- [ ] **Tables**: All `CREATE TABLE` use `IF NOT EXISTS`
- [ ] **Indexes**: All `CREATE INDEX` use `IF NOT EXISTS`
- [ ] **Large tables**: Use `CONCURRENTLY` for indexes on tables with data
- [ ] **Columns**: All `ADD COLUMN` use `IF NOT EXISTS`
- [ ] **Constraints**: All constraints wrapped in conditional DO $$ blocks
- [ ] **Seed data**: All inserts use `ON CONFLICT` or `WHERE NOT EXISTS`
- [ ] **Enums**: All enum additions wrapped in conditional DO $$ blocks
- [ ] **Down migration**: Ensure rollback script is also idempotent
- [ ] **Manual test**: Run migration twice locally to verify no errors

---

## Testing Idempotency

### Local Testing

```bash
# Run migration twice - should succeed both times
DATABASE_URL="..." npm run db:migrate:manual
DATABASE_URL="..." npm run db:migrate:manual
```

### Automated Linting

```bash
# Check migrations for non-idempotent patterns
node scripts/lint-migrations.js
```

---

## Common Mistakes to Avoid

### 1. Missing IF NOT EXISTS

```sql
-- ❌ Bad
CREATE TABLE users (...);
CREATE INDEX idx_users_email ON users(email);

-- ✅ Good
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

### 2. Raw Constraints Without Checks

```sql
-- ❌ Bad - will error if constraint exists
ALTER TABLE users ADD CONSTRAINT users_email_check CHECK (email LIKE '%@%');

-- ✅ Good
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_email_check CHECK (email LIKE '%@%');
  END IF;
END $$;
```

### 3. Seed Data Without Conflict Handling

```sql
-- ❌ Bad - will error on duplicate
INSERT INTO settings (key, value) VALUES ('app_name', 'AthleteMetrics');

-- ✅ Good
INSERT INTO settings (key, value) VALUES ('app_name', 'AthleteMetrics')
ON CONFLICT (key) DO NOTHING;
```

### 4. CONCURRENTLY Inside Transaction

```sql
-- ❌ Bad - CONCURRENTLY cannot be in a transaction
BEGIN;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_foo ON bar(col);
COMMIT;

-- ✅ Good - let the migration script handle it
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_foo ON bar(col);
```

---

## Integration with Migration System

The `apply-manual-migrations.js` script automatically:

1. **Tracks applied migrations** in `manual_migrations` table
2. **Skips already-applied migrations** (first layer of idempotency)
3. **Handles CONCURRENTLY statements** outside transactions
4. **Wraps other statements** in transactions for atomicity

Even with this tracking, migrations should still be internally idempotent for:
- Manual re-runs during debugging
- Database restore scenarios
- Multi-environment consistency

---

## Questions?

See the [Migration System Remediation](./MIGRATION_SYSTEM_REMEDIATION.md) doc for the overall migration architecture.
