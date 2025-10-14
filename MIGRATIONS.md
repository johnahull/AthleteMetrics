# Database Migrations Guide

This guide explains how to work with database migrations in the AthleteMetrics project using Drizzle ORM.

## Overview

AthleteMetrics uses **migration-based deployments** for production and staging environments:

- **Development**: Use `npm run db:push` for fast iteration (no migration files needed)
- **Production/Staging**: Use `npm run db:migrate` to apply git-tracked migration files
- **CI/CD**: Automatically runs migrations before deploying code

## Why Migrations?

Migration files provide several critical benefits for production deployments:

| Benefit | Description |
|---------|-------------|
| **Audit Trail** | Git history shows exactly what changed and when |
| **SQL Review** | Review exact SQL before it runs in production |
| **Rollback Safety** | Easily revert schema changes using git |
| **Team Coordination** | Prevents conflicting schema changes |
| **Deployment Safety** | Test exact SQL in staging before production |

## Developer Workflow

### 1. Making Schema Changes

Edit the schema file:

```typescript
// shared/schema.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  // Add new field:
  email: varchar('email', { length: 255 }).notNull(),
});
```

### 2. Generate Migration

Generate a migration file from your schema changes:

```bash
npm run db:generate
```

This creates a new migration file in `migrations/` directory with:
- Timestamp-based filename (e.g., `0004_add_user_email.sql`)
- SQL statements to apply the change
- Metadata for migration tracking

**Example generated migration:**
```sql
-- migrations/0004_add_user_email.sql
ALTER TABLE "users" ADD COLUMN "email" varchar(255) NOT NULL;
```

### 3. Review Generated SQL

**CRITICAL:** Always review the generated SQL before committing:

```bash
cat migrations/0004_add_user_email.sql
```

Check for:
- ✅ Correct table/column names
- ✅ Appropriate data types
- ✅ No unintended DROP statements
- ✅ Proper constraints and indexes

### 4. Test Migration Locally

Apply the migration to your local database:

```bash
npm run db:migrate
```

Verify:
- Migration applies without errors
- Application works with new schema
- No data loss or corruption

### 5. Commit Migration Files

**Important:** Commit BOTH the schema changes AND migration files:

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add email field to users table"
git push origin feature-branch
```

### 6. Deploy

**Staging:**
```bash
git push origin develop  # Triggers staging deployment
```

**Production:**
```bash
# Create GitHub release
# This triggers production deployment with migrations
```

## NPM Scripts Reference

```json
{
  "db:generate": "drizzle-kit generate",  // Create migration from schema
  "db:migrate": "tsx server/migrate.ts",  // Apply pending migrations
  "db:push": "drizzle-kit push"           // Push schema directly (dev only)
}
```

### When to Use Each Command

| Command | Use Case | Environment |
|---------|----------|-------------|
| `db:generate` | Creating new migrations | Local development |
| `db:migrate` | Applying migrations | All environments |
| `db:push` | Quick iteration without migrations | **Local dev ONLY** |

## Migration File Structure

```
migrations/
├── 0000_initial_schema.sql
├── 0001_add_team_uniqueness.sql
├── 0002_add_organization_index.sql
├── 0003_add_audit_logs.sql
└── meta/
    ├── 0000_snapshot.json
    └── _journal.json
```

- **SQL files**: Migration up statements
- **meta/ directory**: Migration metadata and snapshots
- **_journal.json**: Track applied migrations

## Common Scenarios

### Adding a Column

```typescript
// 1. Update schema
export const users = pgTable('users', {
  // existing fields...
  newField: varchar('new_field', { length: 100 }),
});

// 2. Generate migration
// $ npm run db:generate

// 3. Review SQL
// $ cat migrations/000X_add_new_field.sql
// ALTER TABLE "users" ADD COLUMN "new_field" varchar(100);

// 4. Test locally
// $ npm run db:migrate

// 5. Commit and deploy
// $ git add . && git commit -m "feat: add new_field" && git push
```

### Renaming a Column

**⚠️ WARNING:** Drizzle sees renames as DROP + ADD (data loss!)

**Safe approach:**
1. Add new column
2. Deploy code that writes to both columns
3. Backfill data from old → new column
4. Deploy code that reads from new column
5. Drop old column

```typescript
// Step 1: Add new column
export const users = pgTable('users', {
  // oldName: varchar('old_name'), // Keep temporarily
  newName: varchar('new_name'),    // Add new column
});
```

### Dropping a Column

**⚠️ DANGER:** This permanently deletes data!

```typescript
// 1. Update schema (remove field)
export const users = pgTable('users', {
  // email: varchar('email'),  ← Removed
});

// 2. Generate migration
// $ npm run db:generate

// 3. Review generated SQL - VERIFY IT'S SAFE!
// $ cat migrations/000X_drop_email.sql
// ALTER TABLE "users" DROP COLUMN "email";  ← Data will be DELETED!

// 4. If safe, proceed with testing and deployment
```

## Rollback Procedures

### Rollback Recent Migration (Not Yet Deployed)

```bash
# Delete the migration file
rm migrations/000X_problematic_migration.sql

# Regenerate from schema
npm run db:generate
```

### Rollback Deployed Migration

**Option 1: Create Reverse Migration (Preferred)**
```bash
# 1. Update schema to previous state
# 2. Generate new migration that reverses the change
npm run db:generate

# 3. This creates a NEW migration that undoes the previous one
# 4. Deploy normally
```

**Option 2: Manual SQL (Production Emergency)**
```bash
# 1. Connect to database
psql $DATABASE_URL

# 2. Run reverse SQL manually
ALTER TABLE users DROP COLUMN problematic_field;

# 3. Update schema.ts to match
# 4. Generate migration to record the change
npm run db:generate
```

## CI/CD Integration

### How Migrations Run in CI/CD

**PR Checks (`.github/workflows/pr-checks.yml`):**
- Uses `db:push` for ephemeral test databases
- Fast, no migration files needed for tests

**Staging Deploy (`.github/workflows/staging-deploy.yml`):**
```yaml
- name: Deploy to Railway Staging
  run: |
    railway run npm run db:migrate  # ← Applies git-tracked migrations
    railway up --detach
```

**Production Deploy (`.github/workflows/production-deploy.yml`):**
```yaml
- name: Deploy to Railway Production
  run: |
    railway run npm run db:migrate  # ← Applies git-tracked migrations
    railway up --environment production --detach
```

### Migration Failure Handling

If a migration fails during deployment:

1. **Deployment stops** - New code is not deployed
2. **Database unchanged** - Partial migration is rolled back by PostgreSQL transaction
3. **Fix required** - Review error, fix migration, redeploy

## Best Practices

### ✅ DO

- **Review SQL** before committing migration files
- **Test locally** before pushing to GitHub
- **Commit migrations** with schema changes in same PR
- **Use transactions** for multi-statement migrations
- **Add indexes** for new foreign keys
- **Backfill data** for NOT NULL columns added to existing tables

### ❌ DON'T

- **Never edit** existing migration files after deployment
- **Never use** `db:push` in production/staging
- **Never drop** columns without data migration plan
- **Never rename** tables/columns without multi-step deployment
- **Don't deploy** schema changes without migration files

## Troubleshooting

### Migration File Not Generated

```bash
# Ensure drizzle.config.ts is correct
cat drizzle.config.ts

# Verify schema changes are saved
git diff shared/schema.ts

# Try regenerating
npm run db:generate
```

### Migration Fails Locally

```bash
# Check your local DATABASE_URL
echo $DATABASE_URL

# Verify migrations directory exists
ls -la migrations/

# Check migration file syntax
cat migrations/000X_filename.sql

# Reset local database (if safe)
dropdb athletemetrics_dev && createdb athletemetrics_dev
npm run db:push  # Fresh schema
```

### Migration Fails in CI/CD

```bash
# Check GitHub Actions logs for error message
gh run view --log

# Common issues:
# 1. Migration conflicts - regenerate migrations
# 2. Missing DATABASE_URL - check Railway secrets
# 3. SQL syntax error - review migration file
# 4. Constraint violation - add data migration first
```

## Additional Resources

- [Drizzle ORM Migrations Documentation](https://orm.drizzle.team/docs/migrations)
- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- [Database Schema Best Practices](https://www.postgresql.org/docs/current/ddl-schemas.html)

## Getting Help

If you encounter issues:

1. Check this guide first
2. Review GitHub Actions logs
3. Check Drizzle documentation
4. Ask in team chat with:
   - Error message
   - Migration file content
   - What you were trying to achieve

---

**Last Updated:** 2025-10-14
**Maintained By:** AthleteMetrics Development Team
