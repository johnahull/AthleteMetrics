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

## Future Improvements (Not Critical)

### 2. Token Exposure in URLs
**Issue**: Magic link tokens are currently exposed in URL paths/query parameters.

**Current Security Analysis**:
The token exposure risk is **LOW** due to existing protections:
1. **Rate limiting**: 10 requests per 15 minutes prevents brute force
2. **Single-use tokens**: Request-specific, cannot be reused
3. **Athlete validation**: Backend verifies athlete is in target list
4. **HTTPS required**: Production enforces encrypted connections
5. **Token binding**: Validated against specific request + template IDs

**Potential Risks** (Low Severity):
- Server logs may contain tokens (mitigated by log rotation and access controls)
- Referer headers (mitigated by HTTPS and SameSite cookies)
- Browser history (mitigated by single-use nature of tokens)

**If Future Enhancement Needed**, consider:

**Option A - URL Fragments** (Frontend change only):
```javascript
// Magic link: /wellness/submit#token=abc123
// Token never sent to server in HTTP request
// JS extracts from window.location.hash
// POST to backend separately
```

**Option B - Two-Step Validation** (Backend + Frontend):
```javascript
// 1. GET /wellness/magic/:requestId
// 2. Backend validates email domain
// 3. Frontend prompts for token from email
// 4. POST token to validate
```

**Recommendation**: Keep current implementation unless specific compliance requirements demand changes. The existing security controls provide adequate protection.

**Status**: Low priority - existing controls are sufficient

### 3. CSRF Protection for Magic Link Submissions
**Issue**: Public wellness submission endpoint could be vulnerable to cross-site request forgery.

**Analysis**: Magic link submissions have **built-in CSRF protection** through:
1. **Cryptographically secure tokens** (32-byte random hex = 64 characters)
2. **Single-use validation** (tokens are request-specific)
3. **Athlete targeting validation** (backend verifies athlete is in target list)
4. **Rate limiting** (10 requests per 15 minutes on token validation)
5. **Token binding** (request ID and template ID validated in middleware)

**Solution Implemented**:
- ✅ Session cookies already use `sameSite: 'strict'` (line 531 in routes.ts)
- ✅ Created CSRF middleware for future authenticated submissions
- ✅ Magic link tokens provide equivalent CSRF protection

**Why Traditional CSRF is Not Needed for Magic Links**:
- Magic link tokens are **unguessable** (2^256 possible values)
- Tokens are **request-specific** and **athlete-specific**
- Attackers cannot obtain valid tokens without email access
- This is similar to how password reset links work (also exempt from CSRF)

**Authenticated Submissions** (athlete portal login):
- CSRF middleware available in `packages/api/middleware/csrf-protection.ts`
- Can be enabled when athlete authentication portal is implemented

**Status**: ✅ Completed (magic link tokens provide CSRF protection)

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
