# Migration 0058 Verification Checklist

## Overview
Migration 0058 performs data transformation on the `users.sports` column, converting sport names to sport codes.

**CRITICAL**: This migration includes data transformations that should be manually verified before production deployment.

## Pre-Deployment Verification Steps

### 1. Check Current Data Format
Before applying migration 0058 to production, verify the current format of `users.sports`:

```sql
-- Check sample of current sports values
SELECT id, email, sports
FROM users
WHERE sports IS NOT NULL
LIMIT 20;

-- Check all unique sports values
SELECT DISTINCT unnest(sports) AS sport_value
FROM users
WHERE sports IS NOT NULL
ORDER BY sport_value;
```

### 2. Validate Mapping Assumptions
Migration 0058 assumes these mappings (lines 116-139):

- `'Soccer'` → `'SOCCER'`
- `'Basketball'` → `'BASKETBALL'`
- `'Football'` → `'FOOTBALL'`
- `'Baseball'` → `'BASEBALL'`
- `'Softball'` → `'SOFTBALL'`
- `'Hockey'` → `'HOCKEY'`
- `'Lacrosse'` → `'LACROSSE'`
- `'Track & Field'` → `'TRACK_AND_FIELD'`
- `'Wrestling'` → `'WRESTLING'`
- `'Volleyball'` → `'VOLLEYBALL'`

**Action Required**: Verify that all existing sport values match one of the expected names above.

### 3. Check for Edge Cases
Look for potential issues:

```sql
-- Check for users with sports that don't match expected values
SELECT id, email, sports
FROM users
WHERE sports IS NOT NULL
AND NOT (
  sports @> ARRAY['Soccer'] OR
  sports @> ARRAY['Basketball'] OR
  sports @> ARRAY['Football'] OR
  sports @> ARRAY['Baseball'] OR
  sports @> ARRAY['Softball'] OR
  sports @> ARRAY['Hockey'] OR
  sports @> ARRAY['Lacrosse'] OR
  sports @> ARRAY['Track & Field'] OR
  sports @> ARRAY['Wrestling'] OR
  sports @> ARRAY['Volleyball']
);

-- Check for mixed case or whitespace issues
SELECT id, email, sports
FROM users
WHERE sports IS NOT NULL
AND EXISTS (
  SELECT 1 FROM unnest(sports) AS sport
  WHERE sport != trim(sport) -- Leading/trailing whitespace
  OR sport ~ '[a-z]' AND sport ~ '[A-Z]' -- Mixed case
);
```

### 4. Backup Strategy
Before running migration 0058 in production:

```sql
-- Create backup table with current sports values
CREATE TABLE users_sports_backup_pre_0058 AS
SELECT id, email, sports, updated_at
FROM users
WHERE sports IS NOT NULL;

-- Verify backup
SELECT COUNT(*) FROM users_sports_backup_pre_0058;
```

### 5. Post-Migration Verification
After applying migration 0058:

```sql
-- Verify all sports are now codes (uppercase with underscores)
SELECT DISTINCT unnest(sports) AS sport_code
FROM users
WHERE sports IS NOT NULL
ORDER BY sport_code;

-- Check for any sports that don't match expected format
SELECT id, email, sports
FROM users
WHERE sports IS NOT NULL
AND EXISTS (
  SELECT 1 FROM unnest(sports) AS sport
  WHERE sport !~ '^[A-Z_]+$' -- Should only contain uppercase and underscores
);

-- Compare row counts before/after
SELECT
  (SELECT COUNT(*) FROM users WHERE sports IS NOT NULL) AS current_count,
  (SELECT COUNT(*) FROM users_sports_backup_pre_0058) AS backup_count;
```

## Rollback Plan

If migration 0058 causes issues:

1. **Run down migration**:
   ```bash
   psql $DATABASE_URL < migrations/0058_add_sports_positions_management_down.sql
   ```

2. **Restore from backup** (if needed):
   ```sql
   UPDATE users u
   SET sports = b.sports
   FROM users_sports_backup_pre_0058 b
   WHERE u.id = b.id;
   ```

## Risk Assessment

- **Impact**: Low (migration appears safe for current data format)
- **Reversibility**: Partial (down migration exists but doesn't restore original names)
- **Data Loss Risk**: Low (no data deletion, only transformation)
- **Downtime Required**: No (migration runs online)

## Sign-off

- [ ] Verified current sports values match expected format
- [ ] Confirmed no edge cases exist
- [ ] Created backup table
- [ ] Tested migration in staging environment
- [ ] Verified post-migration data integrity
- [ ] Documented rollback procedure

**Approved by**: ________________
**Date**: ________________
**Environment**: [ ] Staging [ ] Production
