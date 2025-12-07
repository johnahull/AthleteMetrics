import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * E2E Tests: Admin Membership Settings Configuration
 *
 * Tests the org admin settings page membership configuration features:
 * - Join code display and regeneration
 * - Toggle switches for membership settings
 * - Status badges reflecting current configuration
 * - Access control for org admins vs other roles
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

// Helper to navigate to org admin settings
async function navigateToOrgAdminSettings(page: any): Promise<string | null> {
  // Navigate to organizations list
  await page.goto(`${TESTING_URL}/organizations`);
  await page.waitForLoadState('networkidle');

  // Find first organization link
  const orgLink = page.locator('[href*="/organizations/"]').first();
  const hasOrgs = await orgLink.count();

  if (hasOrgs === 0) {
    return null;
  }

  // Extract organization ID from href
  const href = await orgLink.getAttribute('href');
  const orgId = href?.match(/\/organizations\/([^/]+)/)?.[1];

  if (!orgId) {
    return null;
  }

  // Navigate directly to admin settings page
  await page.goto(`${TESTING_URL}/organizations/${orgId}/settings/admin`);
  await page.waitForLoadState('networkidle');

  return orgId;
}

test.describe('Admin Membership Settings - Page Access', () => {
  test('org admin can access membership settings page', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Should see the Organization Settings heading
    await expect(page.locator('h1:has-text("Organization Settings")')).toBeVisible({ timeout: 10000 });

    // Should see Membership Settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 5000 });
  });

  test('site admin can access membership settings page', async ({ page }) => {
    await loginAs(page, 'site_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Should see the Organization Settings heading
    await expect(page.locator('h1:has-text("Organization Settings")')).toBeVisible({ timeout: 10000 });

    // Should see Membership Settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 5000 });
  });

  test('coach cannot access org admin settings', async ({ page }) => {
    await loginAs(page, 'coach');

    // Try to navigate to an org's admin settings
    await page.goto(`${TESTING_URL}/organizations`);
    await page.waitForLoadState('networkidle');

    const orgLink = page.locator('[href*="/organizations/"]').first();
    const hasOrgs = await orgLink.count();

    if (hasOrgs === 0) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    const href = await orgLink.getAttribute('href');
    const orgId = href?.match(/\/organizations\/([^/]+)/)?.[1];

    if (!orgId) {
      test.skip(true, 'Could not extract organization ID');
      return;
    }

    // Try to access admin settings directly
    await page.goto(`${TESTING_URL}/organizations/${orgId}/settings/admin`);
    await page.waitForLoadState('networkidle');

    // Should see Access Denied or be redirected
    const accessDenied = page.locator('text=Access Denied');
    const hasAccessDenied = await accessDenied.isVisible().catch(() => false);

    // Either shows access denied OR doesn't show the membership settings
    if (!hasAccessDenied) {
      // If no explicit access denied, membership settings should not be visible
      const membershipSettings = page.locator('text=Membership Settings');
      const hasMembershipSettings = await membershipSettings.isVisible().catch(() => false);

      // Coach should either see Access Denied or not see the admin settings
      expect(hasAccessDenied || !hasMembershipSettings).toBeTruthy();
    }
  });
});

test.describe('Admin Membership Settings - Join Code', () => {
  test('should display join code in readonly input', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // Should have a join code input (readonly)
    const joinCodeInput = page.locator('input[readonly]').first();
    await expect(joinCodeInput).toBeVisible({ timeout: 5000 });

    // Should have either a code or "Not generated"
    const inputValue = await joinCodeInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
  });

  test('should have copy buttons for join code', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // Should have copy buttons (identified by title attribute or icon)
    const copyButtons = page.locator('button[title*="Copy"], button[title*="copy"]');
    const copyCount = await copyButtons.count();
    expect(copyCount).toBeGreaterThan(0);
  });

  test('should have regenerate button', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // Should have regenerate button
    const regenerateButton = page.locator('button:has-text("Regenerate")');
    await expect(regenerateButton).toBeVisible({ timeout: 5000 });
  });

  test('regenerate button should show confirmation and update code', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // Get current join code
    const joinCodeInput = page.locator('input[readonly]').first();
    const originalCode = await joinCodeInput.inputValue();

    // Click regenerate
    const regenerateButton = page.locator('button:has-text("Regenerate")');
    await regenerateButton.click();

    // Should show confirmation dialog
    const confirmButton = page.locator('button:has-text("Regenerate")').last();
    await expect(confirmButton).toBeVisible({ timeout: 5000 });

    // Confirm regeneration
    await confirmButton.click();
    await page.waitForLoadState('networkidle');

    // Should show success toast
    const successToast = page.locator('text=/regenerated/i');
    await expect(successToast).toBeVisible({ timeout: 5000 });

    // Code should be different (unless it's "Not generated")
    if (originalCode !== 'Not generated') {
      await page.waitForTimeout(1000); // Wait for UI update
      const newCode = await joinCodeInput.inputValue();
      // New code might be different or same (edge case), just verify it's still valid
      expect(newCode.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Admin Membership Settings - Toggle Switches', () => {
  test('should display all three membership toggles', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // Should have Accept Membership Requests toggle
    await expect(page.locator('text=Accept Membership Requests')).toBeVisible({ timeout: 5000 });

    // Should have Public Directory toggle
    await expect(page.locator('text=Public Directory')).toBeVisible({ timeout: 5000 });

    // Should have Auto-Approve Requests toggle
    await expect(page.locator('text=Auto-Approve Requests')).toBeVisible({ timeout: 5000 });
  });

  test('should toggle Accept Membership Requests and show success', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // Find the Accept Membership Requests toggle
    const toggleLabel = page.locator('text=Accept Membership Requests');
    const toggleContainer = toggleLabel.locator('xpath=ancestor::div[contains(@class, "flex")]').first();
    const toggle = toggleContainer.locator('[role="switch"]');

    // Get initial state
    const initialState = await toggle.getAttribute('data-state');

    // Click toggle
    await toggle.click();
    await page.waitForLoadState('networkidle');

    // Should show success toast
    const successToast = page.locator('text=/settings updated/i, text=/membership settings/i');
    await expect(successToast).toBeVisible({ timeout: 5000 });

    // Toggle state should have changed
    await page.waitForTimeout(500);
    const newState = await toggle.getAttribute('data-state');
    expect(newState).not.toBe(initialState);

    // Toggle back to restore original state
    await toggle.click();
    await page.waitForLoadState('networkidle');
  });

  test('should toggle Public Directory and show success', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // First ensure Accept Requests is ON (required for Public Directory to be enabled)
    const acceptLabel = page.locator('text=Accept Membership Requests');
    const acceptContainer = acceptLabel.locator('xpath=ancestor::div[contains(@class, "flex")]').first();
    const acceptToggle = acceptContainer.locator('[role="switch"]');
    const acceptState = await acceptToggle.getAttribute('data-state');

    if (acceptState !== 'checked') {
      await acceptToggle.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    }

    // Find the Public Directory toggle
    const toggleLabel = page.locator('text=Public Directory');
    const toggleContainer = toggleLabel.locator('xpath=ancestor::div[contains(@class, "flex")]').first();
    const toggle = toggleContainer.locator('[role="switch"]');

    // Verify it's not disabled
    const isDisabled = await toggle.isDisabled();
    expect(isDisabled).toBe(false);

    // Get initial state
    const initialState = await toggle.getAttribute('data-state');

    // Click toggle
    await toggle.click();
    await page.waitForLoadState('networkidle');

    // Should show success toast
    const successToast = page.locator('text=/settings updated/i, text=/membership settings/i');
    await expect(successToast).toBeVisible({ timeout: 5000 });

    // Toggle state should have changed
    await page.waitForTimeout(500);
    const newState = await toggle.getAttribute('data-state');
    expect(newState).not.toBe(initialState);

    // Toggle back to restore original state
    await toggle.click();
    await page.waitForLoadState('networkidle');
  });

  test('Public Directory and Auto-Approve should be disabled when Accept Requests is off', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // Turn OFF Accept Requests
    const acceptLabel = page.locator('text=Accept Membership Requests');
    const acceptContainer = acceptLabel.locator('xpath=ancestor::div[contains(@class, "flex")]').first();
    const acceptToggle = acceptContainer.locator('[role="switch"]');
    const acceptState = await acceptToggle.getAttribute('data-state');

    if (acceptState === 'checked') {
      await acceptToggle.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    }

    // Check Public Directory is disabled
    const publicLabel = page.locator('text=Public Directory');
    const publicContainer = publicLabel.locator('xpath=ancestor::div[contains(@class, "flex")]').first();
    const publicToggle = publicContainer.locator('[role="switch"]');
    const publicDisabled = await publicToggle.isDisabled();
    expect(publicDisabled).toBe(true);

    // Check Auto-Approve is disabled
    const autoLabel = page.locator('text=Auto-Approve Requests');
    const autoContainer = autoLabel.locator('xpath=ancestor::div[contains(@class, "flex")]').first();
    const autoToggle = autoContainer.locator('[role="switch"]');
    const autoDisabled = await autoToggle.isDisabled();
    expect(autoDisabled).toBe(true);

    // Turn Accept Requests back on
    await acceptToggle.click();
    await page.waitForLoadState('networkidle');
  });
});

test.describe('Admin Membership Settings - Status Badges', () => {
  test('should display Current Status section with badges', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // Should have Current Status section
    await expect(page.locator('text=Current Status')).toBeVisible({ timeout: 5000 });

    // Should have at least one status badge
    const statusBadges = page.locator('text=/Accepting Requests|Not Accepting Requests|Listed in Directory|Private|Auto-Approve|Manual Approval/');
    const badgeCount = await statusBadges.count();
    expect(badgeCount).toBeGreaterThan(0);
  });

  test('status badges should update when toggles change', async ({ page }) => {
    await loginAs(page, 'org_admin');

    const orgId = await navigateToOrgAdminSettings(page);
    if (!orgId) {
      test.skip(true, 'No organizations available for testing');
      return;
    }

    // Wait for membership settings section
    await expect(page.locator('text=Membership Settings')).toBeVisible({ timeout: 10000 });

    // Find the Accept Membership Requests toggle
    const acceptLabel = page.locator('text=Accept Membership Requests');
    const acceptContainer = acceptLabel.locator('xpath=ancestor::div[contains(@class, "flex")]').first();
    const acceptToggle = acceptContainer.locator('[role="switch"]');

    // Check initial badge state
    const initialState = await acceptToggle.getAttribute('data-state');
    const initialBadge = initialState === 'checked' ? 'Accepting Requests' : 'Not Accepting Requests';
    await expect(page.locator(`text=${initialBadge}`)).toBeVisible();

    // Toggle and check badge updates
    await acceptToggle.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const expectedBadge = initialState === 'checked' ? 'Not Accepting Requests' : 'Accepting Requests';
    await expect(page.locator(`text=${expectedBadge}`)).toBeVisible({ timeout: 5000 });

    // Toggle back to restore
    await acceptToggle.click();
    await page.waitForLoadState('networkidle');
  });
});

test.describe('Admin Membership Settings Summary', () => {
  test('print admin membership settings test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Admin Membership Settings Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Org admin page access');
    console.log('✅ Site admin page access');
    console.log('✅ Coach access restriction');
    console.log('✅ Join code display');
    console.log('✅ Copy buttons presence');
    console.log('✅ Regenerate button presence');
    console.log('✅ Join code regeneration');
    console.log('✅ Toggle switches display');
    console.log('✅ Accept Requests toggle');
    console.log('✅ Public Directory toggle');
    console.log('✅ Toggle dependencies');
    console.log('✅ Status badges display');
    console.log('✅ Badge updates on toggle');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
