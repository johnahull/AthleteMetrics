# Request-Level Caching Implementation

## Overview

This document describes the request-level caching system implemented to optimize database queries for `getUserOrganizations()` calls. This optimization reduces redundant database queries from 8+ per request to 1 per user per request.

## Problem Statement

The `getUserOrganizations()` function was being called 8+ times per request in routes like `athlete-routes.ts`, with each call hitting the database. This was causing:
- Unnecessary database load
- Slower request response times
- Inefficient resource usage

## Solution

Implemented a **request-scoped cache** using an Express middleware that attaches a `Map` to each incoming request. This cache is:
- **Request-scoped**: Not shared across requests (prevents data leakage)
- **Automatic**: Garbage collected after response (no memory leaks)
- **Transparent**: Easy to use with minimal code changes

## Architecture

### Components

1. **Type Definition** (`packages/api/types/session.d.ts`)
   - Added `cache?: Map<string, any>` to `Express.Request` interface
   - Type-safe cache access throughout the application

2. **Middleware** (`packages/api/middleware/request-cache.ts`)
   - Attaches empty `Map` to `req.cache` on each request
   - Registered globally in `packages/api/routes.ts`
   - Runs after input sanitization, before route handlers

3. **Cached Wrapper** (`packages/api/helpers/cached-org-access.ts`)
   - `getCachedUserOrganizations(req, userId)` function
   - Checks cache first, falls back to database on miss
   - Cache key format: `userOrgs:${userId}`

4. **Helper Updates** (`packages/api/helpers/org-access.ts`)
   - Updated `validateOrganizationAccess()` to accept optional `req` parameter
   - Updated `hasOrganizationAccess()` to accept optional `req` parameter
   - Backward compatible (works with or without cache)

## Usage

### Before (Direct Database Call)
```typescript
const userOrgs = await storage.getUserOrganizations(userId);
```

### After (Cached)
```typescript
const userOrgs = await getCachedUserOrganizations(req, userId);
```

### Files Updated
- ✅ `packages/api/routes/athlete-routes.ts` - 9 instances replaced
- ✅ `packages/api/middleware.ts` - 3 instances in helper function
- ✅ `packages/api/helpers/org-access.ts` - 2 functions updated with optional caching

## Performance Impact

### Before
- **Route**: `/api/athletes` with athlete list query
- **DB Queries**: 8+ calls to `getUserOrganizations()` per request
- **Pattern**: Each permission check hits database independently

### After
- **Route**: Same route
- **DB Queries**: 1 call to `getUserOrganizations()` per user per request
- **Pattern**: First call fetches from DB, subsequent calls use cache
- **Improvement**: 87.5% reduction in database queries (7 queries avoided per request)

## Test Coverage

Comprehensive test suite with 18 tests across 3 test files:

### Unit Tests
1. **Middleware Tests** (`packages/api/middleware/__tests__/request-cache.test.ts`)
   - Attaches Map to req.cache
   - Calls next() to continue middleware chain
   - Creates new cache per request (request-scoped)
   - Supports any value type in cache

2. **Helper Tests** (`packages/api/helpers/__tests__/cached-org-access.test.ts`)
   - Cache hit returns cached result
   - Cache miss calls storage
   - Different userIds cached separately
   - Cache not shared across requests
   - Handles missing cache gracefully
   - Handles empty results
   - Propagates storage errors
   - Supports multiple users per request

### Integration Tests
3. **Integration Tests** (`packages/api/__tests__/request-cache-integration.test.ts`)
   - Real Express app with middleware
   - Multiple calls in single request use cache
   - Cache not shared between requests
   - Multiple users cached separately
   - Graceful fallback when cache missing
   - Realistic 8-call scenario (87.5% query reduction)

## Security Considerations

### Cache Isolation
- ✅ **Request-scoped**: Cache is NOT shared between requests
- ✅ **No data leakage**: User A's data never exposed to User B
- ✅ **Automatic cleanup**: Cache garbage collected after response

### Error Handling
- ✅ **Errors propagated**: Database errors are not cached
- ✅ **Graceful degradation**: Works without cache (optional req parameter)
- ✅ **Type safety**: TypeScript ensures correct usage

## Future Optimizations

### Additional Candidates for Caching
Other database calls that could benefit from request-level caching:
- `storage.getUserTeams(userId)` - Called multiple times per request
- `storage.getOrganization(orgId)` - Called for same org repeatedly
- `storage.getUserRoles(userId, orgId)` - Permission checks

### Pattern for Adding New Cached Functions
1. Create wrapper function in `cached-org-access.ts` (or new file)
2. Use same cache key pattern: `${functionName}:${param}`
3. Add unit tests
4. Update route handlers to use cached wrapper

### Example Template
```typescript
export async function getCachedUserTeams(
  req: Request,
  userId: string
): Promise<any[]> {
  const cacheKey = `userTeams:${userId}`;

  if (req.cache?.has(cacheKey)) {
    return req.cache.get(cacheKey);
  }

  const teams = await storage.getUserTeams(userId);
  req.cache?.set(cacheKey, teams);
  return teams;
}
```

## Migration Guide

### For Route Handlers
Replace direct storage calls with cached wrappers:
```typescript
// Before
const userOrgs = await storage.getUserOrganizations(currentUser.id);

// After
const userOrgs = await getCachedUserOrganizations(req, currentUser.id);
```

### For Middleware
Update helper functions to accept and pass `req`:
```typescript
// Before
async function checkAccess(user: any, orgId: string) {
  const orgs = await storage.getUserOrganizations(user.id);
  return orgs.some(o => o.organizationId === orgId);
}

// After
async function checkAccess(req: Request, user: any, orgId: string) {
  const orgs = await getCachedUserOrganizations(req, user.id);
  return orgs.some(o => o.organizationId === orgId);
}
```

### For Services
Services can optionally accept `req` and use caching:
```typescript
// Backward compatible - works with or without req
export async function validateOrganizationAccess(
  user: SessionUser | undefined,
  requestedOrgId: string | undefined,
  req?: Request
): Promise<OrgAccessResult> {
  // Use cached version if req provided
  const userOrgs = req
    ? await getCachedUserOrganizations(req, user.id)
    : await storage.getUserOrganizations(user.id);

  // ... rest of logic
}
```

## Monitoring

To verify caching is working, check:
1. Database query logs (should see fewer `getUserOrganizations` queries)
2. Request response times (should be faster)
3. Unit tests (verify storage called only once per user per request)

## Related Documentation
- [Multi-Tenant Organization Isolation](./MULTI_TENANT_ORG_ISOLATION.md)
- [Organization Access Validation](../packages/api/helpers/org-access.ts)
- [Request Cache Middleware](../packages/api/middleware/request-cache.ts)
