# AthleteMetrics Authentication System Refactor Plan

**Version:** 1.0
**Date:** 2025-10-02
**Status:** Planning Phase

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Recommended Solution](#recommended-solution)
3. [Implementation Plan](#implementation-plan)
   - [Phase 1: JWT Token Infrastructure](#phase-1-jwt-token-infrastructure)
   - [Phase 2: Complete Security Infrastructure](#phase-2-complete-security-infrastructure)
   - [Phase 3: Multi-Organization UX Optimization](#phase-3-multi-organization-ux-optimization)
   - [Phase 4: Session Management UI](#phase-4-session-management-ui)
   - [Phase 5: Advanced Security Features](#phase-5-advanced-security-features)
   - [Phase 6: API Access for Integrations](#phase-6-api-access-for-integrations)
   - [Phase 7: Mobile App Foundation](#phase-7-mobile-app-foundation)
4. [Migration Strategy](#migration-strategy)
5. [Technical Specifications](#technical-specifications)
6. [Files to Create/Modify](#files-to-createmodify)
7. [Testing Strategy](#testing-strategy)
8. [Monitoring & Observability](#monitoring--observability)

---

## Current State Analysis

### Strengths ✅

- **Comprehensive database schema** with MFA support, security events logging, and login sessions tracking
- **Robust security classes** (AuthSecurity, RoleManager, PasswordResetService) with solid foundation
- **Granular role-based permission system** (site_admin → org_admin → coach → athlete → guest)
- **Account lockout protection** (5 failed attempts, 15-minute lockout)
- **Session-based authentication** using Express sessions
- **User impersonation** feature for site admins
- **Security middleware** with rate limiting, Helmet security headers, DOMPurify for XSS protection
- **Temporal team membership** support with historical tracking

### Gaps & Issues ❌

- **MFA infrastructure exists but not fully implemented** in auth flow
- **CSRF protection imported but not configured** properly
- **Email service not implemented** (password reset, verification are TODOs)
- **Email verification not enforced** for user accounts
- **Session management disconnect** between loginSessions table and Express sessions
- **No OAuth/SSO support** for social login or enterprise SSO
- **No API keys** for programmatic access
- **Limited audit logging** coverage for compliance
- **No user-facing session management UI** to view/revoke sessions
- **Organization context switching** could be smoother
- **Session-based auth prevents mobile app development** (needs JWT for mobile compatibility)

---

## Recommended Solution

### **JWT-Based Mobile-Ready Auth Refactor**

Since mobile support is required, we must transition from Express sessions to **JWT tokens with refresh token rotation**. This architecture provides:

- ✅ **Mobile compatibility** (iOS/Android apps)
- ✅ **Stateless authentication** for scalability
- ✅ **Secure session management** with server-side revocation
- ✅ **Multi-device support** with session tracking
- ✅ **Enhanced security** with device fingerprinting and anomaly detection

### Architecture Overview

```
┌─────────────────────────────────────────┐
│         Client (Web/Mobile)              │
│                                          │
│  - Access JWT (15 min, in memory)       │
│  - Refresh JWT (30 days, secure storage)│
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│       API Gateway/Middleware             │
│  - Validate access token signature       │
│  - Check loginSessions table             │
│  - Verify device fingerprint             │
│  - Load user permissions                 │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      loginSessions Table (PostgreSQL)    │
│  - Track all active sessions             │
│  - Store refresh token hashes            │
│  - Device info, IP, location             │
│  - Enable remote session revocation      │
└─────────────────────────────────────────┘
```

---

## Implementation Plan

### **Phase 1: JWT Token Infrastructure** (Foundation)

**Goal:** Replace session-based auth with JWT + refresh tokens for mobile compatibility

**Duration:** Week 1-2

#### Tasks

1. **Create JWT Service** (`server/auth/jwt-service.ts`)
   - Generate access tokens (15 min expiry)
     - Payload: userId, email, role, orgId, permissions, isSiteAdmin
   - Generate refresh tokens (30 days, opaque random string)
   - Token verification with RS256 signature validation
   - Token refresh with rotation (invalidate old refresh token)
   - Key rotation support for enhanced security

2. **Update loginSessions Schema**
   ```sql
   ALTER TABLE login_sessions
     ADD COLUMN refresh_token_hash TEXT,
     ADD COLUMN device_fingerprint TEXT,
     ADD COLUMN last_refreshed_at TIMESTAMP,
     ADD COLUMN revoked_at TIMESTAMP;
   ```

3. **Create JWT Middleware** (`server/middleware/jwt-auth.ts`)
   - Extract JWT from Authorization header (`Bearer <token>`)
   - Validate signature and expiration
   - Verify session not revoked in loginSessions table
   - Attach decoded user to `req.user`
   - Fall back to session auth during migration period

4. **Update Login Flow** (`server/routes/auth-routes.ts`)
   - On successful login:
     - Create loginSessions entry with device fingerprint
     - Generate access + refresh tokens
     - Return both tokens to client
     - Set refresh token in httpOnly cookie (web)
     - Return refresh token in body (mobile)

5. **Create Token Refresh Endpoint** (`POST /api/auth/refresh`)
   - Validate refresh token from cookie or body
   - Look up in loginSessions table
   - Check not revoked and not expired
   - Rotate refresh token (invalidate old, issue new)
   - Issue new access token
   - Update lastRefreshedAt timestamp

6. **Client Token Manager** (`client/src/lib/token-manager.ts`)
   - Store access token in memory (web) or secure storage (mobile)
   - Automatic token refresh before expiration
   - Axios/fetch interceptor to attach Authorization header
   - Handle 401 responses with token refresh retry
   - Race condition handling for parallel requests

#### Success Criteria
- [ ] JWT tokens generated and validated correctly
- [ ] Token refresh works seamlessly
- [ ] Sessions tracked in loginSessions table
- [ ] Web app works with new JWT system
- [ ] Backward compatibility with sessions maintained

---

### **Phase 2: Complete Security Infrastructure**

**Goal:** Wire up all half-built security features

**Duration:** Week 3-4

#### Tasks

1. **MFA Implementation**

   **Backend Routes:**
   - `POST /api/auth/mfa/setup`
     - Generate TOTP secret using `authenticator.generateSecret()`
     - Return QR code data URI and secret
   - `POST /api/auth/mfa/verify-setup`
     - Verify TOTP token
     - Save mfaSecret to user record
     - Generate 10 backup codes
     - Return backup codes (user must save)
     - Set mfaEnabled = true
   - `POST /api/auth/mfa/disable`
     - Require password confirmation
     - Clear mfaSecret and backupCodes
     - Set mfaEnabled = false
   - `POST /api/auth/mfa/verify` (during login)
     - Verify TOTP token or backup code
     - If backup code used, remove from list
     - Complete authentication flow

   **Frontend Components:**
   - MFA setup wizard with QR code display
   - Backup codes download/print interface
   - MFA challenge modal during login
   - MFA management in account settings

2. **CSRF Protection**
   - Configure `csrf` middleware for state-changing endpoints
   - Generate CSRF token on page load, store in meta tag
   - Add CSRF token to all POST/PUT/DELETE requests
   - Not needed for mobile (JWT auth is inherently CSRF-safe)
   - Use double-submit cookie pattern

3. **Email Service Integration**

   **Choose Provider:** SendGrid, AWS SES, or Postmark

   **Email Templates:**
   - Welcome email with verification link
   - Email verification reminder
   - Password reset with secure token
   - MFA enabled notification
   - Login from new device alert
   - Password changed notification
   - Session revoked notification
   - Suspicious activity warning

   **Implementation:**
   - Create `server/services/email-service.ts`
   - Template engine (Handlebars or React Email)
   - Queue system for reliability (BullMQ recommended)
   - Rate limiting per email type
   - Unsubscribe link for notifications
   - Email delivery tracking

4. **Email Verification Enforcement**
   - Add middleware `requireEmailVerified`
   - Block sensitive actions if email not verified:
     - Creating measurements
     - Inviting users
     - Changing roles
     - Exporting data
   - Show banner on all pages when unverified
   - `POST /api/auth/resend-verification` with rate limiting
   - Auto-verify email if user completes password reset

5. **Enhanced Account Lockout**
   - Extend existing 5-attempt lockout
   - Progressive delays (exponential backoff)
   - Send email notification when account locked
   - Site admin manual unlock capability
   - Show lockout timer on login page

6. **Security Event Expansion**

   **Add Event Types:**
   ```typescript
   type SecurityEventType =
     | 'login_success' | 'login_failed' | 'login_locked'
     | 'password_changed' | 'password_reset_requested' | 'password_reset_completed'
     | 'mfa_enabled' | 'mfa_disabled' | 'mfa_challenge_failed'
     | 'email_verified' | 'email_changed'
     | 'session_created' | 'session_revoked' | 'token_refreshed'
     | 'role_changed' | 'permission_denied'
     | 'api_key_created' | 'api_key_revoked'
     | 'suspicious_activity' | 'anomaly_detected';
   ```

   **User-Facing Features:**
   - Security activity log page (`/account/security`)
   - Filterable by event type and date
   - Export as CSV
   - Visual timeline for major events

#### Success Criteria
- [ ] MFA setup and verification working end-to-end
- [ ] CSRF protection active on all mutation endpoints
- [ ] Email service sending all notification types
- [ ] Email verification enforced for sensitive actions
- [ ] Security events comprehensively logged

---

### **Phase 3: Multi-Organization UX Optimization**

**Goal:** Smooth experience for users in multiple organizations

**Duration:** Week 5-6

#### Tasks

1. **Organization Context Management**
   - Include `selectedOrganizationId` in JWT access token
   - Store user's last selected org in `userOrganizations` table
   - Load on login and include in JWT
   - Update token on organization switch

2. **Organization Selector Component**

   **Component: `OrganizationSelector.tsx`**
   ```tsx
   <OrganizationSelector>
     - Dropdown in app header
     - Search/filter organizations by name
     - Show user's role in each org
     - Visual indicator of current org (checkmark)
     - "All Organizations" view for site admins
     - Keyboard shortcut: Cmd/Ctrl + K
     - On switch: refresh token with new orgId
   </OrganizationSelector>
   ```

3. **Current Organization Indicators**
   - Show org name in page header
   - Update page title with org name
   - Favicon badge for different orgs (optional)
   - Breadcrumb navigation showing org context

4. **Invitation System**

   **Backend:**
   - `POST /api/invitations` - Create invitation, send email
   - `GET /api/invitations/accept/:token` - Validate token
   - `POST /api/invitations/accept/:token` - Accept invitation
     - If email matches existing user: link accounts
     - If new email: create account + send verification
   - `DELETE /api/invitations/:id` - Revoke invitation (admin)
   - Expiration handling (7 days)
   - Prevent duplicate invitations

   **Frontend:**
   - Invitation modal with email input
   - Pending invitations badge in header
   - Invitation acceptance page
   - List of sent invitations (admin view)

5. **Team Membership UI Improvements**
   - Timeline view of membership periods
   - Historical seasons dropdown filter
   - Batch assign athletes to teams (CSV upload)
   - Team roster changes diff view (before/after)
   - Export team roster as PDF

6. **Cross-Organization Features (Site Admin Only)**
   - Global search across all orgs
   - Comparative analytics dashboard
   - Organization health metrics:
     - Active users count
     - Recent measurement activity
     - Storage usage
     - API usage
   - Organization switcher shows all orgs

#### Success Criteria
- [ ] Organization switching is instant and intuitive
- [ ] Current organization clearly visible at all times
- [ ] Invitation flow working end-to-end
- [ ] Team membership UI shows historical data
- [ ] Site admins can view cross-org analytics

---

### **Phase 4: Session Management UI**

**Goal:** Give users visibility and control over their sessions

**Duration:** Week 7

#### Tasks

1. **Active Sessions Page** (`/account/sessions`)

   **Features:**
   - List all active loginSessions for current user
   - Display for each session:
     - Device name/type (desktop, mobile, tablet)
     - Browser and version
     - IP address
     - Approximate location (city, country from IP)
     - Last activity timestamp
     - Created timestamp
     - "Current session" indicator
   - Actions:
     - Revoke individual session
     - "Revoke all other sessions" button
   - Security warnings:
     - Highlight sessions with different IP/location
     - Flag suspicious sessions (anomaly detected)

   **Backend:**
   - `GET /api/sessions` - List user's sessions
   - `DELETE /api/sessions/:id` - Revoke specific session
   - `DELETE /api/sessions/others` - Revoke all except current

2. **Security Activity Log** (`/account/security`)

   **Features:**
   - Paginated list of securityEvents
   - Filters:
     - Event type dropdown
     - Date range picker
     - Severity level
   - Event details modal
   - Export as CSV
   - Visual timeline for major events
   - Color coding by severity

3. **New Device Detection & Alerts**

   **Flow:**
   - On login, calculate device fingerprint
   - Compare with known devices in loginSessions
   - If new device detected:
     - Flag session in database
     - Send email alert to user
     - Email includes:
       - Device info, location, timestamp
       - "This wasn't me?" button (one-click revoke)
       - Link to sessions page
   - After first login, mark device as "trusted"

4. **Email Alert Templates**
   - New device login alert
   - Suspicious activity detected
   - Password changed confirmation
   - MFA status changed
   - Session revoked notification

#### Success Criteria
- [ ] Users can view all active sessions
- [ ] Session revocation works instantly
- [ ] New device emails sent reliably
- [ ] Security activity log is comprehensive
- [ ] UI is responsive and intuitive

---

### **Phase 5: Advanced Security Features**

**Goal:** Zero-trust and step-up authentication

**Duration:** Week 8-9

#### Tasks

1. **Step-Up Authentication**

   **Concept:** Require re-authentication for high-risk actions

   **Implementation:**
   - Add `lastAuthenticatedAt` to JWT payload
   - Middleware: `requireRecentAuth(maxAgeMinutes = 5)`
     - Check if lastAuthenticatedAt is within maxAge
     - If not, return 403 with `reauthRequired: true`
   - Frontend: Show re-auth modal
     - Password entry or MFA challenge
     - On success, refresh token with new lastAuthenticatedAt

   **Protected Actions:**
   - Deleting organization
   - Changing user roles
   - Bulk data export
   - Viewing API keys
   - Disabling MFA
   - Changing email address
   - Adding payment methods (future)

2. **Device Fingerprinting**

   **Client-Side Collection:**
   ```typescript
   const fingerprint = {
     userAgent: navigator.userAgent,
     screen: `${screen.width}x${screen.height}`,
     timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
     language: navigator.language,
     platform: navigator.platform,
     // Hash all together
   };
   ```

   **Server-Side Validation:**
   - Store fingerprint hash in loginSessions
   - On each request, validate fingerprint matches
   - Alert on fingerprint mismatch (possible session hijacking)

3. **Anomaly Detection**

   **Anomaly Types:**
   - **Geographic:** Login from different country than usual
   - **Impossible Travel:** NYC → London in 1 hour
   - **Unusual Time:** Login at 3 AM when user typically uses during day
   - **Rate Anomaly:** Rapid succession of API calls
   - **Permission Escalation:** Unusual role changes

   **Implementation:**
   ```typescript
   class AnomalyDetector {
     async detectGeographicAnomaly(userId, currentIP, previousIP)
     async detectImpossibleTravel(userId, currentLocation, previousLocation, timeDelta)
     async detectUnusualBehavior(userId, action)
     async calculateRiskScore(userId, context)
   }
   ```

   **Response:**
   - Risk score: 0-100
   - If score > 70: Require MFA challenge
   - If score > 90: Auto-revoke session + email alert
   - Log all anomalies to securityEvents

4. **Comprehensive Audit Logging**

   **New Table: `auditLogs`**
   ```sql
   CREATE TABLE audit_logs (
     id UUID PRIMARY KEY,
     user_id UUID REFERENCES users(id),
     organization_id UUID REFERENCES organizations(id),
     action TEXT NOT NULL,
     resource_type TEXT,
     resource_id TEXT,
     request_body JSONB,
     ip_address TEXT,
     user_agent TEXT,
     success BOOLEAN,
     error_message TEXT,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

   **What to Log:**
   - All API requests (GET, POST, PUT, DELETE)
   - Permission checks (success and failure)
   - Data exports and bulk operations
   - Role changes and permission grants
   - Organization/team/user creation/deletion
   - Measurement imports

   **Audit Log Viewer (Site Admin):**
   - Powerful filtering:
     - User, organization, action, resource type
     - Date range, success/failure
     - Full-text search on request body
   - Export filtered logs as CSV
   - Real-time log streaming (WebSocket)
   - Retention policy (90 days default, configurable)

#### Success Criteria
- [ ] Step-up auth works for sensitive operations
- [ ] Device fingerprinting detects session hijacking
- [ ] Anomaly detection flags suspicious activity
- [ ] Audit logs capture all important events
- [ ] Site admins can search and analyze audit logs

---

### **Phase 6: API Access for Integrations**

**Goal:** Enable programmatic access and automation

**Duration:** Week 10-11

#### Tasks

1. **API Key System**

   **Database Table:**
   ```sql
   CREATE TABLE api_keys (
     id UUID PRIMARY KEY,
     user_id UUID REFERENCES users(id),
     organization_id UUID REFERENCES organizations(id),
     name TEXT NOT NULL,
     key_hash TEXT NOT NULL,
     key_prefix TEXT, -- First 8 chars for display: "ak_prod_abc123..."
     scopes TEXT[] DEFAULT '{}',
     last_used_at TIMESTAMP,
     expires_at TIMESTAMP,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

   **Scopes:**
   ```typescript
   const API_KEY_SCOPES = [
     'read:measurements',
     'write:measurements',
     'read:athletes',
     'write:athletes',
     'read:teams',
     'write:teams',
     'read:analytics',
     'export:data',
   ];
   ```

   **Endpoints:**
   - `POST /api/api-keys` - Create API key
     - Returns key ONCE (never stored in plain text)
     - User must copy and save immediately
   - `GET /api/api-keys` - List user's API keys
     - Show only key prefix (e.g., "ak_prod_abc123...")
   - `PATCH /api/api-keys/:id` - Update scopes/name
   - `DELETE /api/api-keys/:id` - Revoke API key

   **Authentication Middleware:**
   ```typescript
   async function authenticateApiKey(req, res, next) {
     const apiKey = req.headers['x-api-key'];
     if (!apiKey) return next(); // Try other auth methods

     const keyHash = bcrypt.hash(apiKey);
     const apiKeyRecord = await db.findApiKeyByHash(keyHash);

     if (!apiKeyRecord || apiKeyRecord.expiresAt < new Date()) {
       return res.status(401).json({ error: 'Invalid API key' });
     }

     req.user = { id: apiKeyRecord.userId, scopes: apiKeyRecord.scopes };
     await db.updateLastUsed(apiKeyRecord.id);
     next();
   }
   ```

2. **Personal Access Tokens (PAT)**

   **Differences from API Keys:**
   - Longer-lived (1 year default)
   - User-scoped (not org-scoped)
   - Used for CLI tools, scripts
   - Prefix: `pat_` vs `ak_`

3. **Usage Tracking**

   **Table:**
   ```sql
   CREATE TABLE api_key_usage (
     id UUID PRIMARY KEY,
     api_key_id UUID REFERENCES api_keys(id),
     endpoint TEXT,
     method TEXT,
     status_code INTEGER,
     response_time_ms INTEGER,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

   **Features:**
   - Track requests per API key
   - Daily/monthly quota enforcement
   - Usage dashboard showing:
     - Requests over time (chart)
     - Top endpoints used
     - Error rates
     - Latency percentiles
   - Alert when approaching quota

4. **Rate Limiting per API Key**
   - Stricter limits than user auth
   - Default: 100 requests/hour per key
   - Configurable per key
   - Return rate limit headers:
     ```
     X-RateLimit-Limit: 100
     X-RateLimit-Remaining: 45
     X-RateLimit-Reset: 1234567890
     ```

#### Success Criteria
- [ ] Users can create and manage API keys
- [ ] API key authentication works correctly
- [ ] Scopes are enforced properly
- [ ] Usage tracking provides insights
- [ ] Rate limiting prevents abuse

---

### **Phase 7: Mobile App Foundation**

**Goal:** Prepare backend for seamless mobile experience

**Duration:** Week 12

#### Tasks

1. **Mobile-Specific Endpoints**

   **Device Registration:**
   - `POST /api/auth/device/register`
     ```json
     {
       "deviceToken": "fcm_token_or_apns_token",
       "platform": "ios" | "android",
       "appVersion": "1.0.0",
       "deviceModel": "iPhone 14 Pro"
     }
     ```
   - Store in `devices` table
   - Link to user account

   **Push Notifications:**
   - Security alerts (new login, suspicious activity)
   - Measurement reminders
   - Team announcements

2. **Optimized API Responses**

   **Field Selection:**
   - Support `?fields=id,name,email` query param
   - Return only requested fields
   - Reduce payload size for mobile

   **Pagination:**
   - Cursor-based pagination (better for mobile)
   - `?limit=20&cursor=abc123`
   - Return `nextCursor` in response

3. **Offline Support Considerations**

   **Optimistic Locking:**
   - Add `version` field to entities
   - Increment on each update
   - Reject updates with stale version

   **Conflict Resolution:**
   - Last-write-wins strategy (default)
   - Merge strategy for certain fields
   - Return conflicts for manual resolution

   **Sync Endpoint:**
   - `GET /api/sync/status`
   - Return what's changed since last sync
   - Delta syncing to minimize data transfer

4. **Mobile-Friendly Features**

   **Biometric Unlock:**
   - Use refresh token instead of password
   - Mobile app stores refresh token securely
   - On biometric success, use refresh token to get new access token

   **Remember Device:**
   - Extend refresh token expiry for trusted devices
   - 90 days instead of 30 days

   **Background Token Refresh:**
   - Mobile app refreshes token in background
   - Ensures user never sees auth errors

   **Push Notifications:**
   - New measurement added
   - Invited to organization/team
   - Security alert (new login, unusual activity)
   - Upcoming test/measurement reminder

#### Success Criteria
- [ ] Mobile apps can register devices
- [ ] Push notifications working
- [ ] API responses optimized for mobile
- [ ] Offline conflict handling implemented
- [ ] Biometric unlock seamless

---

## Migration Strategy

### Backward Compatibility During Transition

To ensure zero downtime, we'll support both session-based and JWT authentication simultaneously during the migration period.

**Dual Authentication Middleware:**

```typescript
export const authenticate = async (req, res, next) => {
  // Try JWT first (new way)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = await jwtService.verify(token);

      // Check if session is revoked
      const session = await db.findSessionByUserId(decoded.sub);
      if (session?.revokedAt) {
        return res.status(401).json({ error: 'Session revoked' });
      }

      req.user = decoded;
      req.authMethod = 'jwt';
      return next();
    } catch (err) {
      // Invalid JWT, fall through to session auth
      console.warn('JWT verification failed:', err.message);
    }
  }

  // Fall back to session auth (old way)
  if (req.session?.user) {
    req.user = req.session.user;
    req.authMethod = 'session';
    return next();
  }

  // No valid authentication
  return res.status(401).json({ error: 'Not authenticated' });
};
```

### Rollout Timeline

**Week 1-2: JWT Infrastructure**
- Implement JWT service
- Update login to return tokens
- Add token refresh endpoint
- Deploy behind feature flag

**Week 3: Web App Migration**
- Update frontend to use JWT
- Keep session auth as fallback
- A/B test with 10% of users

**Week 4: Mobile App Development**
- Build mobile apps with JWT from start
- Test on TestFlight/Google Play Beta

**Week 5-6: Security Features**
- Complete MFA, CSRF, email service
- Roll out to all users

**Week 7-9: UX & Advanced Features**
- Multi-org improvements
- Session management UI
- Step-up auth, anomaly detection

**Week 10-11: API Access**
- API keys for integrations
- Usage tracking

**Week 12: Mobile Foundation**
- Device registration
- Push notifications
- Offline support

**Week 13: Testing & Stabilization**
- Load testing
- Security audit
- Bug fixes

**Week 14: Full Rollout**
- Remove feature flags
- Migrate all users to JWT
- Monitor closely for issues

**Week 15+: Session Cleanup**
- After 30 days of JWT usage, remove session fallback code
- Sunset old session-based endpoints
- Update documentation

---

## Technical Specifications

### JWT Structure

**Access Token (15 min expiry):**

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "coach@example.com",
  "role": "coach",
  "orgId": "660e8400-e29b-41d4-a716-446655440000",
  "permissions": [
    "VIEW_ANALYTICS",
    "CREATE_MEASUREMENTS",
    "MANAGE_TEAM"
  ],
  "isSiteAdmin": false,
  "deviceFingerprint": "a3b5c7d9e1f2a4b6c8d0e2f4",
  "lastAuthenticatedAt": 1696789012,
  "iat": 1696789012,
  "exp": 1696789912
}
```

**Refresh Token:**
- Opaque random string (64 bytes)
- Example: `rt_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`
- Stored as bcrypt hash in `loginSessions.refresh_token_hash`
- Cannot be decoded, must look up in database
- One-time use (rotated on each refresh)

### Database Schema Changes

```sql
-- Add to loginSessions table
ALTER TABLE login_sessions
  ADD COLUMN refresh_token_hash TEXT,
  ADD COLUMN device_fingerprint TEXT,
  ADD COLUMN last_refreshed_at TIMESTAMP,
  ADD COLUMN revoked_at TIMESTAMP,
  ADD COLUMN device_name TEXT,
  ADD COLUMN device_type TEXT; -- 'desktop', 'mobile', 'tablet'

-- Add indexes for performance
CREATE INDEX idx_login_sessions_refresh_token ON login_sessions(refresh_token_hash);
CREATE INDEX idx_login_sessions_user_active ON login_sessions(user_id, is_active);
CREATE INDEX idx_login_sessions_revoked ON login_sessions(revoked_at) WHERE revoked_at IS NOT NULL;

-- Audit logs table (new)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  request_method TEXT,
  request_path TEXT,
  request_body JSONB,
  response_status INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for audit logs
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- API Keys table (new)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL, -- 'ak_prod_abc123' for display
  scopes TEXT[] DEFAULT '{}',
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id, is_active);

-- API Key Usage table (new)
CREATE TABLE api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_key_usage_key ON api_key_usage(api_key_id, created_at DESC);
CREATE INDEX idx_api_key_usage_created ON api_key_usage(created_at) WHERE created_at > NOW() - INTERVAL '90 days';

-- Devices table (new, for mobile)
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL UNIQUE, -- FCM/APNS token
  platform TEXT NOT NULL, -- 'ios', 'android'
  app_version TEXT,
  device_model TEXT,
  os_version TEXT,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_devices_user ON devices(user_id, is_active);
CREATE INDEX idx_devices_token ON devices(device_token) WHERE is_active = true;

-- User Preferences table (new)
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_selected_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  email_notifications_enabled BOOLEAN DEFAULT true,
  push_notifications_enabled BOOLEAN DEFAULT true,
  mfa_preferred_method TEXT DEFAULT 'totp', -- 'totp', 'backup_code'
  theme TEXT DEFAULT 'light',
  timezone TEXT DEFAULT 'UTC',
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Security Hardening Checklist

- [x] **JWT Signature Verification** - RS256 or HS256
- [x] **Refresh Token Rotation** - One-time use, invalidate on refresh
- [x] **Secure Token Storage**
  - Web: Access token in memory, refresh in httpOnly cookie
  - Mobile: Both in secure storage (Keychain/Keystore)
- [x] **CSRF Protection** - Double-submit cookie for web
- [x] **Rate Limiting**
  - Login: 5 attempts per 15 min per IP
  - Password reset: 3 attempts per hour
  - Token refresh: 10 per minute
  - API endpoints: 100 per hour (user), 1000 per hour (site admin)
- [x] **Account Lockout** - 5 failed attempts = 15 min lockout
- [x] **MFA with TOTP** - Google Authenticator compatible
- [x] **Backup Codes** - 10 single-use codes
- [x] **Email Verification** - Required for sensitive operations
- [x] **Session Revocation** - User can revoke any session
- [x] **Device Fingerprinting** - Detect session hijacking
- [x] **Anomaly Detection** - Geographic, temporal, behavioral
- [x] **Step-Up Authentication** - Re-auth for high-risk actions
- [x] **Comprehensive Audit Logging** - All actions logged
- [x] **Secure Password Policies** - 12 chars, mixed case, numbers, symbols
- [x] **XSS Protection** - DOMPurify, CSP headers
- [x] **SQL Injection Protection** - Drizzle ORM parameterization
- [x] **HTTPS Enforcement** - All traffic over TLS
- [x] **Security Headers** - Helmet middleware (HSTS, X-Frame-Options, etc.)
- [x] **Dependency Scanning** - npm audit, Snyk
- [x] **Secrets Management** - Environment variables, never in code

---

## Files to Create/Modify

### New Files to Create

**Backend:**
- `server/auth/jwt-service.ts` - JWT generation, verification, refresh
- `server/middleware/jwt-auth.ts` - JWT authentication middleware
- `server/middleware/require-recent-auth.ts` - Step-up auth middleware
- `server/routes/token-routes.ts` - Token refresh endpoint
- `server/routes/mfa-routes.ts` - MFA setup, verify, disable
- `server/routes/session-routes.ts` - Session management (list, revoke)
- `server/routes/api-key-routes.ts` - API key CRUD
- `server/services/email-service.ts` - Email sending with templates
- `server/services/anomaly-detection.ts` - Security anomaly detection
- `server/services/device-fingerprint.ts` - Device fingerprinting logic
- `server/utils/audit-logger.ts` - Audit logging utility

**Shared:**
- `shared/jwt-types.ts` - JWT payload TypeScript types
- `shared/api-key-types.ts` - API key types and scopes
- `shared/audit-types.ts` - Audit log types

**Client:**
- `client/src/lib/token-manager.ts` - Token storage and refresh logic
- `client/src/lib/api-interceptor.ts` - Axios interceptor for auth
- `client/src/components/OrganizationSelector.tsx` - Org switcher
- `client/src/components/MFASetupWizard.tsx` - MFA onboarding
- `client/src/components/MFAChallenge.tsx` - Login MFA prompt
- `client/src/components/ReauthModal.tsx` - Step-up auth modal
- `client/src/pages/AccountSessions.tsx` - Active sessions page
- `client/src/pages/SecurityActivity.tsx` - Security log page
- `client/src/pages/MFASettings.tsx` - MFA management
- `client/src/pages/ApiKeys.tsx` - API key management

### Files to Modify

**Backend:**
- `shared/enhanced-auth-schema.ts` - Add new tables (auditLogs, apiKeys, devices, userPreferences)
- `server/auth/security.ts` - Integrate JWT session tracking
- `server/auth/role-manager.ts` - Add audit logging to role changes
- `server/routes/auth-routes.ts` - Return JWT tokens on login
- `server/middleware.ts` - Update to support JWT auth
- `server/routes.ts` - Add audit logging middleware
- `server/storage.ts` - Add methods for new tables

**Client:**
- `client/src/lib/auth.tsx` - Handle JWT tokens instead of cookies
- `client/src/components/Layout.tsx` - Add OrganizationSelector
- `client/src/pages/Login.tsx` - Add MFA challenge step
- `client/src/pages/Settings.tsx` - Add MFA and sessions sections

**Configuration:**
- `.env.example` - Add JWT secret, email service config
- `package.json` - Add dependencies (jsonwebtoken, nodemailer, etc.)

---

## Testing Strategy

### Unit Tests

**JWT Service:**
- `jwtService.generateAccessToken()` creates valid JWT
- `jwtService.generateRefreshToken()` creates unique tokens
- `jwtService.verifyAccessToken()` validates signature
- `jwtService.verifyAccessToken()` rejects expired tokens
- `jwtService.verifyAccessToken()` rejects tampered tokens

**Security Utilities:**
- `deviceFingerprint.generate()` creates consistent hashes
- `anomalyDetection.detectGeographic()` flags unusual locations
- `anomalyDetection.detectImpossibleTravel()` catches fast travel
- `auditLogger.log()` sanitizes sensitive data

**Permission Checking:**
- `hasPermission()` correctly checks role permissions
- `canManageRole()` enforces role hierarchy
- Role middleware blocks unauthorized users

### Integration Tests

**Authentication Flow:**
1. Login with valid credentials → returns access + refresh tokens
2. Use access token to access protected route → success
3. Use expired access token → 401 error
4. Refresh access token → new access token returned
5. Use refresh token twice → second attempt fails
6. Logout → both tokens invalidated

**MFA Flow:**
1. Enable MFA → secret and backup codes returned
2. Login without MFA token → MFA challenge triggered
3. Login with valid TOTP → success
4. Login with invalid TOTP → failure, attempt counted
5. Login with backup code → success, code removed from list
6. Use same backup code again → failure

**Session Management:**
1. Create session → appears in loginSessions table
2. List sessions → returns all active sessions
3. Revoke session → session marked as revoked
4. Use revoked session token → 401 error
5. Revoke all other sessions → only current session remains

**API Key Authentication:**
1. Create API key → key returned once
2. Use API key in X-API-Key header → authenticated
3. API key with insufficient scope → 403 error
4. Expired API key → 401 error
5. Revoked API key → 401 error

### Security Tests

**Token Tampering:**
- Modify JWT payload → signature verification fails
- Modify JWT signature → verification fails
- Use token from different user → authorization fails

**Session Hijacking:**
- Change IP address mid-session → warning logged
- Change device fingerprint → session flagged as suspicious
- Use stolen refresh token → original user notified

**CSRF Protection:**
- POST request without CSRF token → 403 error
- POST with invalid CSRF token → 403 error
- POST with valid CSRF token → success

**Rate Limiting:**
- 6 login attempts in 15 min → 429 error
- Token refresh 11 times in 1 min → 429 error
- API key exceeding quota → 429 error

**Account Lockout:**
- 5 failed login attempts → account locked
- Login during lockout period → locked error
- Login after lockout expires → success, attempts reset

### End-to-End Tests (Cypress/Playwright)

**User Onboarding:**
1. Register new account
2. Receive verification email
3. Click verification link
4. Setup MFA with QR code
5. Save backup codes
6. Login with MFA
7. Access dashboard

**Multi-Organization Workflow:**
1. Login as user in 2 organizations
2. Switch organization context
3. Verify data filtered to selected org
4. Switch to different org
5. Verify context changed correctly

**Session Management:**
1. Login from desktop browser
2. Login from mobile browser (different device)
3. View sessions page → both sessions listed
4. Revoke mobile session
5. Mobile browser → logged out
6. Desktop browser → still logged in

**Password Reset:**
1. Request password reset
2. Receive reset email
3. Click reset link
4. Enter new password
5. Verify all sessions revoked
6. Login with new password

### Load Testing (k6 or Artillery)

**Token Refresh Under Load:**
- Simulate 1000 concurrent users
- Each user refreshes token every 14 minutes
- Measure: latency, error rate, database connections

**Concurrent Sessions:**
- Simulate 10,000 active sessions
- Random API calls from each session
- Measure: loginSessions table query performance

**Database Query Performance:**
- Measure loginSessions lookups (should be <10ms)
- Measure auditLogs inserts (should not block requests)
- Measure securityEvents queries (paginated, <50ms)

---

## Monitoring & Observability

### Metrics to Track

**Authentication Metrics:**
- Active sessions count (gauge)
- Login attempts (counter: success, failure)
- Token refresh rate (counter)
- Session duration (histogram)
- MFA adoption rate (percentage)
- Email verification rate (percentage)

**Security Metrics:**
- Failed login attempts by IP (counter)
- Account lockouts (counter)
- Sessions revoked (counter: manual, automatic)
- Security events by type (counter)
- Anomaly detections (counter by type)
- Step-up auth challenges (counter: success, failure)

**API Key Metrics:**
- Active API keys (gauge)
- API key requests (counter)
- API key errors (counter)
- API key quota exceeded (counter)

**Performance Metrics:**
- JWT verification latency (histogram)
- Token refresh latency (histogram)
- Database query latency (histogram: loginSessions, auditLogs)
- Email sending latency (histogram)

### Alerts

**Critical:**
- **Spike in failed logins** - Potential brute force attack
  - Trigger: >100 failed logins from single IP in 5 min
  - Action: Temporary IP ban, alert security team

- **Mass session revocations** - Possible breach
  - Trigger: >50 sessions revoked in 1 min
  - Action: Alert security team, investigate

- **Email service down** - Users can't verify or reset
  - Trigger: Email send failure rate >50%
  - Action: Switch to backup provider, alert DevOps

**Warning:**
- **High anomaly detection rate** - Unusual activity
  - Trigger: >10 anomalies per hour
  - Action: Review security events, investigate patterns

- **JWT verification errors** - Possible attack or bug
  - Trigger: JWT verification failure rate >5%
  - Action: Check token generation, review logs

- **Database connection pool exhausted** - Performance issue
  - Trigger: All connections in use for >30 seconds
  - Action: Scale database, review slow queries

**Info:**
- **New device logins** - Normal user behavior
  - Trigger: New device fingerprint detected
  - Action: Send email to user

- **MFA disabled** - User security change
  - Trigger: User disables MFA
  - Action: Send confirmation email

### Logging

**What to Log:**
- All authentication events (success, failure)
- Token refresh operations
- Session creations and revocations
- Security anomalies detected
- Permission denied events
- Email sending (success, failure)
- API key usage

**Log Levels:**
- **ERROR** - Authentication failures, email failures, critical errors
- **WARN** - Anomalies, suspicious activity, rate limit hits
- **INFO** - Successful logins, token refreshes, session management
- **DEBUG** - JWT verification details, permission checks (dev only)

**Log Format (JSON):**
```json
{
  "timestamp": "2025-10-02T12:34:56.789Z",
  "level": "INFO",
  "service": "auth",
  "event": "login_success",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "deviceFingerprint": "a3b5c7d9e1f2",
  "mfaUsed": true
}
```

**Sensitive Data Sanitization:**
- Never log: passwords, tokens (JWT, refresh, API keys), MFA secrets
- Hash PII in logs: email (first 3 chars + hash), IP (hash)
- Log only token prefixes for debugging

**Log Retention:**
- ERROR/WARN: 90 days
- INFO: 30 days
- DEBUG: 7 days (dev environments only)
- Audit logs: Indefinite (compliance requirement)

---

## Risk Assessment & Mitigation

### High Risk

**Risk: JWT Secret Compromise**
- Impact: Attacker can forge tokens, impersonate users
- Mitigation:
  - Store JWT secret in secure vault (AWS Secrets Manager, HashiCorp Vault)
  - Rotate JWT secret quarterly
  - Use RS256 (asymmetric) instead of HS256
  - Monitor for unusual token patterns

**Risk: Refresh Token Theft**
- Impact: Attacker can maintain persistent access
- Mitigation:
  - Token rotation (one-time use)
  - Device fingerprinting
  - Anomaly detection
  - User can revoke all sessions

**Risk: Database Breach**
- Impact: loginSessions table exposed, sessions can be hijacked
- Mitigation:
  - Encrypt refresh_token_hash at rest
  - Database access logging
  - Limit database user permissions
  - Regular security audits

### Medium Risk

**Risk: Email Service Failure**
- Impact: Users can't verify emails or reset passwords
- Mitigation:
  - Multiple email providers (primary + backup)
  - Retry queue for failed emails
  - Manual verification by site admin
  - Email delivery monitoring

**Risk: MFA Backup Code Loss**
- Impact: User locked out of account
- Mitigation:
  - Site admin can disable MFA after identity verification
  - Alternative recovery method (SMS, email)
  - Clear warnings to save backup codes

**Risk: Rate Limit Bypass**
- Impact: Brute force attacks succeed
- Mitigation:
  - Multiple rate limit layers (IP, user, global)
  - CAPTCHA after multiple failures
  - Progressive delays
  - Temporary IP bans

### Low Risk

**Risk: Token Expiry Edge Cases**
- Impact: User sees auth errors
- Mitigation:
  - Automatic token refresh before expiry
  - Graceful error handling
  - Retry logic in frontend

**Risk: Clock Skew**
- Impact: JWT validation fails due to time mismatch
- Mitigation:
  - Allow 30-second clock skew tolerance
  - NTP sync on all servers
  - Monitor server time drift

---

## Success Metrics

### Technical Metrics

- **Uptime:** 99.9% authentication service availability
- **Performance:**
  - JWT verification: <10ms p95
  - Token refresh: <100ms p95
  - Login (without MFA): <500ms p95
- **Security:**
  - Zero successful brute force attacks
  - <0.1% false positive rate for anomaly detection
  - 100% of security events logged

### User Experience Metrics

- **MFA Adoption:** >80% of active users within 6 months
- **Email Verification:** >95% within 7 days of signup
- **Session Management:** >50% of users view sessions page
- **Organization Switching:** <2 seconds to switch context

### Business Metrics

- **API Key Adoption:** >20% of organizations use API keys
- **Support Tickets:** <5 auth-related tickets per 1000 users per month
- **User Satisfaction:** >4.5/5 rating for auth experience

---

## Rollback Plan

If critical issues arise during rollout:

### Immediate Rollback (Emergency)

1. **Disable JWT feature flag** - Revert all users to session auth
2. **Roll back deployment** - Deploy previous stable version
3. **Database rollback** - Restore loginSessions table if corrupted
4. **Communication** - Notify users of temporary auth issues

### Partial Rollback (Specific Issues)

1. **MFA Issues** - Disable MFA requirement, allow optional
2. **Email Service** - Disable email verification enforcement
3. **Token Refresh** - Increase refresh token expiry (reduce refresh frequency)
4. **API Keys** - Disable API key auth, fall back to user auth

### Post-Rollback

1. **Root cause analysis** - Identify what went wrong
2. **Fix in staging** - Reproduce and fix issue
3. **Enhanced testing** - Add tests to prevent regression
4. **Gradual re-rollout** - Start with 10% of users, monitor closely

---

## Documentation

### User Documentation

- **Getting Started Guide** - How to verify email, setup MFA
- **Multi-Organization Guide** - How to switch organizations
- **Session Management** - How to view and revoke sessions
- **API Key Setup** - How to create and use API keys
- **Security Best Practices** - Password tips, MFA benefits
- **FAQ** - Common auth questions

### Developer Documentation

- **API Reference** - All auth endpoints with examples
- **JWT Structure** - Payload format, expiry, refresh
- **Authentication Flow** - Diagrams and sequence charts
- **Error Handling** - Common errors and solutions
- **Rate Limits** - All rate limits documented
- **Migration Guide** - How to migrate from sessions to JWT

### Internal Documentation

- **Architecture Decision Records (ADRs)**
  - ADR-001: Why JWT over sessions
  - ADR-002: RS256 vs HS256 for JWT signing
  - ADR-003: Token refresh rotation strategy
  - ADR-004: MFA implementation approach
  - ADR-005: Anomaly detection algorithms

- **Runbooks**
  - Handling mass account lockouts
  - Rotating JWT secrets
  - Investigating security incidents
  - Email service failover procedure

---

## Next Steps

1. **Review this plan** - Gather feedback from team
2. **Prioritize phases** - Confirm implementation order
3. **Set up project tracking** - Create tickets for each task
4. **Provision infrastructure** - Email service, monitoring tools
5. **Create feature flags** - Set up flag management system
6. **Begin Phase 1** - Start with JWT infrastructure

**Estimated Total Duration:** 12-15 weeks for full implementation

**Team Requirements:**
- 2 Backend Engineers
- 1 Frontend Engineer
- 1 Mobile Engineer (starting Week 4)
- 1 DevOps Engineer (part-time)
- 1 Security Reviewer (part-time)

---

**Document Status:** Draft for Review
**Last Updated:** 2025-10-02
**Author:** Claude Code Assistant
**Reviewers:** [To be assigned]
