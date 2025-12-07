# OAuth Account Linking E2E Tests

## Test File Location
`/home/hulla/devel/AthleteMetrics/tests/e2e/oauth-account-linking.spec.ts`

## Implementation Status Summary

### ✅ WORKING (Backend + Tests Passing)
- Email confirmation flow for account linking
- Linking email sent message display
- Account linked success message display
- Linking token validation (expiry, one-time use)
- Security: Authentication required for linking endpoints

### ❌ NOT YET IMPLEMENTED (Tests Skipped)
- Link Google/Apple Account buttons in account settings UI
- View linked OAuth accounts UI
- Unlink OAuth account endpoint (`POST /api/auth/unlink/:provider`)
- Prevent unlinking last authentication method validation
- Display all authentication methods UI
- Add password backup for OAuth-only users
- Last used authentication method indicator

## Test Categories

### 1. OAuth Account Linking - Account Settings UI (6 tests - ALL SKIPPED)
- Display link buttons for Google/Apple
- Initiate linking flow when clicking buttons
- Show OAuth provider icons

**Why skipped:** Account settings page doesn't have OAuth linking UI yet.

### 2. OAuth Account Linking - Email Confirmation Flow (4 tests - ALL PASSING)
- Email sent message display
- Token confirmation redirect handling
- Success message after linking confirmation
- Expired/invalid token error handling

**Status:** Backend implemented, tests verify URL params and messages.

### 3. OAuth Account Unlinking (7 tests - ALL SKIPPED)
- Display linked OAuth accounts
- Unlink Google/Apple when password backup exists
- Prevent unlinking last authentication method
- Display multiple auth methods
- Error handling for unlink failures

**Why skipped:** Unlinking endpoint and UI not implemented.

### 4. OAuth Account Linking - Security (3 tests - ALL PASSING)
- Authentication required for linking endpoints
- One-time token usage validation
- Token expiration validation

**Status:** Backend security implemented, tests verify redirects and errors.

### 5. OAuth Account Linking - User Experience (3 tests - ALL SKIPPED)
- Show linking benefits before linking
- Last auth method indicator
- Add password backup flow for OAuth-only users

**Why skipped:** UX features not implemented.

## Test Statistics
- **Total test scenarios:** 24
- **Currently passing:** 7 (backend email confirmation + security)
- **Skipped (awaiting UI):** 17

## Next Steps to Complete OAuth Linking

### 1. UI Implementation Required

Add to `/packages/web/src/pages/my-profile.tsx`:

```tsx
// Connected Accounts Section
<Card>
  <CardHeader>
    <CardTitle>Connected Accounts</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Show linked Google account */}
    {user?.googleId && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GoogleIcon />
          <span>Google Account Connected</span>
        </div>
        <Button
          variant="outline"
          onClick={() => unlinkOAuth('google')}
          disabled={isOnlyAuthMethod}
        >
          Unlink
        </Button>
      </div>
    )}

    {/* Show link button if not connected */}
    {!user?.googleId && (
      <Button onClick={() => linkOAuth('google')}>
        Link Google Account
      </Button>
    )}

    {/* Same for Apple */}
  </CardContent>
</Card>
```

### 2. Backend API Endpoints Needed

#### POST /api/auth/unlink/:provider
```typescript
// packages/api/routes/oauth-routes.ts
app.post('/api/auth/unlink/:provider', requireAuth, async (req, res) => {
  const { provider } = req.params;
  const userId = req.session.user!.id;

  // Validate user has alternative auth method
  const user = await storage.getUser(userId);

  if (!hasAlternativeAuthMethod(user, provider)) {
    return res.status(400).json({
      message: 'Cannot unlink your only authentication method. Add a password first.'
    });
  }

  // Unlink OAuth account
  await oauthService.unlinkOAuthAccount(userId, provider);

  res.json({ message: 'OAuth account unlinked successfully' });
});
```

#### GET /api/auth/linked-accounts
```typescript
app.get('/api/auth/linked-accounts', requireAuth, async (req, res) => {
  const userId = req.session.user!.id;
  const user = await storage.getUser(userId);

  res.json({
    hasPassword: !!user.password,
    googleLinked: !!user.googleId,
    appleLinked: !!user.appleId,
    lastAuthMethod: user.lastAuthMethod,
  });
});
```

### 3. OAuthService Methods Needed

Add to `/packages/api/services/oauth-service.ts`:

```typescript
async unlinkOAuthAccount(userId: string, provider: 'google' | 'apple') {
  const updates: any = {
    oauthProvider: null,
    oauthEmail: null,
    oauthEmailVerified: null,
  };

  if (provider === 'google') {
    updates.googleId = null;
  } else if (provider === 'apple') {
    updates.appleId = null;
  }

  await this.storage.updateUser(userId, updates);

  // Audit log
  await this.storage.createAuditLog({
    userId,
    action: 'oauth_unlink',
    resourceType: 'user',
    resourceId: userId,
    metadata: { provider },
  });
}

hasAlternativeAuthMethod(user: User, providerToUnlink: string): boolean {
  const authMethods = [
    user.password ? 'password' : null,
    user.googleId ? 'google' : null,
    user.appleId ? 'apple' : null,
  ].filter(Boolean);

  // User must have at least 2 auth methods to unlink one
  return authMethods.length > 1;
}
```

### 4. Database Schema (Already Complete)
```typescript
// packages/shared/schema.ts - Already has these fields
googleId: text('google_id'),
appleId: text('apple_id'),
oauthProvider: text('oauth_provider'),
oauthEmail: text('oauth_email'),
lastAuthMethod: text('last_auth_method'),
```

### 5. Remove .skip from Tests

Once features are implemented:

1. Remove `test.skip(` and change to `test(`
2. Run tests: `npm run test:staging tests/e2e/oauth-account-linking.spec.ts`
3. Verify all 24 tests pass

### 6. Security Enhancements

Before production:

```typescript
// Rate limit unlink endpoint
const unlinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5, // Max 5 unlinks per hour
  message: { message: "Too many unlink attempts" }
});

app.post('/api/auth/unlink/:provider', unlinkLimiter, requireAuth, ...);

// Email notification when OAuth unlinked
await emailService.sendOAuthUnlinkNotification(
  user.emails[0],
  user.firstName,
  provider
);

// Audit logging (already in unlinkOAuthAccount method above)
```

## Running the Tests

### Run all OAuth linking tests
```bash
npm run test:staging tests/e2e/oauth-account-linking.spec.ts
```

### Run all OAuth tests (authentication + linking)
```bash
npm run test:staging tests/e2e/oauth-*.spec.ts
```

### Run with Playwright UI for debugging
```bash
npx playwright test tests/e2e/oauth-account-linking.spec.ts \
  --config=playwright.staging.config.ts --ui
```

### Run only non-skipped tests
```bash
npx playwright test tests/e2e/oauth-account-linking.spec.ts \
  --config=playwright.staging.config.ts --grep-invert "skip"
```

## Current Test Output

Most tests are skipped because UI features don't exist yet.

**Expected output:**
- ✅ Email confirmation flow tests: 4 passing
- ✅ Security tests: 3 passing
- ⏭️  UI/UX/Unlinking tests: 17 skipped

**Total:** 7 passing, 17 skipped

## Test Maintenance

### When to Update Tests

1. **After implementing linking UI** - Remove .skip from "Account Settings UI" tests
2. **After implementing unlink endpoint** - Remove .skip from "Unlinking" tests
3. **After implementing password backup** - Remove .skip from "User Experience" tests
4. **After adding last auth indicator** - Remove .skip from related UX test

### Test Data Requirements

For full test coverage, you need:

1. **Regular athlete user** (password-based) - Already in test fixtures
2. **OAuth-only user** (no password, only Google) - Create manually or via seed script
3. **Hybrid user** (password + Google + Apple) - Create manually for comprehensive tests

### Adding New OAuth Providers

If adding GitHub, Microsoft, etc.:

1. Add test for new provider in each test category
2. Update `oauth-authentication.spec.ts` for login flow
3. Update this file for linking/unlinking
4. Add provider-specific UI components

## Related Files

- **OAuth Routes:** `/packages/api/routes/oauth-routes.ts`
- **OAuth Service:** `/packages/api/services/oauth-service.ts`
- **Login Page:** `/packages/web/src/pages/login.tsx`
- **My Profile Page:** `/packages/web/src/pages/my-profile.tsx`
- **Auth Helpers:** `/tests/e2e/helpers/auth.ts`
- **OAuth Auth Tests:** `/tests/e2e/oauth-authentication.spec.ts`

## Documentation

For OAuth implementation details, see:
- `/docs/OAUTH_AUTHENTICATION.md` - OAuth setup guide and flows
- `/CLAUDE.md` - Agent usage for security and auth tasks

## Success Criteria

OAuth account linking is complete when:

1. ✅ All 24 tests pass (none skipped)
2. ✅ Users can link Google/Apple from account settings
3. ✅ Users can unlink OAuth with password backup
4. ✅ Cannot unlink last authentication method
5. ✅ Email confirmation flow works end-to-end
6. ✅ OAuth-only users can add password backup
7. ✅ Audit logs track all linking/unlinking events
8. ✅ Rate limiting prevents abuse
9. ✅ Email notifications on security changes
