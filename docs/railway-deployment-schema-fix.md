# Railway Deployment Schema Fix

## Problem Summary

The Railway deployment was failing due to database schema mismatches between the Drizzle ORM schema definitions and the actual PostgreSQL database schema.

### Root Cause

The production Railway database was initially created using `drizzle-kit push` instead of migrations. When this happens, the migration tracking system (`drizzle.__drizzle_migrations` table) marks **all** migrations as "applied" without actually running them. This leads to schema drift when new migrations are added later.

### Specific Issues Found

1. **Missing `users.deleted_at` column** (from migration `0005_add_user_soft_delete.sql`)
   - Error: `column "deleted_at" does not exist`
   - Impact: Application startup failure

2. **`audit_logs.user_id` NOT NULL constraint** (should be nullable per migration `0012_fix_audit_logs_user_id_nullable.sql`)
   - Error: `null value in column "user_id" of relation "audit_logs" violates not-null constraint`
   - Impact: User deletion failures, organization cascade deletion failures

## Solution

### 1. Created Idempotent Migration Script

**Files:**
- `scripts/apply-missing-migrations.js` - Node.js runner
- `scripts/apply-missing-migrations.sql` - SQL migrations with IF NOT EXISTS checks

**Features:**
- ✅ **Idempotent**: Safe to run multiple times
- ✅ **Production-safe**: Only applies missing schema changes
- ✅ **Self-verifying**: Reports what was applied and current schema state
- ✅ **Environment-aware**: Enhanced logging in production

### 2. Updated Railway Deployment Flow

Modified `railway.json` to run migration check before app startup:

```json
{
  "deploy": {
    "startCommand": "node scripts/apply-missing-migrations.js && npm run db:migrate && npm run start"
  }
}
```

**Deployment sequence:**
1. `apply-missing-migrations.js` - Fixes schema drift from drizzle-kit push
2. `npm run db:migrate` - Runs normal Drizzle migrations
3. `npm run start` - Starts the application

## Prevention Strategy

### For Future Migrations

To prevent this issue from happening again:

1. **Always use migrations** instead of `drizzle-kit push` for production databases
2. **Test migrations** against a clean database before deploying
3. **Verify schema** after deployment using the verification script

### For New Environments

When setting up a new environment (production, staging, etc.):

**Option A: Migration-first approach (RECOMMENDED)**
```bash
# Start with empty database
npm run db:migrate  # Apply all migrations in order
npm run start       # Start application
```

**Option B: Push-then-migrate approach (if you used drizzle-kit push)**
```bash
# If database was created with drizzle-kit push
node scripts/apply-missing-migrations.js  # Fix schema drift
npm run db:migrate                        # Apply any new migrations
npm run start                             # Start application
```

## Verification

### Check if migrations are needed

Run against any database to check schema status:

```bash
DATABASE_URL="your-database-url" node scripts/apply-missing-migrations.js
```

Expected output when schema is up-to-date:
```
📊 Schema verification:
   ✓ users.deleted_at: EXISTS
   ✓ audit_logs.user_id (nullable): YES
```

### Manual verification

Connect to the database and run:

```sql
-- Check deleted_at column exists
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'deleted_at';

-- Check audit_logs.user_id is nullable
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'audit_logs' AND column_name = 'user_id';
```

## Rollback Procedure

If the migration causes issues, you can rollback:

### Rollback deleted_at column
```sql
DROP INDEX IF EXISTS idx_users_deleted_at;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
```

### Rollback audit_logs.user_id nullable change
```sql
-- WARNING: This will fail if any NULL values exist
ALTER TABLE audit_logs ALTER COLUMN user_id SET NOT NULL;
```

## Related Files

- `migrations/0005_add_user_soft_delete.sql` - Original migration for deleted_at
- `migrations/0012_fix_audit_logs_user_id_nullable.sql` - Original migration for audit_logs
- `scripts/run-migrations.js` - Main migration runner (has auto-tracking logic)
- `railway.json` - Railway deployment configuration

## Testing

### Test the migration script locally

```bash
# Against a test database
DATABASE_URL="postgresql://localhost:5432/test_db" node scripts/apply-missing-migrations.js

# Should be idempotent - run it again
DATABASE_URL="postgresql://localhost:5432/test_db" node scripts/apply-missing-migrations.js
```

### Test full deployment flow

```bash
# Simulate Railway deployment
node scripts/apply-missing-migrations.js
npm run db:migrate
npm run start
```

## Production Deployment Checklist

Before deploying to production:

- [ ] Verify staging environment works correctly
- [ ] Back up production database
- [ ] Test migration script against staging database
- [ ] Review Railway logs after deployment
- [ ] Verify application health endpoints respond
- [ ] Test critical user flows (create user, login, etc.)
- [ ] Monitor error logs for 24 hours after deployment

## Additional Notes

### Why not just re-run all migrations?

The migration tracking system prevents re-running migrations that are already marked as "applied". The script bypasses this by directly checking the database schema and applying only the missing DDL changes.

### Why not fix the migration runner?

The migration runner's auto-tracking logic (lines 204-245 in `scripts/run-migrations.js`) is actually correct for the "fresh database via drizzle-kit push" scenario. It prevents duplicate schema creation. The issue is that it assumes all schema from the Drizzle schema definition was applied, which wasn't true for migrations added after the initial push.

### Long-term solution

Consider migrating to a pure migration-based approach:
1. Generate new migration from current schema: `npm run db:generate`
2. For new environments, always use `npm run db:migrate` instead of `drizzle-kit push`
3. Remove the auto-tracking logic from `run-migrations.js` once all environments are migration-based

## References

- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations)
- [PostgreSQL Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)
- [Railway Deployment Hooks](https://docs.railway.app/deploy/deployments#deployment-lifecycle)
