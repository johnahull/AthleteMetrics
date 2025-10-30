# Migration: Backfill organization_id for Measurements

## Overview
This migration adds and populates the `organization_id` column for the `measurements` table. This column is required for efficient multi-tenant data filtering.

## What Changed
- Added `organization_id` column to `measurements` table
- Added `team_name_snapshot` column to `measurements` table
- Both columns allow NULL values for backwards compatibility

## Why This Is Needed
The `organization_id` on measurements enables:
1. **Fast filtering**: Direct `WHERE organization_id = 'xyz'` instead of complex joins
2. **Historical accuracy**: Records which organization the athlete belonged to at measurement time
3. **Data isolation**: Ensures organizations only see their own athletes' data

## Deployment Steps

### For Testing Environment (Already Complete)
```bash
# 1. Push schema changes
DATABASE_URL="postgresql://postgres:rdnrfZfXPiZWKbahqepvoYnYerNoLiRG@maglev.proxy.rlwy.net:29985/railway" npm run db:push

# 2. Backfill data
PGPASSWORD=rdnrfZfXPiZWKbahqepvoYnYerNoLiRG psql -h maglev.proxy.rlwy.net -p 29985 -U postgres -d railway -c "
UPDATE measurements m
SET organization_id = (
  SELECT uo.organization_id
  FROM user_organizations uo
  WHERE uo.user_id = m.user_id
  LIMIT 1
)
WHERE organization_id IS NULL;
"
```

### For Staging Environment
```bash
# 1. Push schema changes
railway run --environment staging npm run db:push

# 2. Run backfill script
railway run --environment staging npm run db:migrate:backfill-org
```

### For Production Environment
```bash
# 1. Push schema changes (during maintenance window)
railway run --environment production npm run db:push

# 2. Run backfill script
railway run --environment production npm run db:migrate:backfill-org

# 3. Verify
railway run --environment production -- psql $DATABASE_URL -c "
SELECT
  COUNT(*) as total,
  COUNT(organization_id) as with_org_id,
  COUNT(*) - COUNT(organization_id) as missing
FROM measurements;
"
```

## Rollback Plan
If issues occur:

1. **Remove column filtering from code** (revert commits)
2. **Optional**: Remove columns from schema
   ```sql
   ALTER TABLE measurements DROP COLUMN organization_id;
   ALTER TABLE measurements DROP COLUMN team_name_snapshot;
   ```

## Verification Queries

### Check backfill status
```sql
SELECT
  COUNT(*) as total_measurements,
  COUNT(organization_id) as with_org_id,
  COUNT(*) - COUNT(organization_id) as missing_org_id
FROM measurements;
```

### Sample measurements by organization
```sql
SELECT
  o.name as organization,
  COUNT(m.id) as measurement_count,
  MIN(m.date) as earliest,
  MAX(m.date) as latest
FROM measurements m
JOIN organizations o ON m.organization_id = o.id
GROUP BY o.id, o.name
ORDER BY measurement_count DESC;
```

### Find orphaned measurements
```sql
SELECT
  m.id,
  m.user_id,
  m.date,
  m.metric
FROM measurements m
WHERE organization_id IS NULL
LIMIT 10;
```

## Timeline
- **Testing**: Completed 2025-10-24
- **Staging**: TBD (run before production deploy)
- **Production**: TBD (coordinate with deployment)

## Related Files
- Schema: `packages/shared/schema.ts`
- API Routes: `packages/api/routes/measurement-routes.ts`
- Migration Script: `scripts/migrations/backfill-measurement-organization-id.js`
- UI Component: `packages/web/src/components/charts/performance-chart.tsx`

## Commits
- `9974208` - Added organizationId validation and filtering
- `6b1b334` - Fixed API response format
- `f67febc` - Added 'This Year' time range option
- `f605305` - Set 'This Year' as default
