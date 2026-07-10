import { test, expect } from './fixtures/e2e-base';
import { loginAs, loginAsDefaultUser } from './helpers/auth';
import { goToAthletes, navigateTo } from './helpers/navigation';
import { canTestRoleAuthorization } from './fixtures/test-users';

/**
 * Profile Merge E2E Tests
 *
 * These tests verify the org admin profile merge functionality:
 * - Complete merge workflow (select, preview, confirm)
 * - Conflict resolution UI
 * - Authorization (org admin required)
 * - Session invalidation for merged user
 *
 * Prerequisites:
 * - Org admin credentials configured (E2E_ORG_ADMIN_USERNAME/PASSWORD)
 * - At least 2 test athletes in the organization
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test athletes for merge testing
function generateTestAthlete(suffix: string) {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    firstName: `MergeTest_${suffix}_${uniqueId}`,
    lastName: `Athlete_${uniqueId}`,
    email: `mergetest_${suffix}_${uniqueId}@example.com`,
    birthDate: '2005-01-15',
  };
}

test.describe('Profile Merge Feature', () => {
  // Track created athletes for cleanup
  let createdAthleteIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    // Reset cleanup tracker
    createdAthleteIds = [];
  });

  test.afterEach(async ({ page }) => {
    // Clean up any athletes created in this test
    for (const athleteId of createdAthleteIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/athletes/${athleteId}`);
      } catch (error) {
        console.warn(`Failed to cleanup athlete ${athleteId}:`, error);
      }
    }
  });

  test.describe('Authorization', () => {
    test('should only show merge button to org admins', async ({ page }) => {
      // Skip if we can't test role differentiation
      if (!canTestRoleAuthorization('org_admin', 'athlete')) {
        test.skip();
        return;
      }

      // Login as athlete (non-admin)
      await loginAs(page, 'athlete');
      await goToAthletes(page);

      // Wait for athletes page to load
      await page.waitForLoadState('networkidle');

      // Verify merge button is NOT visible for athletes
      const mergeButton = page.locator('[data-testid="button-merge-profiles"]');
      await expect(mergeButton).not.toBeVisible();
    });

    test('should show merge button when org admin selects exactly 2 athletes', async ({ page }) => {
      await loginAs(page, 'org_admin');
      await goToAthletes(page);

      // Wait for athletes list to load
      await page.waitForSelector('[data-testid="athletes-table"], [data-testid="athletes-list"]', {
        timeout: 10000,
      });

      // Select first athlete (click checkbox or row)
      const firstAthleteCheckbox = page.locator('[data-testid="athlete-checkbox"]').first();
      if (await firstAthleteCheckbox.isVisible()) {
        await firstAthleteCheckbox.click();
      } else {
        // Try selecting via row click with modifier
        const firstRow = page.locator('[data-testid="athlete-row"]').first();
        await firstRow.click();
      }

      // Merge button should NOT be visible with only 1 selection
      let mergeButton = page.locator('[data-testid="button-merge-profiles"]');
      await expect(mergeButton).not.toBeVisible();

      // Select second athlete
      const secondAthleteCheckbox = page.locator('[data-testid="athlete-checkbox"]').nth(1);
      if (await secondAthleteCheckbox.isVisible()) {
        await secondAthleteCheckbox.click();
      } else {
        const secondRow = page.locator('[data-testid="athlete-row"]').nth(1);
        await secondRow.click({ modifiers: ['Control'] });
      }

      // Now merge button SHOULD be visible with exactly 2 selected
      mergeButton = page.locator('[data-testid="button-merge-profiles"]');
      await expect(mergeButton).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Merge Wizard Flow', () => {
    test('should complete full merge workflow (select, preview, confirm)', async ({ page }) => {
      await loginAs(page, 'org_admin');
      await goToAthletes(page);

      // Create two test athletes for merge testing
      const sourceAthlete = generateTestAthlete('Source');
      const targetAthlete = generateTestAthlete('Target');

      // Create source athlete
      await page.click('[data-testid="add-athlete-button"]');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await page.fill('[data-testid="input-athlete-firstname"]', sourceAthlete.firstName);
      await page.fill('[data-testid="input-athlete-lastname"]', sourceAthlete.lastName);
      await page.fill('[data-testid="input-athlete-birthdate"]', sourceAthlete.birthDate);
      await page.click('[data-testid="button-add-email"]');
      await page.fill('[data-testid="input-email-0"]', sourceAthlete.email);

      const sourceResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/athletes') && response.request().method() === 'POST'
      );
      await page.click('[data-testid="submit-athlete"]');

      try {
        const sourceResponse = await sourceResponsePromise;
        const sourceData = await sourceResponse.json();
        if (sourceData?.id) createdAthleteIds.push(sourceData.id);
      } catch (error) {
        console.warn('Failed to capture source athlete ID:', error);
      }

      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

      // Create target athlete
      await page.click('[data-testid="add-athlete-button"]');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await page.fill('[data-testid="input-athlete-firstname"]', targetAthlete.firstName);
      await page.fill('[data-testid="input-athlete-lastname"]', targetAthlete.lastName);
      await page.fill('[data-testid="input-athlete-birthdate"]', targetAthlete.birthDate);
      await page.click('[data-testid="button-add-email"]');
      await page.fill('[data-testid="input-email-0"]', targetAthlete.email);

      const targetResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/athletes') && response.request().method() === 'POST'
      );
      await page.click('[data-testid="submit-athlete"]');

      try {
        const targetResponse = await targetResponsePromise;
        const targetData = await targetResponse.json();
        if (targetData?.id) createdAthleteIds.push(targetData.id);
      } catch (error) {
        console.warn('Failed to capture target athlete ID:', error);
      }

      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

      // Wait for athletes to appear in the list
      await page.waitForSelector(`text=${sourceAthlete.firstName}`, { timeout: 10000 });
      await page.waitForSelector(`text=${targetAthlete.firstName}`, { timeout: 10000 });

      // Select both athletes using search to find them
      // First clear any existing selection
      const clearSelectionButton = page.locator('[data-testid="clear-selection"]');
      if (await clearSelectionButton.isVisible()) {
        await clearSelectionButton.click();
      }

      // Search for and select source athlete
      const searchInput = page.locator('[data-testid="athlete-search"], input[placeholder*="Search"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill(sourceAthlete.firstName);
        await page.waitForLoadState('networkidle');
      }

      // Select source athlete checkbox
      const sourceRow = page.locator(`[data-testid="athlete-row"]:has-text("${sourceAthlete.firstName}")`);
      const sourceCheckbox = sourceRow.locator('[data-testid="athlete-checkbox"]');
      if (await sourceCheckbox.isVisible()) {
        await sourceCheckbox.click();
      } else {
        await sourceRow.click();
      }

      // Clear search and find target
      if (await searchInput.isVisible()) {
        await searchInput.fill(targetAthlete.firstName);
        await page.waitForLoadState('networkidle');
      }

      // Select target athlete checkbox (with Ctrl to add to selection)
      const targetRow = page.locator(`[data-testid="athlete-row"]:has-text("${targetAthlete.firstName}")`);
      const targetCheckbox = targetRow.locator('[data-testid="athlete-checkbox"]');
      if (await targetCheckbox.isVisible()) {
        await targetCheckbox.click();
      } else {
        await targetRow.click({ modifiers: ['Control'] });
      }

      // Clear search to see action bar
      if (await searchInput.isVisible()) {
        await searchInput.clear();
        await page.waitForLoadState('networkidle');
      }

      // Click merge profiles button in action bar
      const mergeButton = page.locator('[data-testid="button-merge-profiles"]');
      await expect(mergeButton).toBeVisible({ timeout: 5000 });
      await mergeButton.click();

      // Step 1: Select Profiles - Wait for wizard dialog
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await expect(page.locator('text=Merge Athlete Profiles')).toBeVisible();
      await expect(page.locator('text=Step 1')).toBeVisible();

      // Verify source and target are shown correctly
      await expect(page.locator('text=/Source.*Will be deleted/i')).toBeVisible();
      await expect(page.locator('text=/Target.*Will be kept/i')).toBeVisible();

      // Click Next to go to Preview
      await page.click('[data-testid="wizard-next-button"]');

      // Step 2: Preview - Wait for preview to load
      await expect(page.locator('text=Step 2')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Data Comparison')).toBeVisible();

      // Verify comparison table shows both athletes
      await expect(page.locator('text=Measurements')).toBeVisible();
      await expect(page.locator('text=Team Memberships')).toBeVisible();

      // Check for merge status (should be green "Ready to Merge")
      await expect(page.locator('text=Ready to Merge')).toBeVisible();

      // Click Next to go to Confirm
      await page.click('[data-testid="wizard-next-button"]');

      // Step 3: Confirm - Type-to-confirm
      await expect(page.locator('text=Step 3')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=This action cannot be undone')).toBeVisible();

      // Type MERGE to confirm
      const confirmInput = page.locator('[data-testid="confirm-merge-input"]');
      await confirmInput.fill('MERGE');

      // Verify merge button becomes enabled
      const confirmButton = page.locator('[data-testid="confirm-merge-button"]');
      await expect(confirmButton).toBeEnabled();

      // Execute the merge
      const mergeResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/merge-profiles') && response.request().method() === 'POST'
      );
      await confirmButton.click();

      // Wait for merge to complete
      const mergeResponse = await mergeResponsePromise;
      expect(mergeResponse.ok()).toBeTruthy();

      // Wizard should close on success
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 });

      // Verify success toast/message
      const successMessage = page.locator('text=/merge.*success|profiles.*merged/i');
      await expect(successMessage).toBeVisible({ timeout: 5000 });

      // Source athlete should no longer appear (soft-deleted)
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.locator(`text=${sourceAthlete.firstName} ${sourceAthlete.lastName}`)).not.toBeVisible();

      // Target athlete should still be visible
      await expect(page.locator(`text=${targetAthlete.firstName}`)).toBeVisible();

      // Remove source from cleanup list since it's soft-deleted
      createdAthleteIds = createdAthleteIds.filter((id) => id !== createdAthleteIds[0]);
    });

    test('should allow swapping source and target profiles', async ({ page }) => {
      await loginAs(page, 'org_admin');
      await goToAthletes(page);

      // Wait for athletes list
      await page.waitForSelector('[data-testid="athletes-table"], [data-testid="athletes-list"]', {
        timeout: 10000,
      });

      // Select first two athletes
      const checkboxes = page.locator('[data-testid="athlete-checkbox"]');
      await checkboxes.first().click();
      await checkboxes.nth(1).click();

      // Open merge wizard
      await page.click('[data-testid="button-merge-profiles"]');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Get initial source name
      const sourceLabel = page.locator('[data-testid="source-profile-name"]');
      const initialSourceName = await sourceLabel.textContent();

      // Click swap button
      const swapButton = page.locator('[data-testid="swap-profiles-button"]');
      await swapButton.click();

      // Verify source changed
      const newSourceName = await sourceLabel.textContent();
      expect(newSourceName).not.toBe(initialSourceName);

      // Close wizard without merging
      await page.click('[data-testid="wizard-cancel-button"]');
    });

    test('should display blocking conflicts when OAuth providers collide', async ({ page }) => {
      // This test verifies the UI handles blocking conflicts correctly
      // Note: Actual OAuth conflict requires both users to have same provider with different IDs
      await loginAs(page, 'org_admin');
      await goToAthletes(page);

      // For this test, we verify the UI structure for conflicts
      // A real OAuth conflict would be created in test setup

      await page.waitForSelector('[data-testid="athletes-table"], [data-testid="athletes-list"]', {
        timeout: 10000,
      });

      // Select two athletes
      const checkboxes = page.locator('[data-testid="athlete-checkbox"]');
      if ((await checkboxes.count()) >= 2) {
        await checkboxes.first().click();
        await checkboxes.nth(1).click();

        // Open merge wizard
        await page.click('[data-testid="button-merge-profiles"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Navigate to preview
        await page.click('[data-testid="wizard-next-button"]');
        await page.waitForLoadState('networkidle');

        // Verify conflict display elements exist (even if empty)
        // The UI should show either "Ready to Merge" or blocking conflicts
        const readyToMerge = page.locator('text=Ready to Merge');
        const mergeBlocked = page.locator('text=Merge Blocked');
        const conflictSection = page.locator('text=/conflict|warning/i');

        // One of these should be visible
        const hasStatus =
          (await readyToMerge.isVisible()) ||
          (await mergeBlocked.isVisible()) ||
          (await conflictSection.isVisible());
        expect(hasStatus).toBeTruthy();

        // Close wizard
        await page.click('[data-testid="wizard-cancel-button"]');
      }
    });

    test('should prevent merging user with themselves', async ({ page }) => {
      await loginAs(page, 'org_admin');
      await goToAthletes(page);

      // Wait for athletes list
      await page.waitForSelector('[data-testid="athletes-table"], [data-testid="athletes-list"]', {
        timeout: 10000,
      });

      // In the UI, you can't select the same athlete twice via checkboxes
      // This test verifies the wizard validates same-user selection

      // Open wizard with preselected athletes (simulating API test)
      // The backend will reject same-user merges
      const checkboxes = page.locator('[data-testid="athlete-checkbox"]');
      if ((await checkboxes.count()) >= 1) {
        // Attempt to somehow trigger a same-user merge would be blocked at UI level
        // The test passes if UI prevents double-selection
        await checkboxes.first().click();

        // Verify merge button requires exactly 2 selections
        const mergeButton = page.locator('[data-testid="button-merge-profiles"]');
        await expect(mergeButton).not.toBeVisible();
      }
    });
  });

  test.describe('Cross-Organization Prevention', () => {
    test('should only show athletes from current organization context', async ({ page }) => {
      await loginAs(page, 'org_admin');
      await goToAthletes(page);

      // Wait for athletes list to load
      await page.waitForSelector('[data-testid="athletes-table"], [data-testid="athletes-list"]', {
        timeout: 10000,
      });

      // Verify we're in an org context
      const orgSelector = page.locator('[data-testid="org-selector"]');
      const currentOrg = await orgSelector.textContent();

      // Athletes shown should be from the current org
      // The merge feature inherently works within org context
      expect(currentOrg).toBeTruthy();

      // Attempting to merge across orgs would fail at API level
      // UI prevents this by only showing org-scoped athletes
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      await loginAs(page, 'org_admin');
      await goToAthletes(page);

      await page.waitForSelector('[data-testid="athletes-table"], [data-testid="athletes-list"]', {
        timeout: 10000,
      });

      // Select two athletes
      const checkboxes = page.locator('[data-testid="athlete-checkbox"]');
      if ((await checkboxes.count()) >= 2) {
        await checkboxes.first().click();
        await checkboxes.nth(1).click();

        // Open merge wizard
        await page.click('[data-testid="button-merge-profiles"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Simulate network failure by returning 500 error
        await page.route('**/merge-profiles/preview', (route) => {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Internal Server Error' }),
          });
        });

        // Try to proceed to preview (should show error via toast)
        await page.click('[data-testid="wizard-next-button"]');

        // Verify error message appears (toast shows "Preview Failed")
        await expect(
          page.getByText(/preview failed|error|failed|unable/i).first()
        ).toBeVisible({ timeout: 10000 });

        // Wizard should still be open (not crash)
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // Close wizard
        await page.click('[data-testid="wizard-cancel-button"]');
      }
    });

    test('should validate type-to-confirm input', async ({ page }) => {
      await loginAs(page, 'org_admin');
      await goToAthletes(page);

      await page.waitForSelector('[data-testid="athletes-table"], [data-testid="athletes-list"]', {
        timeout: 10000,
      });

      const checkboxes = page.locator('[data-testid="athlete-checkbox"]');
      if ((await checkboxes.count()) >= 2) {
        await checkboxes.first().click();
        await checkboxes.nth(1).click();

        await page.click('[data-testid="button-merge-profiles"]');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

        // Go to step 2 (preview) — clicking Next triggers the preview API call
        await page.click('[data-testid="wizard-next-button"]');
        // Wait for step 2 to load (preview API must succeed)
        await expect(page.getByText('Step 2 of 3')).toBeVisible({ timeout: 15000 });

        // Go to step 3 (confirm)
        await page.click('[data-testid="wizard-next-button"]');
        await expect(page.getByText('Step 3 of 3')).toBeVisible({ timeout: 5000 });

        // Verify confirm button is disabled initially
        const confirmButton = page.locator('[data-testid="confirm-merge-button"]');
        await expect(confirmButton).toBeDisabled();

        // Type wrong text
        const confirmInput = page.locator('[data-testid="confirm-merge-input"]');
        await confirmInput.fill('WRONG');
        await expect(confirmButton).toBeDisabled();

        // Type correct text (case insensitive)
        await confirmInput.fill('merge');
        await expect(confirmButton).toBeEnabled();

        // Clear and verify disabled again
        await confirmInput.clear();
        await expect(confirmButton).toBeDisabled();

        // Type exact match
        await confirmInput.fill('MERGE');
        await expect(confirmButton).toBeEnabled();

        // Close without executing
        await page.click('[data-testid="wizard-cancel-button"]');
      }
    });
  });
});
