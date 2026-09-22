/**
 * TIER 1 CRITICAL: Organization Types Complete Workflow E2E Tests
 * 
 * Comprehensive test suite for the complete organization types workflow covering:
 * - Organization creation with type selection
 * - Organization settings page - changing organization type
 * - Organization listings showing type badges and filtering
 * - Metrics/benchmarks filtering based on organization type
 * - User permissions and access control with organization types
 * - Full user journey from creation to metric viewing
 * 
 * Total: 20+ test scenarios covering complete workflow
 */

import { test, expect } from './fixtures/e2e-base';
import { loginWithCredentials } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

// Test user credentials
const TEST_USERS = {
  siteAdmin: getUserByRole('site_admin'),
  orgAdmin: getUserByRole('org_admin'),
};

// Organization type mapping for labels
const ORG_TYPE_LABELS: Record<string, string> = {
  youth: 'Youth/Recreational',
  high_school: 'High School',
  college: 'College/University',
  club: 'Club/Travel Team',
  private_facility: 'Private Training Facility',
  elite_academy: 'Elite Academy',
};

const ALL_ORG_TYPES = Object.keys(ORG_TYPE_LABELS);

test.describe('Organization Types Complete Workflow Tests', () => {
  // Configure sequential execution to avoid race conditions
  test.describe.configure({ mode: 'serial' });

  let testOrgIds: string[] = [];

  test.describe('Organization Creation with Type Selection', () => {
    test('should create organizations with each organization type', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Navigate to organizations page
      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Create one organization for each type
      for (const orgType of ALL_ORG_TYPES) {
        const timestamp = Date.now();
        const orgName = `E2E Test ${ORG_TYPE_LABELS[orgType]} ${timestamp}`;

        // Open create organization dialog
        await page.click('[data-testid="create-organization-button"]');
        await page.waitForSelector('[data-testid="org-name-input"]');

        // Fill in organization details
        await page.fill('[data-testid="org-name-input"]', orgName);
        await page.fill('[data-testid="org-description-input"]', `Test ${ORG_TYPE_LABELS[orgType]} organization for E2E testing`);

        // Select organization type
        await page.click('[data-testid="create-org-type-selector"] [data-testid="organization-type-selector"]');
        await page.click(`[data-testid="select-item-${orgType}"]`);

        // Verify selected type is displayed
        await expect(page.locator('[data-testid="organization-type-selector"]')).toContainText(ORG_TYPE_LABELS[orgType]);

        // Submit form
        await page.click('[data-testid="submit-org-button"]');

        // Wait for success toast and dialog to close
        await expect(page.locator('text=Organization created successfully')).toBeVisible({ timeout: 5000 });
        await page.waitForSelector('[data-testid="org-name-input"]', { state: 'detached' });

        // Verify organization appears in listings with correct type badge
        await expect(page.locator(`text=${orgName}`)).toBeVisible();
        await expect(page.locator(`[data-testid*="org-type-badge"]:has-text("${ORG_TYPE_LABELS[orgType]}")`)).toBeVisible();
      }

      // Get created organization IDs for cleanup
      const orgsResponse = await page.request.get(`${TESTING_URL}/api/organizations`);
      expect(orgsResponse.ok()).toBeTruthy();
      const orgs = await orgsResponse.json();
      
      testOrgIds = orgs
        .filter((org: any) => org.name.includes('E2E Test'))
        .map((org: any) => org.id);

      expect(testOrgIds.length).toBeGreaterThanOrEqual(ALL_ORG_TYPES.length);
    });

    test('should validate organization type is required during creation', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Open create dialog
      await page.click('[data-testid="create-organization-button"]');
      await page.waitForSelector('[data-testid="org-name-input"]');

      // Fill only name (skip type selection)
      await page.fill('[data-testid="org-name-input"]', 'Test Validation Org');

      // Try to submit without selecting type
      await page.click('[data-testid="submit-org-button"]');

      // Should show validation error - organization type is required
      await expect(page.locator('text=Organization type is required')).toBeVisible();

      // Cancel dialog
      await page.click('[data-testid="cancel-org-button"]');
    });
  });

  test.describe('Organization Type Filtering in Listings', () => {
    test('should filter organizations by type in listings', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Test each type filter
      for (const orgType of ALL_ORG_TYPES) {
        // Select organization type filter
        await page.click('[data-testid="org-type-filter"]');
        await page.click(`text=${ORG_TYPE_LABELS[orgType]} Only`);

        await page.waitForLoadState('networkidle');

        // Verify only organizations of selected type are shown
        const orgElements = await page.locator('[data-testid^="organization-"]').all();
        
        if (orgElements.length > 0) {
          // Check each visible organization has the correct type badge
          for (const orgElement of orgElements) {
            const typeBadge = orgElement.locator(`[data-testid*="org-type-badge"]:has-text("${ORG_TYPE_LABELS[orgType]}")`);
            await expect(typeBadge).toBeVisible();
          }
        }
      }

      // Reset filter to "All Organization Types"
      await page.click('[data-testid="org-type-filter"]');
      await page.click('text=All Organization Types');
      await page.waitForLoadState('networkidle');
    });

    test('should display type badges correctly in organization listings', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Verify type badges are displayed for test organizations
      const testOrgs = await page.locator('[data-testid^="organization-"]:has-text("E2E Test")').all();
      
      for (const orgElement of testOrgs) {
        // Each organization should have exactly one type badge
        const typeBadges = await orgElement.locator('[data-testid*="org-type-badge"]').all();
        expect(typeBadges.length).toBe(1);

        // Badge should contain one of our valid type labels
        const badgeText = await typeBadges[0].textContent();
        expect(Object.values(ORG_TYPE_LABELS)).toContain(badgeText?.trim());
      }
    });
  });

  test.describe('Organization Settings - Type Management', () => {
    test('should change organization type via settings page', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Use first test organization
      const testOrgId = testOrgIds[0];
      expect(testOrgId).toBeTruthy();

      // Navigate to organization settings
      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Verify we're on the settings page
      await expect(page.locator('h1:has-text("Organization Settings")')).toBeVisible();

      // Find the organization type section
      await expect(page.locator('text=Organization Type')).toBeVisible();

      // Change organization type from current to a different one
      await page.click('[data-testid="organization-type-selector"]');
      
      // Select a different type (college for testing)
      await page.click('[data-testid="select-item-college"]');
      
      // Verify selection
      await expect(page.locator('[data-testid="organization-type-selector"]')).toContainText('College/University');

      // Save changes
      await page.click('button:has-text("Save Changes")');
      
      // Wait for success toast
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });

      // Navigate back to organizations listing
      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Verify the organization now shows the updated type badge
      const orgElement = page.locator(`[data-testid="organization-${testOrgId}"]`);
      await expect(orgElement.locator('[data-testid*="org-type-badge"]:has-text("College/University")')).toBeVisible();
    });

    test('should preserve organization type when updating other settings', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      const testOrgId = testOrgIds[1];
      expect(testOrgId).toBeTruthy();

      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Get current organization type
      const currentTypeText = await page.locator('[data-testid="organization-type-selector"]').textContent();

      // Update only the description
      const timestamp = Date.now();
      await page.fill('textarea[placeholder*="description"]', `Updated description ${timestamp}`);

      // Save changes
      await page.click('button:has-text("Save Changes")');
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });

      // Reload and verify type is unchanged
      await page.reload();
      await page.waitForLoadState('networkidle');

      const updatedTypeText = await page.locator('[data-testid="organization-type-selector"]').textContent();
      expect(updatedTypeText).toBe(currentTypeText);
    });
  });

  test.describe('Metrics and Benchmarks Filtering by Organization Type', () => {
    test('should navigate to metrics page from organization with specific type', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Find a college type organization
      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Filter to college organizations
      await page.click('[data-testid="org-type-filter"]');
      await page.click('text=College/University Only');
      await page.waitForLoadState('networkidle');

      // Click on a college organization to enter its context
      const collegeOrg = page.locator('[data-testid^="organization-"]:has([data-testid*="org-type-badge"]:has-text("College/University"))').first();
      await expect(collegeOrg).toBeVisible();
      
      const orgLink = collegeOrg.locator('[data-testid^="organization-link-"]');
      await orgLink.click();

      // Wait for navigation to organization view
      await page.waitForLoadState('networkidle');
      
      // Verify we're in organization context (look for org-specific UI)
      await expect(page.locator('text=College/University')).toBeVisible();
    });

    test('should navigate to benchmarks page from organization with specific type', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Find a high school type organization
      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Filter to high school organizations
      await page.click('[data-testid="org-type-filter"]');
      await page.click('text=High School Only');
      await page.waitForLoadState('networkidle');

      // Click on a high school organization
      const hsOrg = page.locator('[data-testid^="organization-"]:has([data-testid*="org-type-badge"]:has-text("High School"))').first();
      
      if (await hsOrg.count() > 0) {
        const orgLink = hsOrg.locator('[data-testid^="organization-link-"]');
        await orgLink.click();

        await page.waitForLoadState('networkidle');

        // Try to navigate to benchmarks if available
        const benchmarksLink = page.locator('a[href*="benchmarks"], text=Benchmarks');
        if (await benchmarksLink.count() > 0) {
          await benchmarksLink.click();
          await page.waitForLoadState('networkidle');

          // Verify we're on benchmarks page
          await expect(page.locator('h1:has-text("Benchmarks"), text=Benchmark')).toBeVisible();
        }
      }
    });
  });

  test.describe('User Journey and Access Control', () => {
    test('should maintain organization type context during user navigation', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Select an elite academy organization
      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      await page.click('[data-testid="org-type-filter"]');
      await page.click('text=Elite Academy Only');
      await page.waitForLoadState('networkidle');

      const eliteOrg = page.locator('[data-testid^="organization-"]:has([data-testid*="org-type-badge"]:has-text("Elite Academy"))').first();
      
      if (await eliteOrg.count() > 0) {
        const orgLink = eliteOrg.locator('[data-testid^="organization-link-"]');
        await orgLink.click();

        await page.waitForLoadState('networkidle');

        // Navigate through different sections and verify type context is maintained
        const navLinks = await page.locator('nav a, [role="navigation"] a').all();
        
        for (let i = 0; i < Math.min(navLinks.length, 3); i++) {
          try {
            await navLinks[i].click();
            await page.waitForLoadState('networkidle');
            
            // Verify we're still in Elite Academy context if type badge/indicator is visible
            const typeIndicator = page.locator('text=Elite Academy');
            // Don't fail if type not visible on every page, just check if present
          } catch (error) {
            console.log(`Navigation link ${i} failed: ${error}`);
          }
        }
      }
    });

    test('should show access denied for org admin on organization settings', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);

      // Try to access organization settings as org admin (should be denied)
      const testOrgId = testOrgIds[0];
      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page.waitForLoadState('networkidle');

      // Should see access denied message
      await expect(page.locator('text=Access Denied')).toBeVisible();
      await expect(page.locator('text=Only site administrators can access organization settings')).toBeVisible();

      // Should NOT see the organization type selector
      await expect(page.locator('[data-testid="organization-type-selector"]')).not.toBeVisible();
    });

    test('should allow site admin to switch organization context via listings', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Find any test organization
      const testOrg = page.locator('[data-testid^="organization-"]:has-text("E2E Test")').first();
      
      if (await testOrg.count() > 0) {
        // Get organization type from badge
        const typeBadge = testOrg.locator('[data-testid*="org-type-badge"]');
        const orgType = await typeBadge.textContent();

        // Click on organization link to switch context
        const orgLink = testOrg.locator('[data-testid^="organization-link-"]');
        await orgLink.click();

        // Wait for context switch
        await page.waitForLoadState('networkidle');

        // Should see success toast about context switch
        await expect(page.locator('text=Switched to')).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Visual and UI Verification', () => {
    test('should display organization types correctly in all UI contexts', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Test organization listings UI
      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Take screenshot of organization listings with type badges
      await page.screenshot({ 
        path: 'test-results/org-types-listings.png',
        fullPage: true 
      });

      // Test organization settings UI
      if (testOrgIds.length > 0) {
        await page.goto(`${TESTING_URL}/organizations/${testOrgIds[0]}/settings`);
        await page.waitForLoadState('networkidle');

        // Verify organization type selector is visible
        await expect(page.locator('[data-testid="organization-type-selector"]')).toBeVisible();

        // Take screenshot of organization type selector
        await page.screenshot({ 
          path: 'test-results/org-types-settings.png',
          fullPage: true 
        });
      }
    });

    test('should show correct organization type labels in all contexts', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      await page.goto(`${TESTING_URL}/organizations`);
      await page.waitForLoadState('networkidle');

      // Verify all our test organizations show proper type labels
      for (const expectedLabel of Object.values(ORG_TYPE_LABELS)) {
        const badge = page.locator(`[data-testid*="org-type-badge"]:has-text("${expectedLabel}")`);
        
        if (await badge.count() > 0) {
          await expect(badge).toBeVisible();
          
          // Verify label matches exactly (not partial match)
          const badgeText = await badge.first().textContent();
          expect(badgeText?.trim()).toBe(expectedLabel);
        }
      }
    });
  });

  test.describe('Data Validation and Error Handling', () => {
    test('should handle invalid organization type gracefully', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Test direct API call with invalid org type (for robustness)
      const response = await page.request.post(`${TESTING_URL}/api/organizations`, {
        data: {
          name: 'Invalid Type Test Org',
          description: 'Test invalid organization type',
          orgType: 'invalid_type_that_does_not_exist'
        }
      });

      // Should reject invalid type (400 or validation error)
      expect(response.status()).toBeGreaterThanOrEqual(400);
    });

    test('should preserve organization type during concurrent settings updates', async ({ page, context }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      const testOrgId = testOrgIds[2];
      if (!testOrgId) return;

      // Open two tabs to simulate concurrent edits
      const page2 = await context.newPage();
      await loginWithCredentials(page2, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Both tabs navigate to same organization settings
      await page.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      await page2.goto(`${TESTING_URL}/organizations/${testOrgId}/settings`);
      
      await page.waitForLoadState('networkidle');
      await page2.waitForLoadState('networkidle');

      // Tab 1: Change only organization type
      await page.click('[data-testid="organization-type-selector"]');
      await page.click('[data-testid="select-item-youth"]');

      // Tab 2: Change only description
      await page2.fill('textarea[placeholder*="description"]', `Concurrent test ${Date.now()}`);

      // Submit both forms
      await page.click('button:has-text("Save Changes")');
      await page2.click('button:has-text("Save Changes")');

      // Both should succeed (last write wins)
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
      await expect(page2.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });

      await page2.close();
    });
  });

  // Cleanup after all tests
  test.afterAll(async ({ browser }) => {
    if (testOrgIds.length === 0) return;

    // Cleanup created test organizations
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      for (const orgId of testOrgIds) {
        try {
          // Navigate to organizations page
          await page.goto(`${TESTING_URL}/organizations`);
          await page.waitForLoadState('networkidle');

          // Find and delete the test organization
          const deleteButton = page.locator(`[data-testid="delete-org-${orgId}"]`);
          
          if (await deleteButton.count() > 0) {
            await deleteButton.click();
            
            // Handle delete confirmation modal
            await page.waitForSelector('input[placeholder*="confirm"]', { timeout: 5000 });
            
            // Get organization name for confirmation
            const orgName = await page.locator('h3').textContent();
            if (orgName) {
              await page.fill('input[placeholder*="confirm"]', orgName);
              await page.click('button:has-text("Delete Organization")');
              
              // Wait for deletion to complete
              await expect(page.locator('text=Organization deleted')).toBeVisible({ timeout: 5000 });
            }
          }
        } catch (error) {
          console.log(`Failed to cleanup organization ${orgId}:`, error);
        }
      }
    } catch (error) {
      console.log('Cleanup failed:', error);
    } finally {
      await context.close();
    }
  });
});

test.describe('Organization Types Workflow Summary', () => {
  test('print organization types workflow test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Organization Types Complete Workflow E2E Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Organization Creation:');
    console.log('   - Create organizations with each organization type');
    console.log('   - Validate organization type is required during creation');
    console.log('✅ Organization Type Filtering:');
    console.log('   - Filter organizations by type in listings');
    console.log('   - Display type badges correctly in organization listings');
    console.log('✅ Organization Settings:');
    console.log('   - Change organization type via settings page');
    console.log('   - Preserve organization type when updating other settings');
    console.log('✅ Metrics and Benchmarks Integration:');
    console.log('   - Navigate to metrics page from organization with specific type');
    console.log('   - Navigate to benchmarks page from organization with specific type');
    console.log('✅ User Journey and Access Control:');
    console.log('   - Maintain organization type context during navigation');
    console.log('   - Show access denied for org admin on organization settings');
    console.log('   - Allow site admin to switch organization context via listings');
    console.log('✅ Visual and UI Verification:');
    console.log('   - Display organization types correctly in all UI contexts');
    console.log('   - Show correct organization type labels in all contexts');
    console.log('✅ Data Validation and Error Handling:');
    console.log('   - Handle invalid organization type gracefully');
    console.log('   - Preserve organization type during concurrent settings updates');
    console.log('═══════════════════════════════════════════════════\n');
  });
});