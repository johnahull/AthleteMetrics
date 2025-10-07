# Security Documentation

> **Note**: This documentation was created as part of the landing page PR to address code review
> feedback requesting comprehensive CSRF protection documentation. While the landing page itself
> adds minimal security surface area (public welcome page), the review highlighted the need to
> document existing CSRF protection mechanisms, especially for public endpoints like invitation
> acceptance that bypass standard CSRF tokens.

## Authentication & Session Management

### Session Configuration
- **Session Store**: Express-session with secure configuration
- **Cookie Settings**:
  - `secure: true` in production (HTTPS only)
  - `httpOnly: true` (prevents XSS attacks)
  - `sameSite: 'strict'` (CSRF protection)
  - `maxAge: 24 hours`

### Password Security
- Passwords hashed using bcrypt with 12 rounds
- Minimum password requirements enforced via Zod schema
- Password reset tokens are single-use and expire after 1 hour
- Email verification tokens expire after 24 hours

## CSRF Protection

### Overview
AthleteMetrics implements comprehensive CSRF (Cross-Site Request Forgery) protection using a multi-layered approach:

1. **SameSite Cookie Attribute** (`sameSite: 'strict'`) - Primary defense
2. **CSRF Tokens** - Secondary defense for state-changing operations
3. **Referer Header Validation** - Defense-in-depth for public endpoints
4. **Rate Limiting** - Prevents brute force attacks

### CSRF Token Implementation

**Location**: `server/routes.ts` (lines 371-437)

#### How It Works

1. **Token Generation**:
   ```typescript
   // Client requests a CSRF token
   GET /api/csrf-token

   // Server generates token and stores secret in session
   const secret = csrfTokens.secretSync();
   const token = csrfTokens.create(secret);
   ```

2. **Token Validation**:
   ```typescript
   // Client includes token in request headers
   X-CSRF-Token: <token>
   // or
   X-XSRF-Token: <token>
   // or in request body
   _csrf: <token>
   ```

3. **Middleware Protection**:
   - Applied to all `/api` routes
   - Automatically validates CSRF tokens on state-changing operations
   - Skips validation for:
     - Safe HTTP methods (GET, HEAD, OPTIONS)
     - Pre-authentication endpoints (`/login`, `/register`)
     - File upload endpoints (multipart/form-data)
     - Public invitation acceptance endpoints

### Exempted Endpoints

Some endpoints cannot use standard CSRF token protection because they're accessed by unauthenticated users or require special handling:

#### 1. Pre-Authentication Endpoints
- `/api/login` - User doesn't have session yet
- `/api/register` - User doesn't have session yet

**Protection**: SameSite cookies prevent cross-origin submissions

#### 2. Invitation Acceptance
- `/api/invitations/:token/accept` - New users accepting invitations

**Multi-Layer Protection**:
1. **Single-Use Token**: Invitation tokens can only be used once
2. **SameSite Cookies**: Prevents cross-site attacks
3. **Referer Header Validation**: Verifies request originated from same domain
4. **Rate Limiting**: Prevents brute force token guessing
5. **Token Format Validation**: Alphanumeric + dash/underscore only (prevents path traversal)

**Code Reference**: `server/routes.ts` lines 3345-3355
```typescript
// Verify request came from same origin (Referer header check)
const referer = req.headers.referer || req.headers.origin;
const host = req.headers.host;
if (referer && host) {
  const refererHost = new URL(referer).host;
  if (refererHost !== host) {
    return res.status(403).json({ message: "Invalid request origin" });
  }
}
```

#### 3. File Upload Endpoints
- `/api/import/photo` - OCR photo uploads
- `/api/import/parse-csv` - CSV file parsing

**Protection**:
- Content-Type validation (multipart/form-data)
- File type validation (MIME type + extension)
- File size limits
- Rate limiting
- Authentication required

### Client-Side Implementation

#### Fetching CSRF Token
```typescript
// Get CSRF token before making state-changing requests
const response = await fetch('/api/csrf-token');
const { csrfToken } = await response.json();
```

#### Including Token in Requests
```typescript
// Option 1: Header (recommended)
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});

// Option 2: Request body
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ ...data, _csrf: csrfToken })
});
```

## Additional Security Measures

### Helmet.js Configuration
- Content Security Policy (CSP) enabled in production
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security enabled in production

### Rate Limiting
- Authentication endpoints: 5 attempts per 15 minutes
- API endpoints: 100 requests per 15 minutes
- File upload endpoints: 20 uploads per 15 minutes
- Password reset: 3 requests per hour

### Input Sanitization
- All user inputs sanitized using DOMPurify
- SQL injection protection via Drizzle ORM (parameterized queries)
- XSS prevention through sanitization and CSP

### Security Headers
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (production only)
- `Content-Security-Policy` (production only)

## Testing CSRF Protection

### Unit Tests
Location: `server/__tests__/import-security.test.ts`

Tests verify:
- CSRF token validation works correctly
- Exempt endpoints skip validation
- Invalid tokens are rejected
- Missing tokens are rejected

### Manual Testing

1. **Test CSRF Protection Works**:
   ```bash
   # Should fail without CSRF token
   curl -X POST http://localhost:5000/api/teams \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Team"}'

   # Should return 403: CSRF token missing
   ```

2. **Test Exempted Endpoints**:
   ```bash
   # Login should work without CSRF token
   curl -X POST http://localhost:5000/api/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"password"}'
   ```

## Security Incident Response

If a security vulnerability is discovered:

1. **Do not** publicly disclose until a fix is available
2. Report to: security@athletemetrics.com (or repository maintainers)
3. Provide details: impact, reproduction steps, suggested fix
4. Allow 90 days for fix before public disclosure

## Future Security Improvements

### Planned Enhancements
- [ ] Implement Content Security Policy (CSP) nonces for inline scripts
- [ ] Add security headers to all responses
- [ ] Implement audit logging for security events
- [ ] Add intrusion detection system (IDS) integration
- [ ] Implement automated security scanning in CI/CD pipeline
- [ ] Add virus scanning for file uploads (ClamAV integration)
- [ ] Implement two-factor authentication (2FA)
- [ ] Add automated penetration testing

### Security Best Practices for Developers

1. **Never Trust User Input**: Always validate and sanitize
2. **Use Parameterized Queries**: Prevent SQL injection (Drizzle ORM does this)
3. **Hash Passwords**: Use bcrypt with appropriate cost factor (12 rounds)
4. **Validate File Uploads**: Check MIME type AND file extension
5. **Implement Rate Limiting**: Prevent brute force and DoS attacks
6. **Use HTTPS in Production**: Enforce with HSTS header
7. **Keep Dependencies Updated**: Regular security audits
8. **Log Security Events**: For incident response and forensics
9. **Principle of Least Privilege**: Grant minimum necessary permissions
10. **Defense in Depth**: Multiple layers of security

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)
