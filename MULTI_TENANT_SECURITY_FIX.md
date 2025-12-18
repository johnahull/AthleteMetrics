# Multi-Tenant Data Isolation Security Fix

## Summary

Fixed a critical data isolation vulnerability where organization admins could access data from other organizations by manipulating the `organizationId` parameter in API requests.

## Bug Report

**Severity**: CRITICAL
**Impact**: Organization admins could view/access athletes, teams, measurements, and analytics from organizations they don't belong to.

**Example Attack:**
- Admin from "Texas Volleyballers" (Org A) could query `/api/athletes?organizationId=<org-b-id>` and see athletes from "Texas FC" (Org B).

## Root Cause

Endpoints were checking `user.primaryOrganizationId` from the session against the requested `organizationId`, but this is vulnerable to session poisoning. The correct approach is to query the database to validate the user's actual organization membership.

**Vulnerable Pattern (BEFORE):**
```typescript
// ❌ VULNERABLE - trusts session data
if (!isSiteAdmin(user) && user.primaryOrganizationId !== organizationId) {
  return res.status(403).json({ message: "Access denied" });
}
```

**Secure Pattern (AFTER):**
```typescript
// ✅ SECURE - validates actual database membership
if (!isSiteAdmin(user)) {
  const userOrgs = await storage.getUserOrganizations(user.id);
  const hasAccess = userOrgs.some(org => org.organizationId === organizationId);
  if (!hasAccess) {
    return res.status(403).json({
      message: "Access denied - you don't have permission to access this organization"
    });
  }
}
```

## Affected Endpoints

The following endpoints were fixed to use `storage.getUserOrganizations()` for validation:

### 1. GET /api/athletes
**File**: `packages/api/routes/athlete-routes.ts:131-151`
**Status**: ✅ FIXED (was partially fixed, now fully secure)
**Change**: Uses `getUserOrganizations()` to validate access

### 2. GET /api/teams
**File**: `packages/api/routes/team-routes.ts:42-76`
**Status**: ✅ FIXED
**Change**: Replaced `user.primaryOrganizationId` check with database validation

### 3. GET /api/analytics/dashboard
**File**: `packages/api/routes/analytics-routes.ts:136-170`
**Status**: ✅ FIXED
**Change**: Replaced `user.primaryOrganizationId` check with database validation

### 4. GET /api/measurements
**File**: `packages/api/routes/measurement-routes.ts:152-173`
**Status**: ✅ FIXED
**Change**: Replaced `user.primaryOrganizationId` check with database validation

## Test Coverage

Created comprehensive integration tests in `packages/api/__tests__/multi-tenant-isolation.test.ts`:

**Test Scenarios:**
- ✅ Org admin from Org A CANNOT access Org B's athletes
- ✅ Org admin from Org A CANNOT access Org B's teams
- ✅ Org admin from Org A CANNOT access Org B's analytics
- ✅ Org admin from Org A CANNOT access Org B's measurements
- ✅ Org admin CAN access their own organization's data
- ✅ Site admins CAN access any organization's data
- ✅ `getUserOrganizations()` returns only user's actual memberships
- ✅ IDOR attack scenarios are prevented

**Test Results:** All 25 tests passing ✅

## Security Principle

**Defense in Depth**: Always validate user permissions against the actual database state, not cached session data.

**Why Session Data is Unreliable:**
1. Sessions can be manipulated
2. Session data may be stale
3. Session doesn't reflect real-time membership changes
4. Database is the source of truth for permissions

## Migration Guide

For any future endpoints that need organization validation, use this pattern:

```typescript
// For endpoints that accept organizationId parameter
if (organizationId) {
  if (!isSiteAdmin(user)) {
    const userOrgs = await storage.getUserOrganizations(user.id);
    const hasAccess = userOrgs.some(org => org.organizationId === organizationId);
    if (!hasAccess) {
      return res.status(403).json({
        message: "Access denied - you don't have permission to access this organization"
      });
    }
  }
} else if (!isSiteAdmin(user)) {
  // For endpoints where organizationId is optional
  const userOrgs = await storage.getUserOrganizations(user.id);
  if (userOrgs.length === 0) {
    return res.status(403).json({ message: "Access denied - no organization membership" });
  }
  // Use their primary org from actual membership, not session
  organizationId = userOrgs[0].organizationId;
}
```

## Performance Considerations

**Impact**: Each request now makes an additional database query via `getUserOrganizations()`.

**Mitigation Options:**
1. Add query result caching with short TTL (5-10 seconds)
2. Denormalize user-org relationships in session (with cache invalidation)
3. Accept the performance trade-off for security (recommended for now)

**Benchmark**: `getUserOrganizations()` query takes ~2-5ms on typical database.

## Related Files

- `packages/api/routes/athlete-routes.ts` - Athlete list endpoint
- `packages/api/routes/team-routes.ts` - Team list endpoint
- `packages/api/routes/analytics-routes.ts` - Analytics dashboard endpoint
- `packages/api/routes/measurement-routes.ts` - Measurements list endpoint
- `packages/api/storage.ts` - `getUserOrganizations()` method
- `packages/api/__tests__/multi-tenant-isolation.test.ts` - Security tests

## Deployment Notes

**Database Migration Required**: YES
A database migration was applied to add missing columns:
- `users.legal_accepted_at`
- `users.legal_accepted_version`

**Migration Script**: Run before deploying:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_version TEXT;
```

## Verification Steps

1. Run tests: `npm run test:run -- packages/api/__tests__/multi-tenant-isolation.test.ts`
2. All 25 tests should pass
3. Verify existing tests: `npm run test:run -- packages/api/routes/__tests__/athletes-recent.test.ts`
4. Type check: `npm run check` (one pre-existing error in storage.ts, unrelated to this fix)

## Security Audit Recommendations

1. ✅ Audit all endpoints that accept `organizationId` parameter
2. ✅ Ensure all use `getUserOrganizations()` for validation
3. ✅ Write comprehensive integration tests for multi-tenant isolation
4. ⚠️  Consider adding rate limiting to `getUserOrganizations()` calls
5. ⚠️  Consider adding audit logging for cross-org access attempts (failed 403s)

## Credits

**Fixed by**: Claude Code (test-driven-feature-agent)
**Date**: 2025-12-17
**Approach**: TDD - Wrote tests first, then fixed vulnerabilities
