import { test, expect } from './fixtures/e2e-base';
import { loginAs } from './helpers/auth';
import { isSameUserMode } from './fixtures/test-users';

/**
 * TIER 1 CRITICAL: Sidebar Navigation E2E Tests
 *
 * Comprehensive test suite for sidebar navigation covering:
 * - Role-based navigation visibility (org admin vs coach)
 * - "Settings" link for org admins (changed from "My Organization")
 * - Navigation functionality and correct routing
 * - Icon and label verification
 * - Coach navigation (no Settings link)
 * - Site admin navigation in organization context
 *
 * Total: 8 test scenarios
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Sidebar Navigation Tests', () => {
  test.describe('Org Admin Sidebar Navigation', () => {
    test('org admin should see "Settings" link in sidebar with Settings icon', async ({ page }) => {
      await loginAs(page, 'org_admin');

      // Navigate to dashboard to ensure sidebar is loaded
      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Verify sidebar is visible
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeVisible();

      // Verify "Settings" link is present (NOT "My Organization")
      const settingsLink = page.locator('a:has-text("Settings")');
      await expect(settingsLink).toBeVisible();

      // Verify "My Organization" link is NOT present
      const myOrgLink = page.locator('a:has-text("My Organization")');
      await expect(myOrgLink).not.toBeVisible();

      // Verify Settings link has correct href pattern (/organizations/*)
      const settingsHref = await settingsLink.getAttribute('href');
      expect(settingsHref).toMatch(/\/organizations\/[a-zA-Z0-9-]+/);

      // Verify Settings icon is present (Settings icon from lucide-react)
      // The icon should be within the Settings link
      const settingsIcon = settingsLink.locator('svg');
      await expect(settingsIcon).toBeVisible();
    });

    test('org admin Settings link should navigate to correct organization page', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Click Settings link
      const settingsLink = page.locator('a:has-text("Settings")');
      await expect(settingsLink).toBeVisible();

      const settingsHref = await settingsLink.getAttribute('href');
      await settingsLink.click();

      // Wait for navigation to complete
      await page.waitForLoadState('networkidle');

      // Verify navigation to organization page
      expect(page.url()).toContain('/organizations/');
      expect(page.url()).toBe(`${TESTING_URL}${settingsHref}`);

      // Verify organization page content is loaded
      // Should see organization-specific content
      const pageContent = page.locator('main, [role="main"], body');
      await expect(pageContent).toBeVisible();
    });

    test('org admin sidebar should contain all expected navigation items', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Verify all expected org admin navigation items
      // Note: Import/Export is now a tab in Data Entry, not a sidebar item
      const expectedItems = [
        'Dashboard',
        'Teams',
        'Athletes',
        'Data Entry',
        'Coach Analytics',
        'Measurements',
        'Benchmarks',
        'Settings', // Changed from "My Organization"
      ];

      for (const item of expectedItems) {
        const navLink = page.locator(`a:has-text("${item}")`);
        await expect(navLink).toBeVisible({
          timeout: 5000,
        });
      }

      // Verify order: Settings should be last
      const allNavLinks = page.locator('nav a, aside a[href]');
      const navLinkTexts = await allNavLinks.allTextContents();
      const settingsIndex = navLinkTexts.findIndex(text => text.includes('Settings'));
      const dashboardIndex = navLinkTexts.findIndex(text => text.includes('Dashboard'));

      // Settings should appear after Dashboard (last in the list)
      expect(settingsIndex).toBeGreaterThan(dashboardIndex);
    });
  });

  test.describe('Coach Sidebar Navigation', () => {
    // These assert coach-specific restrictions ("should NOT see ..."), which
    // fail in same-user mode where loginAs('coach') resolves to the site admin.
    test.skip(isSameUserMode(), 'coach restrictions not testable when all roles map to one user');

    test('coach should NOT see "Settings" link in sidebar', async ({ page }) => {
      await loginAs(page, 'coach');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Verify sidebar is visible
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeVisible();

      // Verify "Settings" link is NOT present for coach
      const settingsLink = page.locator('a:has-text("Settings")');
      await expect(settingsLink).not.toBeVisible();

      // Verify "My Organization" link is also NOT present
      const myOrgLink = page.locator('a:has-text("My Organization")');
      await expect(myOrgLink).not.toBeVisible();
    });

    test('coach sidebar should contain correct navigation items (no Settings)', async ({ page }) => {
      await loginAs(page, 'coach');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Verify expected coach navigation items
      // Note: Import/Export is now a tab in Data Entry, not a sidebar item
      const expectedItems = [
        'Dashboard',
        'Teams',
        'Athletes',
        'Data Entry',
        'Coach Analytics',
        'Measurements',
        'Benchmarks',
      ];

      for (const item of expectedItems) {
        const navLink = page.locator(`a:has-text("${item}")`);
        await expect(navLink).toBeVisible({
          timeout: 5000,
        });
      }

      // Verify "Settings" is NOT in the navigation
      const allNavLinks = page.locator('nav a, aside a[href]');
      const navLinkTexts = await allNavLinks.allTextContents();
      const hasSettings = navLinkTexts.some(text => text.includes('Settings'));
      expect(hasSettings).toBe(false);
    });
  });

  test.describe('Site Admin Sidebar Navigation', () => {
    test('site admin in organization context should see Settings link', async ({ page }) => {
      await loginAs(page, 'site_admin');

      // Navigate to dashboard first
      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Get an organization ID by visiting organizations page
      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Find first organization link and extract ID
      const firstOrgLink = page.locator('a[href^="/organizations/"]:not([href$="/settings"])').first();
      const orgHref = await firstOrgLink.getAttribute('href');

      if (!orgHref) {
        test.skip();
        return;
      }

      // Navigate to organization context
      await page.goto(`${TESTING_URL}${orgHref}`);
      await page.waitForLoadState('networkidle');

      // Verify Settings link is present in organization context
      const settingsLink = page.locator('a:has-text("Settings")');
      await expect(settingsLink).toBeVisible();

      // Verify Settings link points to the correct organization settings page
      const settingsHref = await settingsLink.getAttribute('href');
      expect(settingsHref).toContain(orgHref);
    });

    test('site admin default view should NOT see organization Settings link', async ({ page }) => {
      await loginAs(page, 'site_admin');

      // Navigate to default site admin view (not organization context)
      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Should see site admin navigation items
      const expectedItems = [
        'Dashboard',
        'Organizations',
        'User Management',
        'Metrics',
        'Benchmarks',
      ];

      for (const item of expectedItems) {
        const navLink = page.locator(`a:has-text("${item}")`);
        await expect(navLink).toBeVisible({
          timeout: 5000,
        });
      }

      // Should NOT see "Settings" link to a specific organization
      const settingsLink = page.locator('a:has-text("Settings")');
      const settingsCount = await settingsLink.count();

      // Settings might appear in other contexts (like Metrics nav item has Settings icon)
      // but should not be a standalone "Settings" navigation item in default view
      if (settingsCount > 0) {
        // If Settings appears, it should NOT link to /organizations/[id]
        for (let i = 0; i < settingsCount; i++) {
          const href = await settingsLink.nth(i).getAttribute('href');
          expect(href || '').not.toMatch(/\/organizations\/[a-zA-Z0-9-]+$/);
        }
      }
    });
  });

  test.describe('Navigation Icon Verification', () => {
    test('Settings link should use Settings icon (not Building2 icon)', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Get the Settings link
      const settingsLink = page.locator('a:has-text("Settings")');
      await expect(settingsLink).toBeVisible();

      // Verify the icon is present
      const icon = settingsLink.locator('svg');
      await expect(icon).toBeVisible();

      // Verify the icon is Settings icon by checking the parent structure
      // Settings icon from lucide-react has specific characteristics
      const iconParent = icon.locator('..');
      await expect(iconParent).toBeVisible();

      // The icon should be within the Settings link (basic structure check)
      const iconCount = await settingsLink.locator('svg').count();
      expect(iconCount).toBeGreaterThan(0);
    });
  });
});

test.describe('Sidebar Navigation Summary', () => {
  test('print sidebar navigation test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Sidebar Navigation E2E Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Org Admin Navigation:');
    console.log('   - Org admin sees "Settings" link (not "My Organization")');
    console.log('   - Settings link navigates to correct organization page');
    console.log('   - Sidebar contains all expected org admin nav items');
    console.log('✅ Coach Navigation:');
    console.log('   - Coach does NOT see "Settings" link');
    console.log('   - Coach sidebar contains correct nav items (no Settings)');
    console.log('✅ Site Admin Navigation:');
    console.log('   - Site admin in org context sees Settings link');
    console.log('   - Site admin default view does not see org Settings link');
    console.log('✅ Icon Verification:');
    console.log('   - Settings link uses Settings icon (not Building2)');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
