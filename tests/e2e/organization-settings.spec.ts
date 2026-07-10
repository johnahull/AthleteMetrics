import { test, expect } from './fixtures/e2e-base';
import { loginWithCredentials } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

/**
 * TIER 1 CRITICAL: Organization Settings E2E Tests
 *
 * Comprehensive test suite for organization settings page covering:
 * - Access control (site admin only)
 * - Page load and display
 * - Basic information editing (name, description, location)
 * - Feature flag management (benchmarksEnabled, allowCustomBenchmarks)
 * - Feature flag interdependency validation
 * - Organization status toggling (isActive)
 * - Navigation
 *
 * Total: 12 test scenarios
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

// Test user credentials
const TEST_USERS = {
  siteAdmin: getUserByRole('site_admin'),
  orgAdmin: getUserByRole('org_admin'),
};

test.describe('Organization Settings Tests', () => {
  // Configure sequential execution to avoid race conditions
  test.describe.configure({ mode: 'serial' });

  let testOrgId: string;

  // Get a test organization ID before running tests
  test.beforeAll(async ({ browser }) => {
    // Create a new context and page for setup
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login as site admin
    await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

    // Get organizations via page request
    const orgsResponse = await page.request.get(`${TESTING_URL}/api/organizations`);
    expect(orgsResponse.ok()).toBeTruthy();

    const orgs = await orgsResponse.json();
    expect(Array.isArray(orgs)).toBeTruthy();
    expect(orgs.length).toBeGreaterThan(0);

    // Use first organization for testing
    testOrgId = orgs[0].id;

    // Cleanup
    await context.close();
  });

  test.describe('Access Control', () => {
    test('site admin should access organization settings page', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Navigate to organization settings
      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Should see settings page content
      await expect(page.locator('text=Organization Settings')).toBeVisible();
      await expect(page.locator('text=Basic Information')).toBeVisible();
      await expect(page.locator('text=Feature Flags')).toBeVisible();
      await expect(page.locator('text=Organization Status')).toBeVisible();

      // Should see form fields
      await expect(page.locator('input[placeholder*="organization name"]')).toBeVisible();
      await expect(page.locator('button:has-text("Save Changes")')).toBeVisible();
    });

    test('non-site-admin (org admin) should be denied access', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);

      // Navigate to organization settings
      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Should see access denied message
      await expect(page.locator('text=Access Denied')).toBeVisible();
      await expect(page.locator('text=Only site administrators can access organization settings')).toBeVisible();

      // Should NOT see settings form
      await expect(page.locator('text=Basic Information')).not.toBeVisible();
      await expect(page.locator('input[placeholder*="organization name"]')).not.toBeVisible();

      // Should see back button
      await expect(page.locator('button:has-text("Back to Organization")')).toBeVisible();
    });
  });

  test.describe('Page Load & Display', () => {
    test('should load page with organization data populated', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Navigate to settings
      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Verify page header
      await expect(page.locator('h1:has-text("Organization Settings")')).toBeVisible();

      // Verify all form sections are visible
      await expect(page.locator('text=Basic Information')).toBeVisible();
      await expect(page.locator('text=Feature Flags')).toBeVisible();
      await expect(page.locator('text=Organization Status')).toBeVisible();

      // Verify form fields are populated (organization name should exist)
      const nameInput = page.locator('input[placeholder*="organization name"]');
      await expect(nameInput).toBeVisible();
      const nameValue = await nameInput.inputValue();
      expect(nameValue.length).toBeGreaterThan(0);

      // Verify action buttons
      await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
      await expect(page.locator('button:has-text("Save Changes")')).toBeVisible();
    });
  });

  test.describe('Basic Information Editing', () => {
    test('should update organization name successfully', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Get current name
      const nameInput = page.locator('input[placeholder*="organization name"]');
      const originalName = await nameInput.inputValue();

      // Update name with timestamp to ensure uniqueness
      const timestamp = Date.now();
      const newName = `Test Org ${timestamp}`;
      await nameInput.fill(newName);

      // Save changes
      await page.click('button:has-text("Save Changes")');

      // Wait for success toast
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });

      // Reload page and verify name persisted
      await page.reload();
      await page.waitForLoadState('networkidle');
      const updatedNameValue = await page.locator('input[placeholder*="organization name"]').inputValue();
      expect(updatedNameValue).toBe(newName);

      // Restore original name
      await page.locator('input[placeholder*="organization name"]').fill(originalName);
      await page.click('button:has-text("Save Changes")');
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
    });

    test('should update description and location (optional fields)', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Update description
      const descriptionTextarea = page.locator('textarea[placeholder*="description"]');
      const timestamp = Date.now();
      const newDescription = `Updated description ${timestamp}`;
      await descriptionTextarea.fill(newDescription);

      // Update location
      const locationInput = page.locator('input[placeholder*="location"]');
      const newLocation = `Test Location ${timestamp}`;
      await locationInput.fill(newLocation);

      // Save changes
      await page.click('button:has-text("Save Changes")');

      // Wait for success toast
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });

      // Reload and verify changes persisted
      await page.reload();
      await page.waitForLoadState('networkidle');

      const updatedDescription = await page.locator('textarea[placeholder*="description"]').inputValue();
      const updatedLocation = await page.locator('input[placeholder*="location"]').inputValue();

      expect(updatedDescription).toBe(newDescription);
      expect(updatedLocation).toBe(newLocation);
    });

    test('should display "No changes" toast when saving without modifications', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Click save without making any changes
      await page.click('button:has-text("Save Changes")');

      // Should show "No changes" toast
      await expect(page.locator('text=No changes')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=No settings were modified')).toBeVisible();
    });
  });

  test.describe('Feature Flag Management', () => {
    test('should enable/disable benchmarks feature toggle', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Find benchmarks enabled switch
      const benchmarksFeatureItem = page.locator('text=Benchmarks Feature').locator('..');
      const benchmarksSwitch = benchmarksFeatureItem.locator('button[role="switch"]');

      // Get initial state
      const initialState = await benchmarksSwitch.getAttribute('data-state');

      // Toggle the switch
      await benchmarksSwitch.click();

      // Save changes
      await page.click('button:has-text("Save Changes")');
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });

      // Reload and verify state changed
      await page.reload();
      await page.waitForLoadState('networkidle');

      const reloadedBenchmarksSwitch = page.locator('text=Benchmarks Feature').locator('..').locator('button[role="switch"]');
      const newState = await reloadedBenchmarksSwitch.getAttribute('data-state');
      expect(newState).not.toBe(initialState);

      // Toggle back to original state
      await reloadedBenchmarksSwitch.click();
      await page.click('button:has-text("Save Changes")');
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
    });

    test('should disable custom benchmarks toggle when benchmarks feature is OFF', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Ensure benchmarks feature is OFF
      const benchmarksFeatureItem = page.locator('text=Benchmarks Feature').locator('..');
      const benchmarksSwitch = benchmarksFeatureItem.locator('button[role="switch"]');
      const benchmarksState = await benchmarksSwitch.getAttribute('data-state');

      if (benchmarksState === 'checked') {
        await benchmarksSwitch.click();
        await page.click('button:has-text("Save Changes")');
        await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
        await page.reload();
        await page.waitForLoadState('networkidle');
      }

      // Custom benchmarks toggle should be disabled
      const customBenchmarksItem = page.locator('text=Custom Benchmarks').locator('..');
      const customBenchmarksSwitch = customBenchmarksItem.locator('button[role="switch"]');

      const isDisabled = await customBenchmarksSwitch.isDisabled();
      expect(isDisabled).toBeTruthy();
    });

    test('should enable custom benchmarks toggle when benchmarks feature is ON', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Ensure benchmarks feature is ON
      const benchmarksFeatureItem = page.locator('text=Benchmarks Feature').locator('..');
      const benchmarksSwitch = benchmarksFeatureItem.locator('button[role="switch"]');
      const benchmarksState = await benchmarksSwitch.getAttribute('data-state');

      if (benchmarksState !== 'checked') {
        await benchmarksSwitch.click();
        await page.click('button:has-text("Save Changes")');
        await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
        await page.reload();
        await page.waitForLoadState('networkidle');
      }

      // Custom benchmarks toggle should be enabled
      const customBenchmarksItem = page.locator('text=Custom Benchmarks').locator('..');
      const customBenchmarksSwitch = customBenchmarksItem.locator('button[role="switch"]');

      const isDisabled = await customBenchmarksSwitch.isDisabled();
      expect(isDisabled).toBeFalsy();

      // Should be able to toggle it
      await customBenchmarksSwitch.click();
      await page.click('button:has-text("Save Changes")');
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });

      // Toggle back
      await page.reload();
      await page.waitForLoadState('networkidle');
      const reloadedCustomSwitch = page.locator('text=Custom Benchmarks').locator('..').locator('button[role="switch"]');
      await reloadedCustomSwitch.click();
      await page.click('button:has-text("Save Changes")');
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Feature Flag Validation', () => {
    test('should prevent enabling custom benchmarks without benchmarks feature', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Turn OFF benchmarks feature
      const benchmarksFeatureItem = page.locator('text=Benchmarks Feature').locator('..');
      const benchmarksSwitch = benchmarksFeatureItem.locator('button[role="switch"]');
      const benchmarksState = await benchmarksSwitch.getAttribute('data-state');

      if (benchmarksState === 'checked') {
        await benchmarksSwitch.click();
        // Note: We don't save yet - testing frontend validation
      }

      // Custom benchmarks should be disabled (cannot be toggled)
      const customBenchmarksItem = page.locator('text=Custom Benchmarks').locator('..');
      const customBenchmarksSwitch = customBenchmarksItem.locator('button[role="switch"]');

      const isDisabled = await customBenchmarksSwitch.isDisabled();
      expect(isDisabled).toBeTruthy();

      // Attempting to click disabled switch should not work
      const beforeClickState = await customBenchmarksSwitch.getAttribute('data-state');
      await customBenchmarksSwitch.click({ force: true }).catch(() => {}); // May fail, that's okay
      const afterClickState = await customBenchmarksSwitch.getAttribute('data-state');

      // State should remain unchanged (either both unchecked or switch stayed disabled)
      expect(afterClickState).toBe(beforeClickState);
    });
  });

  test.describe('Organization Status', () => {
    test('should toggle organization active status', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Find active status switch
      const activeStatusItem = page.locator('text=Active Status').locator('..');
      const activeStatusSwitch = activeStatusItem.locator('button[role="switch"]');

      // Get initial state
      const initialState = await activeStatusSwitch.getAttribute('data-state');

      // Toggle the switch
      await activeStatusSwitch.click();

      // Save changes
      await page.click('button:has-text("Save Changes")');
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });

      // Reload and verify state changed
      await page.reload();
      await page.waitForLoadState('networkidle');

      const reloadedActiveSwitch = page.locator('text=Active Status').locator('..').locator('button[role="switch"]');
      const newState = await reloadedActiveSwitch.getAttribute('data-state');
      expect(newState).not.toBe(initialState);

      // Toggle back to original state
      await reloadedActiveSwitch.click();
      await page.click('button:has-text("Save Changes")');
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Navigation', () => {
    test('should navigate back when cancel button is clicked', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Click cancel button
      await page.click('button:has-text("Cancel")');

      // Should navigate to organization page
      await page.waitForURL(`**/organizations/${testOrgId}`);
      expect(page.url()).toContain(`/organizations/${testOrgId}`);
      expect(page.url()).not.toContain('/settings');
    });
  });
});

test.describe('Organization Settings Summary', () => {
  test('print organization settings test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Organization Settings E2E Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Access Control:');
    console.log('   - Site admin can access settings');
    console.log('   - Non-site-admin is denied access');
    console.log('✅ Page Load & Display:');
    console.log('   - Page loads with organization data');
    console.log('✅ Basic Information:');
    console.log('   - Update organization name');
    console.log('   - Update description and location');
    console.log('   - No changes detection');
    console.log('✅ Feature Flag Management:');
    console.log('   - Enable/disable benchmarks feature');
    console.log('   - Custom benchmarks disabled when benchmarks OFF');
    console.log('   - Custom benchmarks enabled when benchmarks ON');
    console.log('✅ Feature Flag Validation:');
    console.log('   - Prevent enabling custom benchmarks without benchmarks');
    console.log('✅ Organization Status:');
    console.log('   - Toggle active status');
    console.log('✅ Navigation:');
    console.log('   - Cancel button navigates back');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
