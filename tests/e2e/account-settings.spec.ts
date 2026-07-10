import { test, expect } from './fixtures/e2e-base';
import { loginAs, loginWithCredentials, logout } from './helpers/auth';
import { navigateTo, expectCurrentUrl } from './helpers/navigation';
import { clickWithMultipleFallbacks } from './helpers/selectors';
import { canTestRoleAuthorization } from './fixtures/test-users';

/**
 * E2E Test: Account Settings (Profile & Password Management)
 *
 * These tests verify that users can manage their account settings including:
 * - Viewing current profile information
 * - Updating personal information (first name, last name)
 * - Changing password with proper validation
 * - Email verification status display
 * - Form validation and error handling
 *
 * Test Coverage:
 * - Navigate to account settings page
 * - Update profile information
 * - Change password successfully
 * - Password validation (length, complexity, confirmation match)
 * - Current password verification
 * - View account information
 * - Session persistence after profile updates
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

// Test data for profile updates
const TEST_DATA = {
  firstName: {
    original: 'Test',
    updated: 'UpdatedTest',
  },
  lastName: {
    original: 'Athlete',
    updated: 'UpdatedAthlete',
  },
  password: {
    current: 'TestPassword123!',
    new: 'NewPassword456!',
    invalid: {
      tooShort: 'Short1!',
      noUppercase: 'passwordonly123!',   // 16 chars, no uppercase
      noLowercase: 'PASSWORDONLY123!',   // 16 chars, no lowercase
      noNumber: 'PasswordOnlyAbc!',      // 16 chars, no number (must be 12+ to test char requirements)
      noSpecialChar: 'PasswordOnly1234', // 16 chars, no special char (must be 12+ to test char requirements)
      mismatch: 'MismatchPass123!',
    },
  },
};

test.describe('Account Settings - Profile Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as athlete before each test
    await loginAs(page, 'athlete');
  });

  test('should navigate to account settings page', async ({ page }) => {
    // Navigate to profile/account settings page
    await navigateTo(page, '/profile');

    // Verify we're on the profile page
    await expectCurrentUrl(page, '/profile');

    // Verify page title/heading is present
    await expect(page.locator('h1:has-text("Profile Settings")')).toBeVisible({ timeout: 10000 });

    // Verify main sections are visible - use .first() to handle multiple matches in strict mode
    await expect(page.locator('text=/Personal Information/i').first()).toBeVisible();
    await expect(page.locator('text=/Security Settings/i').first()).toBeVisible();
  });

  test('should display current user information', async ({ page }) => {
    await navigateTo(page, '/profile');

    // Wait for page to load
    await page.waitForSelector('[data-testid="input-profile-firstName"]', { timeout: 10000 });

    // Verify username field exists and is disabled (usernames cannot be changed)
    const usernameInput = page.locator('[data-testid="input-profile-username"]');
    await expect(usernameInput).toBeVisible();
    await expect(usernameInput).toBeDisabled();

    // Verify username has a value
    const usernameValue = await usernameInput.inputValue();
    expect(usernameValue).toBeTruthy();

    // Verify email field exists and is disabled (currently emails cannot be changed via this form)
    const emailInput = page.locator('[data-testid="input-profile-email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toBeDisabled();

    // Verify first name and last name fields are editable
    await expect(page.locator('[data-testid="input-profile-firstName"]')).toBeEnabled();
    await expect(page.locator('[data-testid="input-profile-lastName"]')).toBeEnabled();

    // Verify role is displayed in security settings
    await expect(page.locator('text=/Role:/i')).toBeVisible();

    // Verify email verification status is shown
    await expect(page.locator('text=/Email Status:/i')).toBeVisible();
  });

  test('should update profile information (first name and last name)', async ({ page }) => {
    await navigateTo(page, '/profile');

    // Wait for form to load
    await page.waitForSelector('[data-testid="input-profile-firstName"]', { timeout: 10000 });

    // Get original values
    const firstNameInput = page.locator('[data-testid="input-profile-firstName"]');
    const lastNameInput = page.locator('[data-testid="input-profile-lastName"]');

    const originalFirstName = await firstNameInput.inputValue();
    const originalLastName = await lastNameInput.inputValue();

    // Update first name
    await firstNameInput.clear();
    await firstNameInput.fill(TEST_DATA.firstName.updated);

    // Update last name
    await lastNameInput.clear();
    await lastNameInput.fill(TEST_DATA.lastName.updated);

    // Submit the form
    await page.click('[data-testid="button-update-profile"]');

    // Wait for success message (toast notification)
    await expect(page.locator('text=/Profile updated successfully|Success/i').first()).toBeVisible({ timeout: 10000 });

    // Verify the form now shows updated values
    await expect(firstNameInput).toHaveValue(TEST_DATA.firstName.updated);
    await expect(lastNameInput).toHaveValue(TEST_DATA.lastName.updated);

    // Verify changes persist after page refresh
    await page.reload();
    await page.waitForSelector('[data-testid="input-profile-firstName"]', { timeout: 10000 });

    await expect(page.locator('[data-testid="input-profile-firstName"]')).toHaveValue(TEST_DATA.firstName.updated);
    await expect(page.locator('[data-testid="input-profile-lastName"]')).toHaveValue(TEST_DATA.lastName.updated);

    // Restore original values for subsequent tests
    await page.locator('[data-testid="input-profile-firstName"]').clear();
    await page.locator('[data-testid="input-profile-firstName"]').fill(originalFirstName);
    await page.locator('[data-testid="input-profile-lastName"]').clear();
    await page.locator('[data-testid="input-profile-lastName"]').fill(originalLastName);
    await page.click('[data-testid="button-update-profile"]');
    await expect(page.locator('text=/Profile updated successfully|Success/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('should validate required fields for profile update', async ({ page }) => {
    await navigateTo(page, '/profile');
    await page.waitForSelector('[data-testid="input-profile-firstName"]', { timeout: 10000 });

    // Try to submit with empty first name
    await page.locator('[data-testid="input-profile-firstName"]').clear();
    await page.click('[data-testid="button-update-profile"]');

    // Should show validation error (Zod validation: "First name is required")
    await expect(page.locator('text=/First name is required/i')).toBeVisible({ timeout: 5000 });

    // Restore first name, try empty last name
    await page.locator('[data-testid="input-profile-firstName"]').fill('Test');
    await page.locator('[data-testid="input-profile-lastName"]').clear();
    await page.click('[data-testid="button-update-profile"]');

    // Should show validation error
    await expect(page.locator('text=/Last name is required/i')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Account Settings - Password Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as athlete before each test
    await loginAs(page, 'athlete');
    await navigateTo(page, '/profile');
    await page.waitForSelector('[data-testid="button-change-password"]', { timeout: 10000 });
  });

  test('should show password change form when clicking Change Password button', async ({ page }) => {
    // Initially, password form should not be visible
    await expect(page.locator('[data-testid="input-current-password"]')).not.toBeVisible();

    // Click "Change Password" button
    await page.click('[data-testid="button-change-password"]');

    // Password change form should now be visible
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="input-new-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-confirm-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-save-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-cancel-password"]')).toBeVisible();
  });

  test('should cancel password change and hide form', async ({ page }) => {
    // Open password change form
    await page.click('[data-testid="button-change-password"]');
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible({ timeout: 5000 });

    // Fill in some data
    await page.fill('[data-testid="input-current-password"]', 'test123');
    await page.fill('[data-testid="input-new-password"]', 'newpass123');

    // Click cancel
    await page.click('[data-testid="button-cancel-password"]');

    // Form should be hidden
    await expect(page.locator('[data-testid="input-current-password"]')).not.toBeVisible();

    // Change Password button should be visible again
    await expect(page.locator('[data-testid="button-change-password"]')).toBeVisible();
  });

  test('should validate password minimum length requirement', async ({ page }) => {
    // Open password change form
    await page.click('[data-testid="button-change-password"]');
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible({ timeout: 5000 });

    // Fill in current password
    await page.fill('[data-testid="input-current-password"]', 'CurrentPass123!');

    // Try a password that's too short (< 12 characters)
    await page.fill('[data-testid="input-new-password"]', TEST_DATA.password.invalid.tooShort);
    await page.fill('[data-testid="input-confirm-password"]', TEST_DATA.password.invalid.tooShort);

    // Try to submit
    await page.click('[data-testid="button-save-password"]');

    // Should show validation error about password length
    await expect(page.locator('text=/must be at least 12 characters/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('should validate password complexity requirements', async ({ page }) => {
    // Open password change form
    await page.click('[data-testid="button-change-password"]');
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible({ timeout: 5000 });

    await page.fill('[data-testid="input-current-password"]', 'CurrentPass123!');

    // Test 1: No uppercase letter
    await page.fill('[data-testid="input-new-password"]', TEST_DATA.password.invalid.noUppercase);
    await page.fill('[data-testid="input-confirm-password"]', TEST_DATA.password.invalid.noUppercase);
    await page.click('[data-testid="button-save-password"]');
    await expect(page.locator('text=/uppercase letter/i')).toBeVisible({ timeout: 5000 });

    // Test 2: No lowercase letter
    await page.fill('[data-testid="input-new-password"]', TEST_DATA.password.invalid.noLowercase);
    await page.fill('[data-testid="input-confirm-password"]', TEST_DATA.password.invalid.noLowercase);
    await page.click('[data-testid="button-save-password"]');
    await expect(page.locator('text=/lowercase letter/i')).toBeVisible({ timeout: 5000 });

    // Test 3: No number
    await page.fill('[data-testid="input-new-password"]', TEST_DATA.password.invalid.noNumber);
    await page.fill('[data-testid="input-confirm-password"]', TEST_DATA.password.invalid.noNumber);
    await page.click('[data-testid="button-save-password"]');
    await expect(page.locator('text=/contain at least one number/i')).toBeVisible({ timeout: 5000 });

    // Test 4: No special character
    await page.fill('[data-testid="input-new-password"]', TEST_DATA.password.invalid.noSpecialChar);
    await page.fill('[data-testid="input-confirm-password"]', TEST_DATA.password.invalid.noSpecialChar);
    await page.click('[data-testid="button-save-password"]');
    await expect(page.locator('text=/special character/i')).toBeVisible({ timeout: 5000 });
  });

  test('should validate password confirmation matches new password', async ({ page }) => {
    // Open password change form
    await page.click('[data-testid="button-change-password"]');
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible({ timeout: 5000 });

    await page.fill('[data-testid="input-current-password"]', 'CurrentPass123!');

    // Enter valid new password
    await page.fill('[data-testid="input-new-password"]', TEST_DATA.password.new);

    // Enter mismatched confirmation password
    await page.fill('[data-testid="input-confirm-password"]', TEST_DATA.password.invalid.mismatch);

    // Try to submit
    await page.click('[data-testid="button-save-password"]');

    // Should show validation error about password mismatch
    await expect(page.locator('text=/Passwords don\'t match|Passwords must match/i')).toBeVisible({ timeout: 5000 });
  });

  test('should reject incorrect current password', async ({ page }) => {
    // Open password change form
    await page.click('[data-testid="button-change-password"]');
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible({ timeout: 5000 });

    // Enter wrong current password
    await page.fill('[data-testid="input-current-password"]', 'WrongPassword123!');

    // Enter valid new password
    await page.fill('[data-testid="input-new-password"]', TEST_DATA.password.new);
    await page.fill('[data-testid="input-confirm-password"]', TEST_DATA.password.new);

    // Try to submit
    await page.click('[data-testid="button-save-password"]');

    // Should show error about incorrect current password (error may appear in toast with raw API message format)
    await expect(page.locator('text=/Current password is incorrect|Invalid password|Failed to change password/i')).toBeVisible({ timeout: 10000 });

    // Form should still be visible (not closed on error)
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible();
  });

  test('should toggle password visibility for all password fields', async ({ page }) => {
    // Open password change form
    await page.click('[data-testid="button-change-password"]');
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible({ timeout: 5000 });

    // Current password field should be type="password" initially
    await expect(page.locator('[data-testid="input-current-password"]')).toHaveAttribute('type', 'password');

    // Fill in password to verify visibility toggle works
    await page.fill('[data-testid="input-current-password"]', 'TestPassword123!');

    // Find and click the eye icon for current password (next to input field)
    const currentPasswordToggle = page.locator('[data-testid="input-current-password"]').locator('..').locator('button[aria-label*="password"]');
    await currentPasswordToggle.click();

    // Field should now be type="text" (password visible)
    await expect(page.locator('[data-testid="input-current-password"]')).toHaveAttribute('type', 'text');

    // Click again to hide
    await currentPasswordToggle.click();
    await expect(page.locator('[data-testid="input-current-password"]')).toHaveAttribute('type', 'password');

    // Test the same for new password field
    await page.fill('[data-testid="input-new-password"]', 'NewPassword456!');
    const newPasswordToggle = page.locator('[data-testid="input-new-password"]').locator('..').locator('button[aria-label*="password"]');

    await expect(page.locator('[data-testid="input-new-password"]')).toHaveAttribute('type', 'password');
    await newPasswordToggle.click();
    await expect(page.locator('[data-testid="input-new-password"]')).toHaveAttribute('type', 'text');

    // Test confirm password field
    await page.fill('[data-testid="input-confirm-password"]', 'NewPassword456!');
    const confirmPasswordToggle = page.locator('[data-testid="input-confirm-password"]').locator('..').locator('button[aria-label*="password"]');

    await expect(page.locator('[data-testid="input-confirm-password"]')).toHaveAttribute('type', 'password');
    await confirmPasswordToggle.click();
    await expect(page.locator('[data-testid="input-confirm-password"]')).toHaveAttribute('type', 'text');
  });

  // TODO: Enable this test once password change flow is verified with real credentials
  test.skip('should successfully change password and allow login with new password', async ({ page }) => {
    // This test requires knowing the current password and ability to change it
    // Skip for now as it would modify test user credentials

    // Open password change form
    await page.click('[data-testid="button-change-password"]');
    await expect(page.locator('[data-testid="input-current-password"]')).toBeVisible({ timeout: 5000 });

    // Fill in password change form with valid data
    await page.fill('[data-testid="input-current-password"]', TEST_DATA.password.current);
    await page.fill('[data-testid="input-new-password"]', TEST_DATA.password.new);
    await page.fill('[data-testid="input-confirm-password"]', TEST_DATA.password.new);

    // Submit password change
    await page.click('[data-testid="button-save-password"]');

    // Should show success message
    await expect(page.locator('text=/Password changed successfully|Password updated/i')).toBeVisible({ timeout: 10000 });

    // Password form should be hidden after success
    await expect(page.locator('[data-testid="input-current-password"]')).not.toBeVisible();

    // Logout
    await logout(page);

    // Try to login with OLD password - should fail
    await loginWithCredentials(page, 'athlete_user', TEST_DATA.password.current, false);
    await expect(page.locator('text=/Invalid username or password/i')).toBeVisible({ timeout: 5000 });

    // Login with NEW password - should succeed
    await loginWithCredentials(page, 'athlete_user', TEST_DATA.password.new, true);
    await expectCurrentUrl(page, '/dashboard');

    // Change password back to original
    await navigateTo(page, '/profile');
    await page.click('[data-testid="button-change-password"]');
    await page.fill('[data-testid="input-current-password"]', TEST_DATA.password.new);
    await page.fill('[data-testid="input-new-password"]', TEST_DATA.password.current);
    await page.fill('[data-testid="input-confirm-password"]', TEST_DATA.password.current);
    await page.click('[data-testid="button-save-password"]');
    await expect(page.locator('text=/Password changed successfully/i')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Account Settings - Email Verification', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'athlete');
    await navigateTo(page, '/profile');
    await page.waitForLoadState('networkidle');
  });

  test('should display email verification status', async ({ page }) => {
    // Wait for security settings section
    await expect(page.locator('text=/Security Settings/i').first()).toBeVisible({ timeout: 10000 });

    // Email status should be displayed
    await expect(page.locator('text=/Email Status:/i')).toBeVisible();

    // Should show either "Verified" or "Not Verified"
    const verifiedCount = await page.locator('text=/Verified/i').count();
    const notVerifiedCount = await page.locator('text=/Not Verified/i').count();

    // At least one of these should be present
    expect(verifiedCount + notVerifiedCount).toBeGreaterThan(0);
  });

  test('should show send verification email button if email is not verified', async ({ page }) => {
    // Wait for page to load
    await expect(page.locator('text=/Security Settings/i').first()).toBeVisible({ timeout: 10000 });

    // Check if email is not verified
    const notVerifiedCount = await page.locator('text=/Not Verified/i').count();

    if (notVerifiedCount > 0) {
      // If not verified, should show "Send Verification Email" button
      await expect(page.locator('button:has-text("Send Verification Email")')).toBeVisible({ timeout: 5000 });
    } else {
      // If verified, button should not be present
      await expect(page.locator('button:has-text("Send Verification Email")')).not.toBeVisible();
    }
  });

  // TODO: Test email verification button click and success message
  test.skip('should send verification email when button is clicked', async ({ page }) => {
    // This test requires:
    // 1. A test user with unverified email
    // 2. Access to email inbox or email service mock
    // 3. Verification that email was sent

    await expect(page.locator('text=/Not Verified/i')).toBeVisible({ timeout: 10000 });

    // Click send verification email button
    await page.click('button:has-text("Send Verification Email")');

    // Should show success message
    await expect(page.locator('text=/Verification email sent|Check your inbox/i')).toBeVisible({ timeout: 10000 });

    // TODO: Verify email was actually sent (requires email service integration)
  });
});

test.describe('Account Settings - OAuth Account Information', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'athlete');
    await navigateTo(page, '/profile');
    await page.waitForLoadState('networkidle');
  });

  // TODO: Add tests for OAuth-linked accounts
  test.skip('should display linked OAuth providers', async ({ page }) => {
    // This test requires:
    // 1. A test user with OAuth accounts linked (Google, Apple)
    // 2. UI that displays linked OAuth providers in account settings

    // Expected behavior:
    // - Show "Google Account: linked" if user has Google OAuth
    // - Show "Apple ID: linked" if user has Apple OAuth
    // - Provide option to unlink OAuth accounts
    // - Show option to link OAuth accounts if not already linked

    await expect(page.locator('text=/Connected Accounts|Linked Accounts/i')).toBeVisible({ timeout: 10000 });
  });

  // TODO: Add test for OAuth-only users (no password set)
  test.skip('should show option to set password for OAuth-only users', async ({ page }) => {
    // This test requires:
    // 1. A test user that signed up via OAuth without setting a password
    // 2. UI that allows OAuth users to add a backup password

    // Expected behavior:
    // - If user has no password (OAuth-only), show "Set Password" instead of "Change Password"
    // - Allow OAuth users to set a password as backup authentication method

    const hasNoPassword = true; // This would be determined from user data

    if (hasNoPassword) {
      await expect(page.locator('button:has-text("Set Password")')).toBeVisible({ timeout: 5000 });
    } else {
      await expect(page.locator('button:has-text("Change Password")')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Account Settings - Session Persistence', () => {
  test('should maintain session after profile update', async ({ page }) => {
    await loginAs(page, 'athlete');
    await navigateTo(page, '/profile');

    // Update profile
    await page.waitForSelector('[data-testid="input-profile-firstName"]', { timeout: 10000 });
    const firstNameInput = page.locator('[data-testid="input-profile-firstName"]');

    const originalValue = await firstNameInput.inputValue();
    await firstNameInput.clear();
    await firstNameInput.fill('SessionTest');
    await page.click('[data-testid="button-update-profile"]');
    await expect(page.locator('text=/Success/i').first()).toBeVisible({ timeout: 10000 });

    // Navigate to another page
    await navigateTo(page, '/dashboard');
    await page.waitForLoadState('networkidle');

    // Should still be logged in (not redirected to login)
    await expect(page).not.toHaveURL(/\/login/);

    // Navigate back to profile
    await navigateTo(page, '/profile');
    await page.waitForSelector('[data-testid="input-profile-firstName"]', { timeout: 10000 });

    // Updated value should still be there
    await expect(page.locator('[data-testid="input-profile-firstName"]')).toHaveValue('SessionTest');

    // Restore original value
    await firstNameInput.clear();
    await firstNameInput.fill(originalValue);
    await page.click('[data-testid="button-update-profile"]');
    await expect(page.locator('text=/Success/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('should maintain session after page refresh on profile page', async ({ page }) => {
    await loginAs(page, 'athlete');
    await navigateTo(page, '/profile');

    // Wait for page to load
    await page.waitForSelector('[data-testid="input-profile-firstName"]', { timeout: 10000 });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be on profile page (not redirected to login)
    await expectCurrentUrl(page, '/profile');

    // Profile form should still be visible
    await expect(page.locator('[data-testid="input-profile-firstName"]')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Account Settings - Role-Specific Views', () => {
  test('should show athlete role in security settings for athlete user', async ({ page }) => {
    // Skip if athlete and site_admin share same credentials (can't test role-specific display)
    test.skip(!canTestRoleAuthorization('athlete', 'site_admin'),
      'Skipping: athlete and site_admin share same credentials in this environment');

    await loginAs(page, 'athlete');
    await navigateTo(page, '/profile');
    await page.waitForLoadState('networkidle');

    // Verify role is displayed
    await expect(page.locator('text=/Role:/i')).toBeVisible({ timeout: 10000 });

    // Should show "Athlete" role (case-insensitive)
    await expect(page.locator('text=/Athlete/i').first()).toBeVisible();
  });

  test('should show coach role in security settings for coach user', async ({ page }) => {
    // Skip if coach and site_admin share same credentials (can't test role-specific display)
    test.skip(!canTestRoleAuthorization('coach', 'site_admin'),
      'Skipping: coach and site_admin share same credentials in this environment');

    await loginAs(page, 'coach');
    await navigateTo(page, '/profile');
    await page.waitForLoadState('networkidle');

    // Verify role is displayed
    await expect(page.locator('text=/Role:/i')).toBeVisible({ timeout: 10000 });

    // Should show "Coach" role
    await expect(page.locator('text=/Coach/i')).toBeVisible();
  });

  test('should show org admin role in security settings for org admin user', async ({ page }) => {
    // Skip if org_admin and site_admin share same credentials (can't test role-specific display)
    test.skip(!canTestRoleAuthorization('org_admin', 'site_admin'),
      'Skipping: org_admin and site_admin share same credentials in this environment');

    await loginAs(page, 'org_admin');
    await navigateTo(page, '/profile');
    await page.waitForLoadState('networkidle');

    // Verify role is displayed
    await expect(page.locator('text=/Role:/i')).toBeVisible({ timeout: 10000 });

    // Should show "Org Admin" role
    await expect(page.locator('text=/Org Admin/i')).toBeVisible();
  });
});
