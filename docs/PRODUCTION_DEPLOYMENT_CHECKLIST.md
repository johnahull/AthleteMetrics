# Production Deployment Checklist

## Pre-Deployment Verification

### Code Changes Summary
- ✅ Migration journal updated (migrations 0013-0021)
- ✅ Migration 0021: Backfill organization_id from user_organizations
- ✅ New analytics endpoint: `/api/analytics/performance-trends`
- ✅ Performance chart updated to use new endpoint
- ✅ All changes committed to `develop` branch

### Migration Verification

#### Files Present
```bash
# Verify all migration files exist
ls -1 migrations/*.sql | grep -E '001[3-9]|0020|0021'
```

Expected output:
- migrations/0013_add_organization_soft_delete_columns.sql
- migrations/0014_add_organization_soft_delete_indexes.sql
- migrations/0015_add_measurements_organization_columns.sql
- migrations/0016_add_measurements_table_indexes.sql
- migrations/0017_add_composite_analytics_indexes.sql
- migrations/0018_add_org_query_composite_indexes.sql
- migrations/0019_add_user_teams_temporal_index.sql
- migrations/0020_add_measurements_org_metric_analytics_index.sql
- migrations/0021_backfill_measurements_org_from_users.sql

**Note:** `0020_add_measurements_org_metric_analytics_index_down.sql` is a rollback script and will NOT run automatically.

#### Journal Entries
```bash
# Verify journal has entries for migrations 13-21
cat migrations/meta/_journal.json | grep '"idx": 1[3-9]\|"idx": 2[01]'
```

Expected: Journal entries for idx 13 through 21

### Migration Execution Flow

When production deploys, the following will happen automatically:

1. **Build Phase**
   - Code is compiled
   - Frontend assets are bundled

2. **Pre-Start Phase** (`package.json` → `prestart` script)
   ```bash
   node scripts/run-migrations.js
   ```

   This script will:
   - Acquire advisory lock (prevents concurrent migrations)
   - Check if schema exists and migration tracking table exists
   - Run migrations 0013-0021 in order (if not already applied)
   - Release advisory lock
   - Exit with code 0 on success

3. **Start Phase** (`package.json` → `start` script)
   ```bash
   node dist/index.js
   ```

   Application starts only if migrations succeeded.

### What Each Migration Does

#### Migration 0013: Organization Soft Delete Columns
- Adds `deleted_at` and `deleted_by` to organizations table
- Allows soft-deletion of organizations

#### Migration 0014: Organization Soft Delete Indexes
- Adds indexes for soft delete columns
- Optimizes queries filtering by `deleted_at IS NULL`

#### Migration 0015: Measurements Organization Columns ⚠️ **CRITICAL**
- Adds `organization_id` column to measurements table
- Adds `team_name_snapshot` column to measurements table
- **Backfills organization_id from teams table** (batched, ~1445 records on staging)
- This is the main migration for the performance chart fix

#### Migration 0016: Measurements Table Indexes
- Adds indexes for new organization_id column
- Optimizes performance chart queries

#### Migration 0017: Composite Analytics Indexes
- Adds composite indexes for analytics queries
- Improves dashboard query performance

#### Migration 0018: Organization Query Composite Indexes
- Adds composite indexes for org-filtered queries
- Optimizes team/athlete queries

#### Migration 0019: User Teams Temporal Index
- Adds temporal indexes for team membership queries
- Improves historical team roster queries

#### Migration 0020: Measurements Org Metric Analytics Index
- Adds specialized index for analytics endpoint
- Optimizes performance trends queries

#### Migration 0021: Backfill Org ID from User Organizations ⚠️ **CRITICAL**
- Backfills organization_id for measurements without team_id
- Handles independent athlete measurements
- Batched updates (1000 rows at a time)
- On staging: ~10,115 records updated

### Expected Migration Results

On a production database similar to staging:
- **Migration 0015**: Updates measurements with team_id (approx. 1,445 records)
- **Migration 0021**: Updates remaining measurements via user_organizations (approx. 10,115 records)
- **Total measurements updated**: ~11,560 (100% coverage expected)

## Deployment Steps

### 1. Pre-Deployment Database Backup

```bash
# Create production database backup
railway run --environment production -- pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql
```

**CRITICAL:** Do not proceed without a verified backup.

### 2. Merge to Main Branch

```bash
# Switch to main branch
git checkout main

# Pull latest
git pull origin main

# Merge develop
git merge develop

# Push to main
git push origin main
```

### 3. Deploy to Production

Railway will automatically deploy when main branch is updated (if auto-deploy is enabled).

**OR** manually trigger deployment:
```bash
railway up --environment production
```

### 4. Monitor Deployment

Watch logs for migration execution:
```bash
railway logs --environment production --tail 100
```

Expected output:
```
🔄 Running database migrations...
🔒 Acquiring migration lock...
✅ Migration lock acquired and verified
📋 Database has existing migration tracking - checking for new migrations...
✅ Migrations completed successfully
🔓 Migration lock released
```

### 5. Post-Deployment Verification

#### Verify Migrations Applied
```bash
railway run --environment production -- psql $DATABASE_URL -c "
SELECT hash FROM drizzle.__drizzle_migrations
WHERE hash LIKE '00%'
ORDER BY id DESC
LIMIT 10;
"
```

Expected: Should see migrations 0013-0021 in the list.

#### Verify Organization ID Backfill
```bash
railway run --environment production -- psql $DATABASE_URL -c "
SELECT
  COUNT(*) as total,
  COUNT(organization_id) as with_org_id,
  COUNT(*) - COUNT(organization_id) as missing
FROM measurements;
"
```

Expected: `missing` should be 0 or very close to 0.

#### Verify Performance Trends Endpoint
```bash
# Get your organization ID from the database or UI
ORG_ID="your-org-id-here"

# Test the endpoint (requires authentication)
curl -X GET "https://your-production-domain.com/api/analytics/performance-trends?organizationId=${ORG_ID}&dateFrom=2025-01-01&metrics=FLY10_TIME,VERTICAL_JUMP" \
  --cookie "connect.sid=your-session-cookie"
```

Expected response:
```json
{
  "weeks": ["2025-01-13", "2025-02-17", ...],
  "metrics": {
    "FLY10_TIME": [1.126, 1.127, ...],
    "VERTICAL_JUMP": [25.67, 25.025, ...]
  }
}
```

#### Verify Performance Chart in UI
1. Navigate to dashboard
2. Performance Trends chart should display
3. Chart should show multiple weeks of data (not just 1-2 points)
4. Time range selector should work (Last 8 Weeks, Last 30 Days, Last 90 Days, This Year)

## Rollback Plan

If deployment fails or issues are detected:

### Option 1: Rollback Code Only (migrations succeeded)
```bash
# Revert to previous commit on main
git checkout main
git revert HEAD
git push origin main

# Railway will auto-deploy the reverted code
```

**Note:** Migrations are NOT rolled back automatically. The new endpoint is backward compatible, so reverting code is safe.

### Option 2: Full Rollback (migrations failed)

If migrations failed mid-way:

1. **Check migration lock status**
   ```bash
   railway run --environment production -- psql $DATABASE_URL -c "
   SELECT * FROM pg_locks WHERE locktype = 'advisory';
   "
   ```

2. **Restore from backup** (only if database is in inconsistent state)
   ```bash
   railway run --environment production -- psql $DATABASE_URL < backup-YYYYMMDD-HHMMSS.sql
   ```

3. **Remove failed migration tracking entries**
   ```bash
   railway run --environment production -- psql $DATABASE_URL -c "
   DELETE FROM drizzle.__drizzle_migrations
   WHERE hash IN ('0013_add_organization_soft_delete_columns', '0014_...', ...);
   "
   ```

## Success Criteria

- ✅ All migrations applied successfully
- ✅ Zero measurements missing organization_id (or acceptable percentage)
- ✅ Performance trends endpoint returns data
- ✅ Performance chart displays in UI
- ✅ Chart shows multiple weeks of data
- ✅ No errors in production logs
- ✅ Application health check passing

## Troubleshooting

### Migration Lock Timeout
**Symptom:** Migration script times out waiting for lock

**Cause:** Another deployment or migration is running

**Solution:** Wait for other deployment to complete, or investigate stuck locks:
```bash
railway run --environment production -- psql $DATABASE_URL -c "
SELECT pid, locktype, mode, granted
FROM pg_locks
WHERE locktype = 'advisory';
"
```

### Performance Chart Shows Single Date
**Symptom:** Chart only shows 1-2 data points

**Possible causes:**
1. Deployment didn't complete (still using old code)
2. Migrations didn't run (organization_id not backfilled)
3. Browser cache showing old version

**Solution:**
1. Verify deployment commit hash matches latest
2. Check organization_id backfill query above
3. Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)

### Organization ID Still NULL
**Symptom:** Measurements still missing organization_id after migration

**Cause:** Measurements for users not in user_organizations table (orphaned data)

**Solution:** This is expected for orphaned data. Verify percentage is acceptable:
```bash
railway run --environment production -- psql $DATABASE_URL -c "
SELECT
  ROUND(100.0 * COUNT(organization_id) / COUNT(*), 2) as coverage_pct
FROM measurements;
"
```

Expected: >99% coverage

## Post-Deployment Monitoring

Monitor for 24-48 hours:
- Error rates in application logs
- Database query performance
- Performance trends endpoint response times
- User feedback on dashboard

## Contacts

- **Database Issues:** [Your DBA/DevOps contact]
- **Application Issues:** [Your Dev Team contact]
- **Railway Platform Issues:** https://railway.app/help

## Deployment History

| Date | Branch | Commit | Deployed By | Status |
|------|--------|--------|-------------|--------|
| YYYY-MM-DD | main | 06a0e60 | [Name] | ✅ Success |

---

**Last Updated:** 2025-10-24
**Document Version:** 1.0
**Related:** docs/migration-organization-id.md, TEST_DATABASE_SETUP.md
