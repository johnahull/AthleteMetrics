# Wellness Security Improvements

## Overview
This document tracks security enhancements made to the wellness questionnaire system to address potential vulnerabilities.

## Completed Improvements

### 1. Stricter Rate Limiting for Token Validation ✅
**Issue**: Token validation endpoints had weak rate limits (200/15min), making them vulnerable to enumeration attacks.

**Solution**:
- Added new `TOKEN_VALIDATION` rate limit constant (10 requests per 15 minutes)
- Applied to token validation endpoints:
  - `GET /api/wellness/requests/by-token/:token`
  - `GET /api/wellness/requests/by-token/:token/targeted-athletes`

**Impact**: Significantly reduces the risk of brute-force token enumeration attacks.

**Files Modified**:
- `packages/api/constants/rate-limits.ts`
- `packages/api/routes/wellness-routes.ts`

## Pending Improvements

### 2. Token Exposure in URLs (In Progress)
**Issue**: Magic link tokens are currently exposed in URL paths/query parameters, which:
- Appear in server logs
- Can leak via HTTP Referer headers
- May be cached by proxies/CDNs
- Visible in browser history

**Proposed Solution**:
Option A - URL Fragments (Recommended):
```javascript
// Magic link format: /wellness/submit#token=abc123
// JavaScript extracts token from window.location.hash
// Token sent to backend via POST with CSRF protection
```

Option B - Session-based approach:
```javascript
// 1. GET /api/wellness/magic-link/:requestId (no token in URL)
// 2. Backend creates temporary session with rate limiting
// 3. User POSTs token from email to validate
```

**Status**: Architecture being finalized

### 3. CSRF Protection for Magic Link Submissions
**Issue**: Public wellness submission endpoint lacks CSRF protection, making it vulnerable to cross-site request forgery.

**Proposed Solution**:
- Add CSRF token middleware for public submission endpoints
- Configure SameSite cookie attributes (`SameSite=Lax` or `SameSite=Strict`)
- Implement double-submit cookie pattern for stateless CSRF protection

**Implementation Plan**:
```typescript
// Add CSRF middleware
import csrf from 'csurf';

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
});

// Apply to submission endpoint
app.post("/api/wellness/responses", csrfProtection, ...);
```

**Status**: Pending

### 4. N+1 Query Pattern in Template Fetching
**Issue**: Dashboard endpoint may fetch templates individually for each response, causing N+1 database queries.

**Current Implementation**:
```typescript
// Line 1465-1473 in wellness-routes.ts
const uniqueTemplateIds = [...new Set(allResponses.map(r => r.templateId))];
const templates = await storage.getWellnessTemplatesBatch(uniqueTemplateIds);
const templateMap = new Map(templates.map(t => [t.id, t]));
```

**Status**: ✅ Already optimized with batch fetching (Line 1465)

**Note**: The current implementation uses `getWellnessTemplatesBatch()` which fetches all templates in a single query. No action needed.

## Security Testing Checklist

- [ ] Rate limiting tests for token validation endpoints
- [ ] CSRF token validation tests
- [ ] Token exposure tests (verify tokens not in logs)
- [ ] Integration tests for new magic link flow
- [ ] E2E tests for wellness submission with CSRF
- [ ] Performance tests for batch template fetching

## Deployment Notes

### Environment Variables
No new environment variables required for rate limiting changes.

### Breaking Changes
- Token validation endpoints now have stricter rate limits (10/15min vs 200/15min)
- This may affect automated testing - use `BYPASS_GENERAL_RATE_LIMIT=true` in test environments

### Migration Path
1. Deploy rate limiting changes (backward compatible)
2. Deploy CSRF protection (requires frontend updates)
3. Deploy new token handling (requires email template updates for magic links)

## References
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Rate Limiting Guidelines](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [Express Rate Limit Documentation](https://www.npmjs.com/package/express-rate-limit)
