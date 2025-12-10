# OAuth Authentication - Implementation Guide

## Overview

AthleteMetrics now supports **Google and Apple OAuth authentication** as an alternative login method for athletes. Username/password login remains the **primary authentication method**, with OAuth buttons offered as a convenience option.

**Implementation Date**: January 2025
**Version**: 1.0
**Status**: ✅ Production Ready

---

## Table of Contents

1. [What Has Been Implemented](#what-has-been-implemented)
2. [Architecture Overview](#architecture-overview)
3. [User Flows](#user-flows)
4. [Setup Guide](#setup-guide)
5. [Security Features](#security-features)
6. [API Endpoints](#api-endpoints)
7. [Database Schema](#database-schema)
8. [Testing](#testing)
9. [Future Enhancements](#future-enhancements)
10. [Troubleshooting](#troubleshooting)

---

## What Has Been Implemented

### ✅ Core Features (Phase 1 - Complete)

#### Backend
- **Passport.js Integration**: Google OAuth 2.0 and Apple Sign In strategies
- **OAuth Service**: Handles authentication, account creation, and account linking
- **Account Linking**: Email-based verification when OAuth email matches existing account
- **Secure Token System**: 1-hour expiring tokens for account linking
- **Rate Limiting**: 10 OAuth attempts per 15 minutes per IP
- **Storage Layer**: OAuth-specific query methods (getUserByGoogleId, getUserByAppleId, etc.)
- **Email Notifications**: Professional HTML templates for account linking confirmation

#### Frontend
- **OAuth Buttons**: Google and Apple sign-in buttons on login page
- **Error Handling**: User-friendly messages for OAuth failures
- **Success Messages**: Confirmation for account linking and OAuth login
- **Responsive Design**: Mobile-friendly OAuth button layout

#### Database
- **OAuth Fields**: googleId, appleId, oauthProvider, oauthEmail, oauthEmailVerified, lastAuthMethod, accountLinkedAt
- **Nullable Password**: Supports OAuth-only users (password = NULL)
- **Account Linking Tokens Table**: Secure token storage for email verification
- **Migration 0022**: SQL migration for OAuth support

#### Security
- **CSRF Protection**: Passport.js state parameter
- **Email Verification**: Prevents account takeover via email confirmation
- **Token Expiry**: 1-hour window for account linking
- **Rate Limiting**: Prevents brute force OAuth attempts
- **URL Sanitization**: XSS prevention in email templates
- **Session-Based Auth**: No access/refresh token storage

### ❌ Not Yet Implemented (Future Enhancements)

- **Organization Join Codes**: Self-service org joining (currently invitation-only)
- **Account Settings UI**: Add/remove OAuth providers after signup
- **OAuth Provider Management**: Disconnect Google/Apple while keeping account
- **Additional Providers**: Microsoft, Facebook, Twitter OAuth
- **Mobile Deep Linking**: OAuth callback deep links for mobile apps
- **SAML Integration**: Enterprise SSO for organizations

---

## Architecture Overview

### Technology Stack

- **Backend**: Passport.js with Express.js
- **OAuth Strategies**:
  - `passport-google-oauth20` for Google OAuth 2.0
  - `passport-apple` for Apple Sign In
- **Session Management**: express-session with PostgreSQL backend
- **Database**: PostgreSQL with Drizzle ORM
- **Email**: SendGrid for account linking notifications

### Component Diagram

```
┌─────────────────────────────────────────────┐
│              Login Page (/login)            │
│  ┌───────────────────────────────────────┐ │
│  │ Email or Username: [____________]     │ │
│  │ Password: [____________] 👁️           │ │
│  │ [Login Button]                        │ │
│  │                                       │ │
│  │ ──────── Or continue with ──────────  │ │
│  │                                       │ │
│  │ [🔵 Continue with Google]             │ │
│  │ [🍎 Continue with Apple]              │ │
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  OAuth Provider         │
        │  (Google or Apple)      │
        └────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  /api/auth/{provider}/ │
        │  callback               │
        └────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  OAuth Service         │
        │  - Check existing user │
        │  - Create or link      │
        └────────────────────────┘
                     │
        ┌────────────┴───────────┐
        │                        │
        ▼                        ▼
  New User                 Existing Email?
  Create Account           Send Link Email
        │                        │
        │                        ▼
        │              User Clicks Email Link
        │                        │
        │                        ▼
        │              Link Accounts (Hybrid)
        │                        │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  Establish Session     │
        │  Redirect to Dashboard │
        └────────────────────────┘
```

### File Structure

```
packages/
├── api/
│   ├── auth/
│   │   └── passport-config.ts          # Passport strategies
│   ├── routes/
│   │   └── oauth-routes.ts             # OAuth endpoints
│   ├── services/
│   │   ├── oauth-service.ts            # OAuth logic
│   │   ├── auth-service.ts             # Updated for OAuth-only users
│   │   └── email-service.ts            # Account linking emails
│   ├── storage.ts                      # OAuth query methods
│   └── routes.ts                       # Passport initialization
├── web/
│   └── src/
│       └── components/
│           └── auth/
│               ├── oauth-buttons.tsx        # OAuth UI components
│               └── enhanced-login-form.tsx  # Updated with OAuth
└── shared/
    ├── schema.ts                       # OAuth database schema
    └── migrations/
        └── 0022_add_oauth_support.sql  # Database migration

tests/
└── e2e/
    └── oauth-authentication.spec.ts    # E2E test coverage
```

---

## User Flows

### Flow 1: New OAuth User (No Existing Account)

**Scenario**: Athlete signs up for the first time using Google OAuth

1. **Athlete visits** `/login` page
   - Sees "Continue with Google" and "Continue with Apple" buttons below traditional login

2. **Athlete clicks** "Continue with Google"
   - Redirected to `accounts.google.com`
   - Google shows account picker (select or add account)

3. **Athlete selects** Google account and grants permissions
   - Permissions requested: Email, Profile (name)
   - Google redirects back to `/api/auth/google/callback`

4. **Backend processes** OAuth response
   - Checks: Does user exist with this Google ID? **NO**
   - Checks: Does user exist with this email? **NO**
   - Creates new user account as "independent athlete":
     - `googleId`: "google_oauth_id_12345"
     - `email`: "athlete@gmail.com"
     - `firstName`: "John"
     - `lastName`: "Smith"
     - `username`: "athlete" (auto-generated from email)
     - `password`: **NULL** (OAuth-only account)
     - `oauthProvider`: "google"
     - `isEmailVerified`: true (Google emails are pre-verified)
     - `role`: "athlete" (no organization membership yet)

5. **Backend establishes session**
   - Session contains: userId, role="athlete", organizationId=undefined
   - Redirects to `/my-dashboard` (athlete dashboard)

6. **Athlete sees dashboard**
   - Welcome message
   - Prompt to join organization via email invitation

**Total Time**: ~10-15 seconds

---

### Flow 2: Existing User Links OAuth Account

**Scenario**: Athlete with email+password account wants to enable Google login

1. **Athlete previously created** account with email+password
   - `username`: "athlete"
   - `email`: "athlete@gmail.com"
   - `password`: "hashed_bcrypt_password"

2. **Athlete visits** `/login`, clicks "Continue with Google"
   - Redirected to Google OAuth
   - Selects Google account: "athlete@gmail.com"

3. **Backend processes** OAuth response
   - Checks: Does user exist with this Google ID? **NO**
   - Checks: Does user exist with this email "athlete@gmail.com"? **YES!**
   - **SECURITY CHECK**: Don't auto-link (could be account takeover)

4. **Backend creates** account linking token
   - Generates secure token: "a1b2c3d4e5f6..."
   - Stores in `account_linking_tokens` table
   - Expires in 1 hour

5. **Backend sends** confirmation email to "athlete@gmail.com"
   ```
   Subject: Confirm Google Account Linking

   Hi John,
   Someone tried to sign in to your AthleteMetrics account using Google.

   To link your Google account and enable social sign-in, please click:
   [Confirm Account Linking]

   This link expires in 1 hour.
   ```

6. **Athlete opens email**, clicks "Confirm Account Linking"
   - Opens: `/api/auth/link-account/a1b2c3d4e5f6...`
   - Backend validates token (not expired, not used)
   - Updates user account:
     - `googleId`: "google_oauth_id_12345" (ADDED)
     - `oauthProvider`: "google" (ADDED)
     - `accountLinkedAt`: "2025-01-15 10:30:00" (ADDED)
     - `password`: "hashed_bcrypt_password" (KEPT - hybrid account)

7. **Browser redirects** to `/login` with success message:
   - "Your accounts have been successfully linked! Please log in."

8. **Athlete can now login** EITHER way:
   - ✅ "Continue with Google" → instant login
   - ✅ Email + password → traditional login

**Total Time**: ~1-2 minutes (depends on email delivery)

---

### Flow 3: Returning OAuth User

**Scenario**: Athlete returns to login with existing OAuth account

1. **Athlete visits** `/login` page
   - Already has Google OAuth linked from previous signup

2. **Athlete clicks** "Continue with Google"
   - Redirected to Google OAuth
   - Google remembers this athlete → auto-selects account (fast!)

3. **Backend processes** OAuth response
   - Checks: Does user exist with Google ID "google_oauth_id_12345"? **YES!**
   - Loads user: `{ id: "user123", googleId: "google_...", email: "..." }`

4. **Backend establishes session**
   - Updates `lastLoginAt` timestamp
   - Updates `lastAuthMethod`: "google"
   - Redirects to `/my-dashboard`

5. **Athlete is logged in** within seconds! 🚀

**Total Time**: ~3-5 seconds (Google often auto-selects account)

---

### Flow 4: OAuth-Only User Tries Password Login

**Scenario**: OAuth user forgets they signed up with Google and tries password

1. **User created** account via Google OAuth (password = NULL)

2. **User visits** `/login`, enters username + password

3. **Auth service detects** OAuth-only account:
   ```typescript
   if (!user.password) {
     return {
       success: false,
       error: "This account was created with social login (Google/Apple).
               Please use the social login buttons below."
     };
   }
   ```

4. **User sees** helpful error message
   - Redirected to use OAuth buttons
   - Clear guidance on which provider to use

---

## Setup Guide

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database
- SendGrid API key (for email notifications)
- Google OAuth credentials (Google Cloud Console)
- Apple OAuth credentials (Apple Developer Portal)

### Step 1: Configure Google OAuth

1. **Visit** [Google Cloud Console](https://console.cloud.google.com/)

2. **Create** new project or select existing

3. **Enable** Google+ API
   - Navigate to APIs & Services → Library
   - Search for "Google+ API"
   - Click Enable

4. **Create** OAuth 2.0 Client ID
   - Navigate to Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorized redirect URIs:
     - Development: `http://localhost:5000/api/auth/google/callback`
     - Production: `https://yourdomain.com/api/auth/google/callback`

5. **Copy** Client ID and Client Secret

### Step 2: Configure Apple Sign In

1. **Visit** [Apple Developer Console](https://developer.apple.com/)

2. **Navigate** to Certificates, Identifiers & Profiles → Identifiers

3. **Create** new identifier (Services ID)
   - Description: "AthleteMetrics Web"
   - Identifier: `com.yourcompany.athletemetrics.service`

4. **Enable** "Sign in with Apple"
   - Click Configure
   - Primary App ID: (select your iOS app if you have one, or create one)

5. **Configure** domains and redirect URLs:
   - Domains: `yourdomain.com`
   - Return URLs: `https://yourdomain.com/api/auth/apple/callback`

6. **Create** Key for Sign in with Apple
   - Navigate to Keys → Create a key
   - Enable "Sign in with Apple"
   - Download `.p8` private key file (save securely!)

7. **Note** the following:
   - Team ID (found in membership details)
   - Key ID (from the key you created)
   - Client ID (Services ID identifier)
   - Private key file path

### Step 3: Environment Configuration

1. **Copy** `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. **Add** OAuth credentials to `.env.local`:
   ```bash
   # OAuth Configuration
   GOOGLE_OAUTH_CLIENT_ID="123456789-abc123def456.apps.googleusercontent.com"
   GOOGLE_OAUTH_CLIENT_SECRET="GOCSPX-abc123def456ghi789"

   APPLE_OAUTH_CLIENT_ID="com.yourcompany.athletemetrics.service"
   APPLE_OAUTH_TEAM_ID="ABC123DEF4"
   APPLE_OAUTH_KEY_ID="XYZ987WVU6"
   APPLE_OAUTH_PRIVATE_KEY_PATH="./config/AuthKey_XYZ987WVU6.p8"

   # Required for OAuth callbacks
   APP_URL="http://localhost:5000"  # Development
   # APP_URL="https://yourdomain.com"  # Production
   ```

3. **Place** Apple private key file:
   ```bash
   mkdir -p config
   mv ~/Downloads/AuthKey_XYZ987WVU6.p8 config/
   chmod 600 config/AuthKey_XYZ987WVU6.p8
   ```

### Step 4: Run Database Migration

```bash
# Apply OAuth database migration
npm run db:migrate:manual
```

This creates:
- OAuth fields on `users` table
- `account_linking_tokens` table
- Indexes for OAuth lookups

### Step 5: Start Development Server

```bash
npm run dev
```

Server starts at `http://localhost:5000`

### Step 6: Test OAuth Flow

1. **Visit** `http://localhost:5000/login`

2. **Verify** OAuth buttons appear below traditional login form

3. **Click** "Continue with Google"
   - Should redirect to Google OAuth consent screen
   - Grant permissions
   - Should redirect back to `/my-dashboard`

4. **Check** session is established:
   - Visit `/api/auth/me`
   - Should return user object with OAuth data

---

## Security Features

### 1. Email-Based Account Linking

**Threat**: Account takeover via email matching

**Mitigation**: When OAuth email matches existing account, send confirmation email with expiring token

**Flow**:
```
OAuth email matches existing → Create token → Send email → User clicks link → Accounts linked
```

**Token Properties**:
- Cryptographically random (32 bytes hex)
- Expires in 1 hour
- Single-use (marked as used after confirmation)
- Tracked in database with audit trail

### 2. Rate Limiting

**Threat**: Brute force OAuth attempts

**Mitigation**: 10 OAuth requests per 15 minutes per IP

**Implementation**:
```typescript
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  limit: 10,
  message: { message: "Too many OAuth attempts, please try again later." },
});
```

### 3. CSRF Protection

**Threat**: Cross-site request forgery during OAuth flow

**Mitigation**: Passport.js automatically includes `state` parameter

**How it works**:
1. Generate random state value before redirect
2. Store in session
3. Verify state matches on callback
4. Reject if state is missing or mismatched

### 4. URL Sanitization

**Threat**: XSS attacks via malicious URLs in emails

**Mitigation**: `sanitizeUrl()` function in email service

**Validation**:
- Only allows `http:`, `https:`, `mailto:` protocols
- Blocks `javascript:`, `data:`, `file:` protocols
- Escapes HTML in email templates

### 5. Session-Based Authentication

**Threat**: Token theft, replay attacks

**Mitigation**: No OAuth access/refresh tokens stored

**Design**:
- OAuth used ONLY for initial authentication
- Session ID stored in httpOnly cookie
- Session data in PostgreSQL (not localStorage)
- Automatic session expiry

### 6. Fail-Closed Error Handling

**Principle**: Errors default to access denial

**Examples**:
```typescript
// Storage error during account linking
catch (error) {
  return { success: false, error: "Failed to link accounts" };
}

// Invalid token
if (!linkingToken) {
  return { success: false, error: "Invalid or expired linking token" };
}
```

---

## API Endpoints

### OAuth Initiation

#### `GET /api/auth/google`
Initiates Google OAuth flow

**Rate Limit**: 10 requests per 15 minutes

**Response**: Redirect to `accounts.google.com`

**Query Parameters**: None

**Example**:
```javascript
window.location.href = '/api/auth/google';
```

---

#### `GET /api/auth/apple`
Initiates Apple Sign In flow

**Rate Limit**: 10 requests per 15 minutes

**Response**: Redirect to `appleid.apple.com`

**Query Parameters**: None

**Example**:
```javascript
window.location.href = '/api/auth/apple';
```

---

### OAuth Callbacks

#### `GET /api/auth/google/callback`
Handles Google OAuth callback

**Query Parameters**:
- `code`: Authorization code from Google
- `state`: CSRF protection token

**Success Response**: Redirect to dashboard with session established

**Error Responses**:
- `307 /login?error=oauth_failed` - OAuth authentication failed
- `307 /login?message=linking_email_sent` - Account linking email sent

---

#### `POST /api/auth/apple/callback`
Handles Apple Sign In callback

**Body Parameters**:
- `code`: Authorization code from Apple
- `state`: CSRF protection token
- `user`: User info (first time only)

**Success Response**: Redirect to dashboard with session established

**Error Responses**:
- `307 /login?error=oauth_failed` - OAuth authentication failed
- `307 /login?message=linking_email_sent` - Account linking email sent

---

### Account Linking

#### `GET /api/auth/link-account/:token`
Confirms OAuth account linking via email token

**Parameters**:
- `token`: Account linking verification token (from email)

**Success Response**:
```
307 /login?message=account_linked
```

**Error Responses**:
- `307 /login?error=linking_failed` - Generic failure
- `307 /login?error=Invalid+or+expired+linking+token` - Bad token
- `307 /login?error=This+linking+token+has+already+been+used` - Token reuse
- `307 /login?error=This+linking+token+has+expired` - Token expired

---

## Database Schema

### Users Table (Modified)

```sql
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- OAuth provider fields
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN apple_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN oauth_provider TEXT
  CHECK (oauth_provider IN ('google', 'apple', 'password'));
ALTER TABLE users ADD COLUMN oauth_email TEXT;
ALTER TABLE users ADD COLUMN oauth_email_verified BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE users ADD COLUMN last_auth_method TEXT
  CHECK (last_auth_method IN ('password', 'google', 'apple'));
ALTER TABLE users ADD COLUMN account_linked_at TIMESTAMP;

-- Indexes for OAuth lookups
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;
```

### Account Linking Tokens Table (New)

```sql
CREATE TABLE account_linking_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_id TEXT NOT NULL,
  provider_email TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_account_linking_tokens_token ON account_linking_tokens(token);
CREATE INDEX idx_account_linking_tokens_user_id ON account_linking_tokens(user_id);
```

### User Types

**OAuth-Only User** (password = NULL):
```json
{
  "id": "user_123",
  "username": "athlete",
  "emails": ["athlete@gmail.com"],
  "password": null,
  "googleId": "google_oauth_12345",
  "oauthProvider": "google",
  "oauthEmail": "athlete@gmail.com",
  "oauthEmailVerified": true,
  "lastAuthMethod": "google",
  "accountLinkedAt": "2025-01-15T10:30:00Z"
}
```

**Hybrid User** (password + OAuth):
```json
{
  "id": "user_456",
  "username": "athlete2",
  "emails": ["athlete2@icloud.com"],
  "password": "$2b$10$abc123...",
  "appleId": "apple_oauth_67890",
  "oauthProvider": "apple",
  "oauthEmail": "athlete2@icloud.com",
  "oauthEmailVerified": true,
  "lastAuthMethod": "apple",
  "accountLinkedAt": "2025-01-15T14:45:00Z"
}
```

**Traditional User** (password only):
```json
{
  "id": "user_789",
  "username": "coach",
  "emails": ["coach@example.com"],
  "password": "$2b$10$xyz789...",
  "googleId": null,
  "appleId": null,
  "oauthProvider": null,
  "lastAuthMethod": "password"
}
```

---

## Testing

### E2E Tests

**File**: `tests/e2e/oauth-authentication.spec.ts`

**Test Coverage**:
- ✅ OAuth buttons display on login page
- ✅ OAuth buttons positioned below traditional login form
- ✅ Divider with "Or continue with" text
- ✅ Google OAuth button redirects to `/api/auth/google`
- ✅ Apple OAuth button redirects to `/api/auth/apple`
- ✅ OAuth error handling (URL params)
- ✅ OAuth success messages (URL params)
- ✅ OAuth-only user login attempt handling

**Run Tests**:
```bash
# Against staging environment
npx playwright test tests/e2e/oauth-authentication.spec.ts --config=playwright.staging.config.ts

# Against testing environment
npx playwright test tests/e2e/oauth-authentication.spec.ts --config=playwright.testing.config.ts
```

### Manual Testing Checklist

#### New OAuth User
- [ ] Visit `/login`
- [ ] Click "Continue with Google"
- [ ] Complete Google OAuth flow
- [ ] Verify redirect to `/my-dashboard`
- [ ] Verify session established (`/api/auth/me`)
- [ ] Logout and login again with Google
- [ ] Verify instant login

#### Account Linking
- [ ] Create user with email+password
- [ ] Try to login with Google using same email
- [ ] Verify email sent with linking confirmation
- [ ] Click link in email
- [ ] Verify accounts linked successfully
- [ ] Login with Google → successful
- [ ] Login with password → still works

#### OAuth-Only User Error
- [ ] Create user via Google OAuth
- [ ] Logout
- [ ] Try to login with username+password
- [ ] Verify error message about social login

#### Security
- [ ] Rapid OAuth attempts → rate limited after 10
- [ ] Try to reuse account linking token → error
- [ ] Wait for token to expire (1 hour) → error
- [ ] Invalid token → error message

---

## Future Enhancements

### Phase 2: Organization Join Codes

**Feature**: Self-service organization joining via join codes

**Current**: Athletes must receive email invitation from coach

**Proposed**:
```typescript
// Database schema
ALTER TABLE organizations ADD COLUMN join_code TEXT UNIQUE;
ALTER TABLE organizations ADD COLUMN join_code_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN join_code_expires_at TIMESTAMP;

// API endpoint
POST /api/join-organization
Body: { code: "SOCCER2025" }

// UI component
<JoinOrganizationCard>
  <Input placeholder="Enter join code (e.g., SOCCER2025)" />
  <Button>Join</Button>
</JoinOrganizationCard>
```

**Benefits**:
- Faster onboarding for large teams
- Reduces coach workload
- Athletes can join without waiting for email

**Security Considerations**:
- Code should be 8-character alphanumeric
- Optional expiry date
- Revocable by org admin
- Rate limit: 5 join attempts per 15 minutes

---

### Phase 3: Account Settings Page

**Feature**: Manage OAuth providers from account settings

**Proposed UI**:
```
Account Settings → Connected Accounts
┌────────────────────────────────────┐
│ Google                             │
│ Connected: athlete@gmail.com       │
│ [Disconnect]                       │
├────────────────────────────────────┤
│ Apple                              │
│ Not connected                      │
│ [Connect Apple Account]            │
├────────────────────────────────────┤
│ Password                           │
│ Last changed: 2 weeks ago          │
│ [Change Password]                  │
└────────────────────────────────────┘
```

**Features**:
- Add OAuth to existing password account
- Remove OAuth provider (requires password or another OAuth)
- View which providers are connected
- See last auth method used

---

### Phase 4: Additional OAuth Providers

**Providers to Consider**:
- Microsoft (Azure AD) - for enterprise teams
- Facebook - for consumer athletes
- Twitter - for athlete profiles
- GitHub - for developer/tech teams

**Implementation**: Follow same pattern as Google/Apple

---

### Phase 5: Mobile Deep Linking

**Feature**: OAuth callback deep links for mobile apps

**Challenge**: Mobile apps need to handle OAuth redirects

**Solution**:
```javascript
// Custom URL scheme for mobile app
APPLE_OAUTH_CALLBACK_URL="athletemetrics://oauth/apple/callback"
GOOGLE_OAUTH_CALLBACK_URL="athletemetrics://oauth/google/callback"
```

**Flow**:
1. Mobile app opens OAuth URL in system browser
2. User completes OAuth
3. Provider redirects to custom scheme
4. Mobile OS opens app
5. App handles callback and establishes session

---

### Phase 6: Enterprise SSO (SAML)

**Feature**: SAML 2.0 integration for enterprise customers

**Use Case**: Universities/colleges with existing identity providers

**Providers**:
- Okta
- Azure AD SAML
- Google Workspace SAML
- OneLogin

**Implementation**:
```typescript
// Per-organization SAML configuration
interface SAMLConfig {
  organizationId: string;
  entityId: string;
  ssoUrl: string;
  certificate: string;
  enabled: boolean;
}
```

---

### Phase 7: OAuth Refresh Token Support

**Feature**: Long-lived sessions via OAuth refresh tokens

**Current**: Session-based auth (expires with session)

**Proposed**: Store OAuth refresh tokens to extend sessions

**Benefits**:
- Longer session duration
- Automatic token refresh
- Better mobile app experience

**Security Considerations**:
- Encrypt refresh tokens at rest
- Rotate tokens periodically
- Revoke on logout/suspicious activity

---

## Troubleshooting

### Problem: "Too many OAuth attempts"

**Cause**: Rate limiting triggered (10 attempts per 15 minutes)

**Solution**: Wait 15 minutes or bypass for development:
```bash
# In .env.local (development only!)
BYPASS_GENERAL_RATE_LIMIT=true
```

**Note**: Rate limit bypass is automatically disabled in production

---

### Problem: Google OAuth redirects to wrong URL

**Cause**: Redirect URI mismatch in Google Cloud Console

**Solution**:
1. Check `APP_URL` in `.env.local`
2. Verify authorized redirect URIs in Google Cloud Console
3. Ensure exact match: `http://localhost:5000/api/auth/google/callback`

---

### Problem: Apple Sign In shows "invalid_client"

**Cause**: Incorrect Apple OAuth credentials

**Solution**:
1. Verify `APPLE_OAUTH_CLIENT_ID` matches Services ID
2. Check `APPLE_OAUTH_TEAM_ID` is correct
3. Ensure `APPLE_OAUTH_KEY_ID` matches created key
4. Verify private key file exists and path is correct
5. Check redirect URL is configured in Apple Developer Console

---

### Problem: Account linking email not received

**Cause**: SendGrid not configured or email delivery issue

**Solution**:
1. Check `SENDGRID_API_KEY` is set
2. Verify `SENDGRID_FROM_EMAIL` and `SENDGRID_FROM_NAME`
3. Check SendGrid dashboard for email logs
4. Look for email in spam folder
5. Check server logs for email errors

---

### Problem: "Invalid or expired linking token"

**Cause**: Token expired (1 hour limit) or already used

**Solution**:
1. Try OAuth login again to generate new token
2. Check email for most recent linking email
3. Tokens are single-use - don't click link multiple times

---

### Problem: Session not established after OAuth

**Cause**: Session middleware not configured or database connection issue

**Solution**:
1. Verify `SESSION_SECRET` is set
2. Check database connection
3. Ensure Passport is initialized in `routes.ts`:
   ```typescript
   app.use(passport.initialize());
   app.use(passport.session());
   ```
4. Check server logs for session errors

---

### Problem: OAuth-only user can't login with password

**Expected Behavior**: This is by design

**Explanation**: OAuth-only users have `password = NULL`

**Solution**: Use OAuth login button instead of username/password

**Add Password Later**: (Future feature) Add password in Account Settings

---

## Support

For questions or issues:
1. Check this documentation
2. Review implementation plan: `/home/hulla/.claude/plans/zany-stirring-avalanche.md`
3. Check E2E tests: `tests/e2e/oauth-authentication.spec.ts`
4. Review code comments in OAuth service files

---

## Changelog

### v1.0.0 - January 2025
- ✅ Initial OAuth implementation
- ✅ Google OAuth 2.0 support
- ✅ Apple Sign In support
- ✅ Email-based account linking
- ✅ Rate limiting
- ✅ E2E test coverage
- ✅ Security features (CSRF, token expiry, URL sanitization)
