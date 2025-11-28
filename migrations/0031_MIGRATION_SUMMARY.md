# Migration 0031: Organization Types Feature

## Summary
Migration 0031 adds organization type categorization to enable multi-tenant filtering of metrics and benchmarks based on organization type (youth, high school, college, club, private facility, elite academy).

## Files Created
- **0031_add_organization_types.sql** - Forward migration
- **0031_add_organization_types_down.sql** - Rollback migration

## Database Changes Made

### 1. Organizations Table
- **Added column**: `org_type TEXT NOT NULL DEFAULT 'club'`
- **Added constraint**: `organizations_org_type_check` - validates org_type is one of the 6 valid enum values
- **Added index**: `organizations_org_type_idx` - B-tree index for efficient org type filtering
- **Backward compatibility**: All existing organizations automatically get `org_type = 'club'`

### 2. Site_Metrics Table
- **Added column**: `available_org_types TEXT[]` (nullable array)
- **Added index**: `site_metrics_available_org_types_idx` - GIN index for efficient array overlap queries
- **Purpose**: Site admins can specify which org types can use each metric (NULL = available to all)

### 3. Site_Benchmarks Table
- **Added column**: `applicable_org_types TEXT[]` (nullable array)
- **Added index**: `site_benchmarks_org_types_idx` - GIN index for efficient array overlap queries  
- **Purpose**: Site admins can specify which org types each benchmark applies to (NULL = applies to all)

## Valid Organization Types
```typescript
const organizationTypeEnum = [
  'youth',           // Youth/children organizations
  'high_school',     // High school teams
  'college',         // College/university teams  
  'club',            // Club teams (default)
  'private_facility', // Private training facilities
  'elite_academy'    // Elite sports academies
] as const;
```

## Migration Safety Features
- **Idempotent**: Safe to run multiple times - checks for existing columns/constraints
- **Transactional**: Runs in transaction with automatic rollback on failure
- **Validation**: Comprehensive verification step confirms all changes applied correctly
- **Detailed logging**: Clear notices for each step and comprehensive verification output

## Testing Performed
✅ Forward migration applies successfully  
✅ Rollback migration removes all changes correctly  
✅ CHECK constraint prevents invalid org types  
✅ Valid org types can be inserted  
✅ Indexes created with correct types (B-tree for org_type, GIN for arrays)  
✅ Existing organizations get default 'club' org_type  
✅ Schema matches Drizzle definition in packages/shared/schema.ts  

## Usage Examples

### Organization Type Filtering
```sql
-- Find all college organizations
SELECT * FROM organizations WHERE org_type = 'college';

-- Find metrics available to high school orgs
SELECT * FROM site_metrics 
WHERE available_org_types IS NULL -- available to all
   OR available_org_types && ARRAY['high_school'];

-- Find benchmarks applicable to club orgs  
SELECT * FROM site_benchmarks
WHERE applicable_org_types IS NULL -- applies to all
   OR applicable_org_types && ARRAY['club'];
```

### Application Integration
The schema changes integrate seamlessly with the existing Drizzle ORM schema in `packages/shared/schema.ts`:

```typescript
// Organizations now have orgType field
const org = await db.select().from(organizations)
  .where(eq(organizations.orgType, 'college'));

// Metrics can be filtered by org type availability
const metrics = await db.select().from(siteMetrics)
  .where(
    or(
      isNull(siteMetrics.availableOrgTypes),
      sql`${siteMetrics.availableOrgTypes} && ARRAY[${orgType}]`
    )
  );
```

## Deployment Notes
- **Zero downtime**: Migration adds new nullable columns and default values
- **Automatic application**: All existing organizations receive `org_type = 'club'` 
- **Index performance**: GIN indexes on array columns enable efficient filtering queries
- **Schema validation**: Zod schemas in shared/schema.ts already updated to match database

## Rollback Instructions
If rollback is needed:
```bash
psql $DATABASE_URL -f migrations/0031_add_organization_types_down.sql
```

⚠️ **Warning**: Rollback permanently deletes all organization type data and cannot be recovered.