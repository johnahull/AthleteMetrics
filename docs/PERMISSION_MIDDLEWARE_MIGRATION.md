# Permission Middleware Migration Guide

## Overview
This document tracks the migration from inline permission checks to centralized middleware functions for athlete and organization management.

## Migration Status

### ✅ Completed Migrations

#### Athlete Routes (`server/routes/athlete-routes.ts`)
- **POST /api/athletes** - Uses `requireAthleteManagementPermission`
  - Allows: org_admin, coach, site_admin
  - Purpose: Create new athletes

- **PUT /api/athletes/:id** - Uses `requireAthleteAccessPermission`
  - Allows: org_admin, coach (same org), athlete (self), site_admin
  - Purpose: Update athlete profiles

- **DELETE /api/athletes/:id** - Uses `requireAthleteAccessPermission`
  - Allows: org_admin, coach (same org), site_admin
  - Purpose: Delete athletes
  - Note: Uses same middleware but deletion itself still requires admin permissions

### ⚠️ Pending Migrations (Future Work)

#### Athlete Routes
- **GET /api/athletes/:id** - Currently has inline permission checks
  - Should migrate to: `requireAthleteAccessPermission`
  - Current behavior: Athletes can view own profile, coaches/admins can view org athletes
  - Migration benefits: Code consistency, easier testing

- **GET /api/athletes** - Currently only uses `requireAuth`
  - Should migrate to: Custom middleware for org-scoped listing
  - Current behavior: Returns all athletes (site admin) or org-scoped athletes
  - Migration benefits: Explicit permission documentation

#### Organization Routes (`server/routes/organization-routes.ts`)
- **DELETE /api/organizations/:id/users/:userId** - Currently uses organization-service.ts logic
  - Already has proper hierarchical permission checking in service layer
  - No migration needed - service layer approach is valid

## Middleware Functions

### `requireAthleteManagementPermission`
**Purpose**: Check if user can create/manage athletes

**Allows**:
- Site admins (bypass all checks)
- Org admins (in their organization)
- Coaches (in their organization)

**Rejects**:
- Athletes
- Users with no organization access

### `requireAthleteAccessPermission`
**Purpose**: Check if user can access a specific athlete

**Allows**:
- Site admins (bypass all checks)
- **Athletes accessing their own profile** ⭐ **CRITICAL FIX**
- Org admins (if athlete in same organization)
- Coaches (if athlete in same organization)

**Features**:
- UUID format validation
- Athlete existence check
- Organization boundary enforcement

## Best Practices

1. **Use middleware for all permission checks** - Avoid inline permission logic
2. **Document middleware in route comments** - List which middleware applies
3. **Test permission boundaries** - Ensure tests cover all access patterns
4. **Consider performance** - Cache organization lookups when possible

## Testing Strategy

### Business Logic Tests
- Located in: `tests/integration/athlete-permissions.test.ts`
- Purpose: Validate permission checking algorithms
- Coverage: Edge cases, role hierarchies, organization boundaries

### API Integration Tests (TODO)
- Planned location: `tests/e2e/athlete-api.test.ts`
- Purpose: Test actual HTTP endpoints with database
- Coverage: Full request/response cycle, authentication, rate limiting

## Known Limitations

1. **Username Enumeration** - Generic error messages prevent username enumeration
2. **Rate Limiting** - IP-based, may need user-based approach for production
3. **GET Route Migration** - Not yet migrated to middleware pattern
4. **Cache Optimization** - Organization queries could be cached in session

## Future Enhancements

1. Implement user-based rate limiting (not just IP)
2. Add database transactions for "last admin" checks
3. Migrate all GET routes to middleware
4. Add request ID tracking for audit logs
5. Implement session invalidation on role changes
