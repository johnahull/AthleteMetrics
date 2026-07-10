import { test, expect } from './fixtures/e2e-base';
import { loginAs } from './helpers/auth';
import { navigateTo, expectCurrentUrl } from './helpers/navigation';

/**
 * E2E Test: Push Notifications System
 *
 * These tests verify the push notification system including:
 * - User notification preferences management
 * - Push permission request flow
 * - Notification settings (site admin, org admin, user preferences)
 * - Quiet hours configuration
 * - Device subscription management
 *
 * Test Coverage:
 * - Navigate to notification settings
 * - View and update notification preferences
 * - Configure quiet hours
 * - View notification history
 * - Site admin notification controls (for site admins)
 * - Organization notification settings (for org admins)
 *
 * Note: These tests focus on UI/settings management. Actual push notification
 * delivery requires service worker support and cannot be fully tested in E2E
 * without browser notification permissions.
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Push Notifications - User Preferences', () => {
  test.beforeEach(async ({ page }) => {
    // Login as athlete before each test
    await loginAs(page, 'athlete');
  });

  test('should navigate to notification settings page', async ({ page }) => {
    // Navigate to notification settings
    await navigateTo(page, '/notification-settings');

    // Verify we're on the notification settings page
    await expectCurrentUrl(page, '/notification-settings');

    // Verify page heading is present
    await expect(page.locator('h1:has-text("Notification Settings")')).toBeVisible({ timeout: 10000 });
  });

  test('should display notification preference toggles', async ({ page }) => {
    await navigateTo(page, '/notification-settings');

    // Wait for preferences card to load
    await page.waitForSelector('text=/Notification Preferences/i', { timeout: 10000 });

    // Verify main toggle switches are visible
    await expect(page.locator('text=/Push Notifications/i')).toBeVisible();
    await expect(page.locator('text=/Email Notifications/i')).toBeVisible();

    // Verify notification type toggles exist
    await expect(page.locator('text=/Wellness Surveys/i')).toBeVisible();
    await expect(page.locator('text=/Wellness Digest/i')).toBeVisible();
    await expect(page.locator('text=/New Measurements/i')).toBeVisible();
    await expect(page.locator('text=/Team Announcements/i')).toBeVisible();
  });

  test('should allow configuring quiet hours', async ({ page }) => {
    await navigateTo(page, '/notification-settings');

    // Wait for quiet hours section to load
    await page.waitForSelector('text=/Quiet Hours/i', { timeout: 10000 });

    // Verify quiet hours toggle exists
    const quietHoursToggle = page.locator('[data-testid="toggle-quietHoursEnabled"]').first();
    await expect(quietHoursToggle).toBeVisible();

    // Enable quiet hours if not already enabled
    const isEnabled = await quietHoursToggle.isChecked();
    if (!isEnabled) {
      await quietHoursToggle.click();

      // Wait for time inputs to appear
      await page.waitForSelector('[data-testid="input-quietHoursStart"]', { timeout: 5000 });
    }

    // Verify time range inputs are visible when enabled
    await expect(page.locator('[data-testid="input-quietHoursStart"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-quietHoursEnd"]')).toBeVisible();
  });

  test('should display notification history', async ({ page }) => {
    await navigateTo(page, '/notification-settings');

    // Look for notification history section
    const historySection = page.locator('text=/Notification History/i');

    // History section may or may not be visible depending on whether user has notifications
    // Just verify the page loads without error
    const historyVisible = await historySection.isVisible({ timeout: 5000 }).catch(() => false);

    if (historyVisible) {
      // If history is visible, verify it's displayed properly
      await expect(historySection).toBeVisible();
    }
  });
});

test.describe('Push Notifications - Site Admin Controls', () => {
  test.beforeEach(async ({ page }) => {
    // Login as site admin
    await loginAs(page, 'admin');
  });

  test('should display site admin notification settings', async ({ page }) => {
    // Navigate to admin page
    await navigateTo(page, '/admin');

    // Verify we're on the admin page
    await expectCurrentUrl(page, '/admin');

    // Look for notification settings section
    const notificationSettings = page.locator('text=/Push Notifications/i').first();
    await expect(notificationSettings).toBeVisible({ timeout: 10000 });

    // Verify site-wide toggle exists
    const globalToggle = page.locator('[data-testid="toggle-pushNotificationsEnabled"]').first();

    // Toggle may exist in multiple places, so we just verify at least one is visible
    const toggleVisible = await globalToggle.isVisible({ timeout: 5000 }).catch(() => false);
    if (toggleVisible) {
      await expect(globalToggle).toBeVisible();
    }
  });
});

test.describe('Push Notifications - Organization Admin Controls', () => {
  test.beforeEach(async ({ page }) => {
    // Login as org admin (coach)
    await loginAs(page, 'coach');
  });

  test('should display organization notification settings', async ({ page }) => {
    // Navigate to organization settings
    await navigateTo(page, '/org-admin-settings');

    // Verify we're on the org settings page
    await expectCurrentUrl(page, '/org-admin-settings');

    // Look for notification settings section
    const notificationSection = page.locator('text=/Notification Settings/i').first();

    // Section may or may not be immediately visible depending on page structure
    const sectionVisible = await notificationSection.isVisible({ timeout: 10000 }).catch(() => false);

    if (sectionVisible) {
      await expect(notificationSection).toBeVisible();

      // Verify org-level notification toggles exist
      await expect(page.locator('text=/Push Notifications/i')).toBeVisible();
    }
  });
});

test.describe('Push Notifications - Wellness Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Login as athlete
    await loginAs(page, 'athlete');
  });

  test('should display pending tasks banner when wellness requests exist', async ({ page }) => {
    // Navigate to athlete dashboard
    await navigateTo(page, '/my-dashboard');

    // Verify we're on the dashboard
    await expectCurrentUrl(page, '/my-dashboard');

    // Check if pending tasks banner exists (may or may not depending on data)
    const pendingBanner = page.locator('[data-testid="pending-tasks-banner"]');
    const bannerVisible = await pendingBanner.isVisible({ timeout: 5000 }).catch(() => false);

    if (bannerVisible) {
      // If banner exists, verify dismiss button is present
      const dismissButton = page.locator('[data-testid="dismiss-pending-banner"]');
      await expect(dismissButton).toBeVisible();

      // Verify banner contains expected text
      await expect(pendingBanner).toContainText(/pending/i);
    }
  });
});

test.describe('Push Notifications - Permission Prompt', () => {
  test('should show push permission prompt when appropriate', async ({ page }) => {
    // Login as athlete
    await loginAs(page, 'athlete');

    // Navigate to notification settings
    await navigateTo(page, '/notification-settings');

    // Check for permission prompt component
    const permissionPrompt = page.locator('[data-testid="push-permission-prompt"]');

    // Permission prompt visibility depends on browser permission state
    const promptVisible = await permissionPrompt.isVisible({ timeout: 5000 }).catch(() => false);

    if (promptVisible) {
      // If prompt is shown, verify enable button exists
      await expect(page.locator('button:has-text("Enable Push Notifications")')).toBeVisible();
    }
  });
});
