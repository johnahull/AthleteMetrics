# Migration 0087 Deployment Plan

## Overview

**Migration**: `0087_backfill_measurements_org_final.sql`
**Purpose**: Backfill `organization_id` for measurements with NULL values to enforce multi-tenant data isolation
**Complexity**: HIGH - 208 lines, batched updates, potentially affects thousands of measurements
**Reversibility**: NO - Down migration is a NO-OP, requires database backup to rollback
**Estimated Duration**: 5-15 minutes on datasets with 10K+ measurements

## Critical Deployment Requirements

### ⚠️ DEPLOYMENT ORDER - CRITICAL

**MUST follow this exact sequence:**

1. **✅ FIRST: Run migration 0087** (backfill organization_id)
2. **✅ THEN: Verify backfill completion** (check NOTICE output for null count)
3. **✅ FINALLY: Deploy application code**

**Why this order matters:**
- Code changes remove handling for `isNull(organizationId)` conditions
- If code deploys before migration runs, measurements with NULL org_id become invisible
- This creates **silent data loss** until migration completes

### Pre-Deployment Checklist

- [ ] **Database Backup Created** (migration is irreversible)
  - Verify backup includes `measurements` table
  - Test backup restoration procedure
  - Document backup timestamp and location

- [ ] **Staging Environment Tested**
  - Run migration on staging with production-like data volume
  - Verify execution time is acceptable (< 15 minutes target)
  - Review orphaned measurement report (NOTICE output)
  - Confirm no data corruption

- [ ] **Low-Traffic Window Scheduled**
  - Migration locks `measurements` table in 1000-row batches
  - Schedule during off-peak hours for large installations
  - Estimated downtime: None (read operations continue)
  - Estimated performance impact: 5-15% DB CPU increase during run

- [ ] **Monitoring Configured**
  - Database query performance monitoring active
  - Lock contention alerts configured
  - Migration progress tracking available

### Migration Details

**What it does:**
1. **Phase 1: Team-based backfill**
   - Fills NULL org_id from player's team via `player_teams` join
   - Batch size: 1000 rows
   - Pause between batches: 50ms (reduces lock contention)

2. **Phase 2: User organization backfill**
   - Fills remaining NULL org_id from user's organizations
   - Uses first organization if user has multiple
   - Batch size: 1000 rows

3. **Phase 3: Orphan detection**
   - Reports measurements that couldn't be backfilled
   - These are measurements where:
     - User has no organization membership
     - Player has no team association

**Idempotency**: Safe to re-run multiple times (only fills NULL values)

### Deployment Steps

#### 1. Pre-Deployment Validation

```sql
-- Check how many measurements need backfilling
SELECT COUNT(*) FROM measurements WHERE organization_id IS NULL;

-- Check if any users have no organization membership (potential orphans)
SELECT COUNT(DISTINCT user_id)
FROM measurements m
WHERE organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_organizations uo WHERE uo.user_id = m.user_id
  );
```

#### 2. Create Database Backup

```bash
# Railway
railway backup create --project athletemetrics --environment production

# Manual postgres backup
pg_dump -h <host> -U <user> -d <database> -t measurements > measurements_backup_$(date +%Y%m%d_%H%M%S).sql
```

#### 3. Run Migration

```bash
# Via npm script (recommended - handles all migrations in order)
npm run db:migrate:manual

# Direct execution (if running migration 0087 only)
DATABASE_URL="<production-url>" node scripts/apply-manual-migrations.js
```

**Expected output:**
```
🔄 Manual SQL Migrations
========================
Discovered: X migration(s)

Processing migration: 0087_backfill_measurements_org_final
Migration 0087: Pre-backfill NULL count: <count>
Migration 0087: Phase 1 (team-based) backfilled <count> measurements
Migration 0087: Phase 2 (user org) backfilled <count> measurements
Migration 0087: Remaining NULL count after backfill: <count>
Migration 0087: Orphaned measurements report:
  - <details if any orphans exist>
✅ Applied 0087_backfill_measurements_org_final
```

#### 4. Post-Migration Validation

```sql
-- Verify backfill success (should be 0 or very low)
SELECT COUNT(*) FROM measurements WHERE organization_id IS NULL;

-- Check if backfilled measurements have valid org_id
SELECT
  COUNT(*) as total_measurements,
  COUNT(DISTINCT organization_id) as unique_orgs,
  COUNT(*) FILTER (WHERE organization_id IS NULL) as null_orgs
FROM measurements;

-- Verify organization_id matches team's organization
SELECT COUNT(*)
FROM measurements m
JOIN player_teams pt ON m.player_id = pt.player_id
JOIN teams t ON pt.team_id = t.id
WHERE m.organization_id != t.organization_id;
-- Expected: 0 mismatches
```

#### 5. Deploy Application Code

Once migration is verified successful:

```bash
git push origin develop  # Triggers Railway deployment
```

Monitor deployment:
- Check application starts successfully
- Verify API endpoints respond correctly
- Check for any 500 errors in logs

### Rollback Plan

**⚠️ Migration is NOT reversible via SQL**

The down migration (`0087_backfill_measurements_org_final_down.sql`) is a NO-OP:
```sql
-- NO-OP: Backfill cannot be reversed safely
-- Measurements with NULL organization_id were data integrity violations
-- Reversal would require restoring from database backup
```

**If rollback required:**

1. **Stop application deployment** (prevent code from running)
2. **Restore database from backup** (created in step 2)
3. **Verify backup restoration**
   ```sql
   SELECT COUNT(*) FROM measurements WHERE organization_id IS NULL;
   -- Should match pre-migration count
   ```
4. **Investigate failure cause** before re-attempting migration

### Handling Orphaned Measurements

If migration reports orphaned measurements (unable to backfill):

**Option 1: Assign to default organization (if exists)**
```sql
-- Assign to a default "Independent Athletes" organization
UPDATE measurements
SET organization_id = '<default-org-uuid>'
WHERE organization_id IS NULL;
```

**Option 2: Delete orphaned measurements (data cleanup)**
```sql
-- CAUTION: This deletes data permanently
DELETE FROM measurements WHERE organization_id IS NULL;
```

**Option 3: Manual investigation**
```sql
-- Export orphaned measurements for manual review
SELECT
  m.id,
  m.user_id,
  u.email,
  m.metric_code,
  m.value,
  m.date
FROM measurements m
JOIN users u ON m.user_id = u.id
WHERE m.organization_id IS NULL
ORDER BY m.date DESC;
```

Contact affected users to determine correct organization assignment.

### Post-Deployment Monitoring

Monitor for 24-48 hours after deployment:

- **Performance**: Database query times should return to normal
- **Errors**: No 500 errors related to organization_id filtering
- **User Reports**: No reports of missing measurement data
- **Data Integrity**: Spot-check that athletes only see their organization's data

### Troubleshooting

#### Migration Times Out

- **Symptom**: Migration runs > 15 minutes
- **Cause**: Large dataset or high database load
- **Solution**:
  1. Increase batch pause time (edit migration: `pg_sleep(0.05)` → `pg_sleep(0.1)`)
  2. Schedule during lower-traffic period
  3. Consider splitting into smaller batches

#### High Lock Contention

- **Symptom**: Slow query performance during migration
- **Cause**: Row locks blocking read operations
- **Solution**:
  1. Verify batch size is 1000 (not larger)
  2. Increase pause between batches
  3. Monitor active locks: `SELECT * FROM pg_locks WHERE relation::regclass::text = 'measurements';`

#### Unexpected Orphaned Measurements

- **Symptom**: High count of NULL organization_id after migration
- **Investigation**:
  ```sql
  -- Find users with measurements but no organization
  SELECT
    u.id,
    u.email,
    COUNT(m.id) as measurement_count
  FROM users u
  JOIN measurements m ON u.id = m.user_id
  WHERE m.organization_id IS NULL
  GROUP BY u.id, u.email
  ORDER BY measurement_count DESC;
  ```
- **Root Cause**: Users created without organization membership
- **Fix**: Assign users to organizations, re-run migration

### Success Criteria

- [ ] Migration completes in < 15 minutes
- [ ] Zero or minimal orphaned measurements (< 1% of total)
- [ ] All measurements have valid organization_id
- [ ] Application starts successfully after deployment
- [ ] No performance degradation observed
- [ ] No user-reported data access issues

### Contact Information

**Migration Author**: Claude Code (via GitHub PR #288)
**Database Team**: [Your DBA contact]
**On-Call Engineer**: [Your on-call contact]
**Incident Response**: [Your incident response process]

---

**Document Version**: 1.0
**Last Updated**: 2025-12-30
**Related PR**: #288 - Major Feature Update
**Related Documentation**:
- `MULTI_TENANT_SECURITY_FIX.md` - Context on why this migration is needed
- `migrations/0087_backfill_measurements_org_final.sql` - Migration source code
