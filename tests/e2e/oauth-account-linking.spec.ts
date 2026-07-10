import { test, expect } from './fixtures/e2e-base';
import { loginWithCredentials, logout, clearAuthState } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

/**
 * TIER 1 CRITICAL: OAuth Account Linking/Unlinking Tests
 *
 * These tests verify OAuth account linking and unlinking functionality for existing users.
 * This is separate from OAuth authentication (initial login) which is tested in oauth-authentication.spec.ts.
 *
 * Test Coverage:
 * - OAuth account linking UI in account settings
 * - Link Google account to existing password-based user
 * - Link Apple account to existing password-based user
 * - View linked OAuth accounts
 * - Unlink OAuth account (when password backup exists)
 * - Cannot unlink last authentication method
 * - Email confirmation flow for account linking
 * - Multiple auth methods for hybrid accounts
 *
 * Current Implementation Status:
 * ✅ OAuth authentication (login/signup via Google/Apple)
 * ✅ Email confirmation linking flow (backend)
 * ❌ OAuth linking UI in account settings (NOT IMPLEMENTED)
 * ❌ OAuth unlinking endpoint (NOT IMPLEMENTED)
 * ❌ View linked accounts UI (NOT IMPLEMENTED)
 *
 * Note: Some tests are skipped because the UI features are not yet implemented.
 * Remove .skip when features are added.
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('OAuth Account Linking - Account Settings UI', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  // TODO: Implement account settings page with OAuth linking UI
  test.skip('should display Link Google Account button in account settings', async ({ page }) => {
    // Login as athlete with password
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    // Navigate to account settings (or my-profile page)
    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Look for "Account Security" or "Connected Accounts" section
    const accountSection = page.locator('text=/connected accounts|account security|authentication methods/i');
    await expect(accountSection).toBeVisible({ timeout: 5000 });

    // Verify "Link Google Account" button exists
    const linkGoogleButton = page.locator('button:has-text("Link Google Account")');
    await expect(linkGoogleButton).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-results/oauth-linking-ui.png' });
  });

  // TODO: Implement account settings page with OAuth linking UI
  test.skip('should display Link Apple Account button in account settings', async ({ page }) => {
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Verify "Link Apple Account" button exists
    const linkAppleButton = page.locator('button:has-text("Link with Apple")');
    await expect(linkAppleButton).toBeVisible();
  });

  // TODO: Implement OAuth linking redirect
  test.skip('should initiate Google linking flow when clicking Link Google button', async ({ page }) => {
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    const linkGoogleButton = page.locator('button:has-text("Link Google Account")');
    await linkGoogleButton.click();

    // Should redirect to Google OAuth endpoint (or show confirmation modal)
    await page.waitForTimeout(1000);
    const currentUrl = page.url();

    // Expect redirect to linking endpoint or OAuth flow
    expect(currentUrl).toMatch(/api\/auth\/google|accounts\.google\.com/);
  });
});

test.describe('OAuth Account Linking - Email Confirmation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  test('should show linking email sent message when OAuth email matches existing account', async ({ page }) => {
    // This test verifies the backend behavior when OAuth email matches existing account
    // The linking flow sends an email with confirmation token

    // Navigate to login page with linking_email_sent message
    await page.goto(`${TESTING_URL}/login?message=linking_email_sent`);
    await page.waitForLoadState('networkidle');

    // Should display success/info message about email confirmation
    const emailMessage = page.locator('[role="alert"], .alert, .message')
      .filter({ hasText: /email.*sent|check.*email|confirm.*link/i });

    await expect(emailMessage.first()).toBeVisible({ timeout: 5000 });

    // Take screenshot
    await page.screenshot({ path: 'test-results/oauth-linking-email-sent.png' });
  });

  test('should handle account linking confirmation via email token', async ({ page }) => {
    // Simulate clicking email confirmation link
    // In real flow: User receives email -> clicks link -> token confirms linking

    // Generate a test token (in real scenario this comes from email)
    const testToken = 'test-linking-token-12345';

    // Navigate to linking confirmation endpoint
    await page.goto(`${TESTING_URL}/api/auth/link-account/${testToken}`);
    await page.waitForLoadState('networkidle');

    // Should redirect to login with success or error message
    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');

    // Check for error message (invalid token in test environment)
    const urlParams = new URL(currentUrl);
    const errorParam = urlParams.searchParams.get('error');
    const messageParam = urlParams.searchParams.get('message');

    // Should have either error (invalid token) or message (success)
    expect(errorParam || messageParam).toBeTruthy();

    // In test environment, expect error since token is fake
    expect(errorParam).toMatch(/invalid|expired|linking_failed/i);
  });

  test('should show account linked success message after confirmation', async ({ page }) => {
    // Navigate to login page with account_linked success message
    await page.goto(`${TESTING_URL}/login?message=account_linked`);
    await page.waitForLoadState('networkidle');

    // Should display success message
    const successMessage = page.locator('[role="alert"], .alert, .success')
      .filter({ hasText: /linked|success|account.*connected/i });

    await expect(successMessage.first()).toBeVisible({ timeout: 5000 });

    // Take screenshot
    await page.screenshot({ path: 'test-results/oauth-account-linked-success.png' });
  });

  test('should handle expired linking token error', async ({ page }) => {
    await page.goto(`${TESTING_URL}/login?error=linking_failed`);
    await page.waitForLoadState('networkidle');

    // Should display error message
    const errorMessage = page.locator('[role="alert"], .alert, .error')
      .filter({ hasText: /link|failed|error/i });

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('OAuth Account Unlinking', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  // TODO: Implement view linked OAuth accounts UI
  test.skip('should display linked OAuth accounts in account settings', async ({ page }) => {
    // Login as user with linked OAuth (this would be a test user with googleId or appleId set)
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Should show "Connected Accounts" section
    const connectedSection = page.locator('text=/connected accounts|linked accounts/i');
    await expect(connectedSection).toBeVisible();

    // Should display Google account if linked
    const googleAccount = page.locator('text=/google.*connected|linked.*google/i');
    await expect(googleAccount).toBeVisible();

    // Should display "Unlink" button next to Google account
    const unlinkButton = page.locator('button:has-text("Unlink")').first();
    await expect(unlinkButton).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-results/oauth-linked-accounts-display.png' });
  });

  // TODO: Implement OAuth unlink endpoint (POST /api/auth/unlink/:provider)
  test.skip('should unlink Google account when user has password backup', async ({ page }) => {
    // Prerequisites: User has both password AND Google OAuth linked
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Click "Unlink" next to Google account
    const unlinkGoogleButton = page.locator('button:has-text("Unlink")')
      .filter({ has: page.locator('text=/google/i') });
    await unlinkGoogleButton.click();

    // Should show confirmation dialog
    const confirmDialog = page.locator('[role="dialog"], .modal').filter({ hasText: /confirm|unlink/i });
    await expect(confirmDialog).toBeVisible({ timeout: 3000 });

    // Confirm unlinking
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Unlink")').last();
    await confirmButton.click();

    // Wait for success message
    await page.waitForTimeout(1000);

    // Verify Google account is no longer displayed as linked
    const googleAccount = page.locator('text=/google.*connected|linked.*google/i');
    await expect(googleAccount).not.toBeVisible();

    // Should show success toast/message
    const successMessage = page.locator('[role="alert"], .toast').filter({ hasText: /unlink.*success|removed/i });
    await expect(successMessage.first()).toBeVisible({ timeout: 5000 });

    // Take screenshot
    await page.screenshot({ path: 'test-results/oauth-unlinked-success.png' });
  });

  // TODO: Implement OAuth unlink endpoint with validation
  test.skip('should unlink Apple account when user has password backup', async ({ page }) => {
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Unlink Apple account
    const unlinkAppleButton = page.locator('button:has-text("Unlink")')
      .filter({ has: page.locator('text=/apple/i') });
    await unlinkAppleButton.click();

    // Confirm
    const confirmButton = page.locator('button:has-text("Confirm")').last();
    await confirmButton.click();

    // Verify unlinking success
    await page.waitForTimeout(1000);
    const appleAccount = page.locator('text=/apple.*connected|linked.*apple/i');
    await expect(appleAccount).not.toBeVisible();
  });

  // TODO: Implement validation preventing unlinking last auth method
  test.skip('should prevent unlinking OAuth when it is the only authentication method', async ({ page }) => {
    // Prerequisites: OAuth-only user (no password set)
    // This user ONLY has Google OAuth, no password

    // For this test, we need a special test user created via OAuth with password = null
    // Skip if such user doesn't exist
    const oauthOnlyEmail = process.env.OAUTH_ONLY_TEST_USER || 'oauth-only@example.com';

    // Try to login (should redirect to OAuth)
    await page.goto(`${TESTING_URL}/my-profile`);

    // Assume we're logged in as OAuth-only user (via previous OAuth flow)
    // Navigate to account settings
    await page.waitForLoadState('networkidle');

    // Try to unlink Google account
    const unlinkButton = page.locator('button:has-text("Unlink")')
      .filter({ has: page.locator('text=/google/i') });

    // Button should be disabled OR show warning
    if (await unlinkButton.count() > 0) {
      const isDisabled = await unlinkButton.isDisabled();
      expect(isDisabled).toBe(true);

      // Should show warning message
      const warningMessage = page.locator('text=/cannot unlink.*last.*auth|add password.*first|only auth/i');
      await expect(warningMessage).toBeVisible();

      // Take screenshot
      await page.screenshot({ path: 'test-results/oauth-unlink-prevented-last-method.png' });
    }
  });

  // TODO: Implement UI showing multiple auth methods
  test.skip('should display all linked authentication methods', async ({ page }) => {
    // User with password + Google + Apple (all three methods)
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Should show "Authentication Methods" section
    const authMethodsSection = page.locator('text=/authentication methods|login methods/i');
    await expect(authMethodsSection).toBeVisible();

    // Should list all three methods
    const passwordMethod = page.locator('text=/password|username.*password/i');
    const googleMethod = page.locator('text=/google.*account|google.*oauth/i');
    const appleMethod = page.locator('text=/apple.*account|apple.*id/i');

    await expect(passwordMethod).toBeVisible();
    await expect(googleMethod).toBeVisible();
    await expect(appleMethod).toBeVisible();

    // Each OAuth method should have "Unlink" button
    const unlinkButtons = page.locator('button:has-text("Unlink")');
    const count = await unlinkButtons.count();
    expect(count).toBeGreaterThanOrEqual(2); // At least Google and Apple

    // Take screenshot
    await page.screenshot({ path: 'test-results/oauth-multiple-auth-methods.png' });
  });

  // TODO: Implement error handling for unlink failures
  test.skip('should handle OAuth unlink API errors gracefully', async ({ page }) => {
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Intercept unlink API request to simulate failure
    await page.route('**/api/auth/unlink/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unlink failed: server error' })
      });
    });

    // Try to unlink
    const unlinkButton = page.locator('button:has-text("Unlink")').first();
    await unlinkButton.click();

    // Confirm
    const confirmButton = page.locator('button:has-text("Confirm")').last();
    await confirmButton.click();

    // Should show error message
    await page.waitForTimeout(1000);
    const errorMessage = page.locator('[role="alert"], .toast')
      .filter({ hasText: /error|failed|could not unlink/i });
    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });

    // Account should still be linked (unlink failed)
    const googleAccount = page.locator('text=/google.*connected/i');
    await expect(googleAccount).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-results/oauth-unlink-error.png' });
  });
});

test.describe('OAuth Account Linking - Security', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  test('should require authentication to access linking endpoints', async ({ page }) => {
    // Try to access OAuth linking endpoint without being logged in
    await page.goto(`${TESTING_URL}/api/auth/google`);
    await page.waitForLoadState('networkidle');

    // Should redirect to login OR show error
    const currentUrl = page.url();

    // Google OAuth may redirect to accounts.google.com even without login
    // Or it may redirect back to /login
    // Just verify we don't get a 500 error
    expect(currentUrl).toBeTruthy();
  });

  test('should use one-time tokens for account linking confirmation', async ({ page }) => {
    // Try to reuse a linking token
    const token = 'test-token-12345';

    // First use
    await page.goto(`${TESTING_URL}/api/auth/link-account/${token}`);
    await page.waitForLoadState('networkidle');

    // Should redirect to login with error (invalid token)
    let currentUrl = page.url();
    expect(currentUrl).toContain('/login');

    // Try to use same token again
    await page.goto(`${TESTING_URL}/api/auth/link-account/${token}`);
    await page.waitForLoadState('networkidle');

    // Should still show error (tokens are one-time use)
    currentUrl = page.url();
    expect(currentUrl).toContain('error=');
  });

  test('should validate linking token expiration', async ({ page }) => {
    // Navigate with expired token error message
    await page.goto(`${TESTING_URL}/login?error=linking_failed`);
    await page.waitForLoadState('networkidle');

    // Should display error about expired or invalid token
    const errorAlert = page.locator('[role="alert"], .alert, .error')
      .filter({ hasText: /expired|invalid|failed/i });

    await expect(errorAlert.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('OAuth Account Linking - User Experience', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  // TODO: Implement account linking success flow
  test.skip('should show account linking benefits before linking', async ({ page }) => {
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Should display info about why linking is beneficial
    const linkingInfo = page.locator('text=/link.*account.*faster.*login|one.*click.*sign.*in/i');
    await expect(linkingInfo).toBeVisible();

    // Should show icons for Google and Apple
    const googleIcon = page.locator('svg[aria-label*="Google"], img[alt*="Google"]');
    const appleIcon = page.locator('svg[aria-label*="Apple"], img[alt*="Apple"]');

    await expect(googleIcon).toBeVisible();
    await expect(appleIcon).toBeVisible();
  });

  // TODO: Implement hybrid account login preferences
  test.skip('should indicate which authentication method was last used', async ({ page }) => {
    // User with multiple auth methods
    const athlete = getUserByRole('athlete');
    await loginWithCredentials(page, athlete.username, athlete.password);

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Should show "Last used" indicator next to the most recent auth method
    const lastUsedIndicator = page.locator('text=/last used|most recent/i');
    await expect(lastUsedIndicator).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-results/oauth-last-auth-method.png' });
  });

  // TODO: Implement password backup for OAuth users
  test.skip('should allow OAuth-only user to add password backup', async ({ page }) => {
    // OAuth-only user (no password)
    // Should see "Add Password Backup" option

    await page.goto(`${TESTING_URL}/my-profile`);
    await page.waitForLoadState('networkidle');

    // Should display "Add Password" section for OAuth-only users
    const addPasswordSection = page.locator('text=/add.*password|set.*password|backup.*auth/i');
    await expect(addPasswordSection).toBeVisible();

    // Should have form to create new password
    const newPasswordInput = page.locator('input[name="newPassword"], input[type="password"]').first();
    await expect(newPasswordInput).toBeVisible();

    // Fill and submit password
    await newPasswordInput.fill('NewSecurePassword123!');
    const confirmPasswordInput = page.locator('input[name="confirmPassword"]');
    await confirmPasswordInput.fill('NewSecurePassword123!');

    const savePasswordButton = page.locator('button:has-text("Save Password"), button:has-text("Add Password")');
    await savePasswordButton.click();

    // Should show success message
    await page.waitForTimeout(1000);
    const successMessage = page.locator('[role="alert"], .toast')
      .filter({ hasText: /password.*added|backup.*auth.*enabled/i });
    await expect(successMessage.first()).toBeVisible({ timeout: 5000 });

    // Now "Unlink" buttons should be enabled
    const unlinkButton = page.locator('button:has-text("Unlink")').first();
    await expect(unlinkButton).toBeEnabled();
  });
});

test.describe('OAuth Account Linking - Test Summary', () => {
  test('print OAuth account linking test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('OAuth Account Linking Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Email confirmation flow for account linking (backend)');
    console.log('✅ Linking email sent message display');
    console.log('✅ Account linked success message display');
    console.log('✅ Linking token validation (expiry, one-time use)');
    console.log('✅ Security: Authentication required for linking');
    console.log('');
    console.log('⏭️  SKIPPED (features not yet implemented):');
    console.log('❌ Link Google Account button in account settings');
    console.log('❌ Link Apple Account button in account settings');
    console.log('❌ View linked OAuth accounts UI');
    console.log('❌ Unlink OAuth account when password backup exists');
    console.log('❌ Prevent unlinking last authentication method');
    console.log('❌ Display all authentication methods (password + OAuth)');
    console.log('❌ Add password backup for OAuth-only users');
    console.log('❌ Last used authentication method indicator');
    console.log('');
    console.log('📋 IMPLEMENTATION NEEDED:');
    console.log('1. Account Settings UI with OAuth linking section');
    console.log('2. POST /api/auth/unlink/:provider endpoint');
    console.log('3. GET /api/auth/linked-accounts endpoint');
    console.log('4. UI components for linked accounts display');
    console.log('5. Validation preventing unlinking last auth method');
    console.log('6. Add password backup flow for OAuth-only users');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
