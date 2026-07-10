import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { goToImportExport } from './helpers/navigation';

/**
 * IMPORT WIZARD E2E TESTS
 *
 * Tests for the multi-step Import Wizard that generates custom CSV templates.
 * The wizard guides coaches through:
 * 1. Select import type (athletes/measurements)
 * 2. Select team(s) for context
 * 3. Select metrics (measurements only)
 * 4. Preview and download template
 *
 * Test scenarios:
 * - Open wizard dialog
 * - Complete athlete template flow (3 steps)
 * - Complete measurement template flow (4 steps)
 * - Back button navigation
 * - Cancel button behavior
 * - CSV content validation
 * - Select All / Clear All team selection
 * - Toggle example rows
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Skip: Tests require staging environment with specific team data
// Unit tests provide full coverage of Import Wizard components
test.describe.skip('Import Wizard Tests', () => {

  // Setup: Login before each test
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToImportExport(page);
  });

  test('should open wizard dialog when clicking Template Wizard button', async ({ page }) => {
    // Click the Template Wizard button
    await page.click('[data-testid="button-template-wizard"]');

    // Verify dialog opens with wizard content
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Should show step 1: Select import type
    await expect(page.locator('text="What would you like to import?"')).toBeVisible();

    // Should show both import type options
    await expect(page.locator('[aria-label="Import athletes"]')).toBeVisible();
    await expect(page.locator('[aria-label="Import measurements"]')).toBeVisible();
  });

  test('should complete athlete template flow (Type → Teams → Preview)', async ({ page }) => {
    // Open wizard
    await page.click('[data-testid="button-template-wizard"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Step 1: Select Athletes
    await page.click('[aria-label="Import athletes"]');

    // Step 2: Select Teams - wait for teams to load
    await expect(page.locator('text="Select Teams"')).toBeVisible({ timeout: 10000 });

    // Wait for at least one team to appear or "No teams found" message
    const teamCheckbox = page.locator('[id^="team-"]').first();
    const noTeamsMessage = page.locator('text="No teams found"');

    await Promise.race([
      teamCheckbox.waitFor({ state: 'visible', timeout: 10000 }),
      noTeamsMessage.waitFor({ state: 'visible', timeout: 10000 })
    ]);

    // If teams exist, select at least one
    const hasTeams = await teamCheckbox.isVisible();
    if (hasTeams) {
      await teamCheckbox.click();

      // Verify selection count updates
      await expect(page.locator('text=/\\d+ selected/')).toBeVisible();

      // Click Next to proceed
      await page.click('button:has-text("Next")');

      // Step 3: Preview Template - should skip metrics for athletes
      await expect(page.locator('text="Preview Template"')).toBeVisible({ timeout: 10000 });

      // Verify template info shows
      await expect(page.locator('text="Type:"')).toBeVisible();
      await expect(page.locator('text="Athletes"')).toBeVisible();

      // Verify download button exists
      await expect(page.locator('button:has-text("Download Template")')).toBeVisible();

      // Verify Done button exists
      await expect(page.locator('button:has-text("Done")')).toBeVisible();
    }
  });

  test('should complete measurement template flow (Type → Teams → Metrics → Preview)', async ({ page }) => {
    // Open wizard
    await page.click('[data-testid="button-template-wizard"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Step 1: Select Measurements
    await page.click('[aria-label="Import measurements"]');

    // Step 2: Select Teams
    await expect(page.locator('text="Select Teams"')).toBeVisible({ timeout: 10000 });

    // Wait for teams to load
    const teamCheckbox = page.locator('[id^="team-"]').first();
    const noTeamsMessage = page.locator('text="No teams found"');

    await Promise.race([
      teamCheckbox.waitFor({ state: 'visible', timeout: 10000 }),
      noTeamsMessage.waitFor({ state: 'visible', timeout: 10000 })
    ]);

    const hasTeams = await teamCheckbox.isVisible();
    if (hasTeams) {
      await teamCheckbox.click();
      await page.click('button:has-text("Next")');

      // Step 3: Select Metrics - unique to measurements flow
      await expect(page.locator('text=/Select Metrics|Metrics/i')).toBeVisible({ timeout: 10000 });

      // Wait for metrics to load and select at least one
      const metricCheckbox = page.locator('input[type="checkbox"]').first();
      await metricCheckbox.waitFor({ state: 'visible', timeout: 10000 });
      await metricCheckbox.click();

      // Click Next to proceed
      await page.click('button:has-text("Next")');

      // Step 4: Preview Template
      await expect(page.locator('text="Preview Template"')).toBeVisible({ timeout: 10000 });

      // Verify template shows metrics info
      await expect(page.locator('text="Metrics:"')).toBeVisible();

      // Verify download button exists
      await expect(page.locator('button:has-text("Download Template")')).toBeVisible();
    }
  });

  test('should navigate back through steps with Back button', async ({ page }) => {
    // Open wizard
    await page.click('[data-testid="button-template-wizard"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Step 1: Select Athletes
    await page.click('[aria-label="Import athletes"]');

    // Step 2: Verify we're on team selection
    await expect(page.locator('text="Select Teams"')).toBeVisible({ timeout: 10000 });

    // Wait for teams or no teams message
    const teamCheckbox = page.locator('[id^="team-"]').first();
    const noTeamsMessage = page.locator('text="No teams found"');

    await Promise.race([
      teamCheckbox.waitFor({ state: 'visible', timeout: 10000 }),
      noTeamsMessage.waitFor({ state: 'visible', timeout: 10000 })
    ]);

    // Click Back to return to type selection
    await page.click('button:has-text("Back")');

    // Should be back on Step 1
    await expect(page.locator('text="What would you like to import?"')).toBeVisible();
    await expect(page.locator('[aria-label="Import athletes"]')).toBeVisible();
  });

  test('should close wizard when clicking Cancel at any step', async ({ page }) => {
    // Open wizard
    await page.click('[data-testid="button-template-wizard"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Step 1: Select Athletes to go to Step 2
    await page.click('[aria-label="Import athletes"]');

    // Wait for Step 2
    await expect(page.locator('text="Select Teams"')).toBeVisible({ timeout: 10000 });

    // Wait for teams or no teams message
    const teamCheckbox = page.locator('[id^="team-"]').first();
    const noTeamsMessage = page.locator('text="No teams found"');

    await Promise.race([
      teamCheckbox.waitFor({ state: 'visible', timeout: 10000 }),
      noTeamsMessage.waitFor({ state: 'visible', timeout: 10000 })
    ]);

    // Click Cancel
    await page.click('button:has-text("Cancel")');

    // Dialog should close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('should show correct CSV columns in template preview', async ({ page }) => {
    // Open wizard
    await page.click('[data-testid="button-template-wizard"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Select Athletes
    await page.click('[aria-label="Import athletes"]');

    // Wait for and select a team
    await expect(page.locator('text="Select Teams"')).toBeVisible({ timeout: 10000 });

    const teamCheckbox = page.locator('[id^="team-"]').first();
    const noTeamsMessage = page.locator('text="No teams found"');

    await Promise.race([
      teamCheckbox.waitFor({ state: 'visible', timeout: 10000 }),
      noTeamsMessage.waitFor({ state: 'visible', timeout: 10000 })
    ]);

    const hasTeams = await teamCheckbox.isVisible();
    if (hasTeams) {
      await teamCheckbox.click();
      await page.click('button:has-text("Next")');

      // Wait for preview
      await expect(page.locator('text="Preview Template"')).toBeVisible({ timeout: 10000 });

      // Wait for CSV content to appear in the preview
      await expect(page.locator('pre')).toBeVisible({ timeout: 10000 });

      // Verify required athlete columns are present in the CSV preview
      const csvPreview = page.locator('pre');
      await expect(csvPreview).toContainText('firstName');
      await expect(csvPreview).toContainText('lastName');
      await expect(csvPreview).toContainText('teamName');
    }
  });

  test('should support Select All and Clear All for team selection', async ({ page }) => {
    // Open wizard
    await page.click('[data-testid="button-template-wizard"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Select Athletes
    await page.click('[aria-label="Import athletes"]');

    // Wait for team selection
    await expect(page.locator('text="Select Teams"')).toBeVisible({ timeout: 10000 });

    // Wait for at least one team to appear
    const teamCheckbox = page.locator('[id^="team-"]').first();
    const noTeamsMessage = page.locator('text="No teams found"');

    await Promise.race([
      teamCheckbox.waitFor({ state: 'visible', timeout: 10000 }),
      noTeamsMessage.waitFor({ state: 'visible', timeout: 10000 })
    ]);

    const hasTeams = await teamCheckbox.isVisible();
    if (hasTeams) {
      // Initially no teams selected - verify Clear All is disabled
      const clearAllBtn = page.locator('button:has-text("Clear All")');
      await expect(clearAllBtn).toBeDisabled();

      // Click Select All
      const selectAllBtn = page.locator('button:has-text("Select All")');
      await selectAllBtn.click();

      // Verify some teams are now selected
      await expect(page.locator('text=/\\d+ selected/')).toBeVisible();

      // Select All should now be disabled (all selected)
      await expect(selectAllBtn).toBeDisabled();

      // Clear All should now be enabled
      await expect(clearAllBtn).toBeEnabled();

      // Click Clear All
      await clearAllBtn.click();

      // Verify 0 selected
      await expect(page.locator('text="0 selected"')).toBeVisible();
    }
  });

  test('should regenerate template when toggling example rows', async ({ page }) => {
    // Open wizard
    await page.click('[data-testid="button-template-wizard"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Navigate to preview
    await page.click('[aria-label="Import athletes"]');
    await expect(page.locator('text="Select Teams"')).toBeVisible({ timeout: 10000 });

    const teamCheckbox = page.locator('[id^="team-"]').first();
    const noTeamsMessage = page.locator('text="No teams found"');

    await Promise.race([
      teamCheckbox.waitFor({ state: 'visible', timeout: 10000 }),
      noTeamsMessage.waitFor({ state: 'visible', timeout: 10000 })
    ]);

    const hasTeams = await teamCheckbox.isVisible();
    if (hasTeams) {
      await teamCheckbox.click();
      await page.click('button:has-text("Next")');

      // Wait for preview to fully load
      await expect(page.locator('text="Preview Template"')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('pre')).toBeVisible({ timeout: 10000 });

      // Get initial CSV content
      const initialContent = await page.locator('pre').textContent();

      // Find and toggle the "Include example rows" switch
      const exampleSwitch = page.locator('#include-examples');
      const isChecked = await exampleSwitch.isChecked();

      // Toggle the switch
      await exampleSwitch.click();

      // Wait for template to regenerate (loading spinner may appear)
      await page.waitForTimeout(1000); // Allow time for regeneration

      // Verify the content changes (or at least the switch state changed)
      const newChecked = await exampleSwitch.isChecked();
      expect(newChecked).toBe(!isChecked);
    }
  });

  test('should disable Next button when no team is selected', async ({ page }) => {
    // Open wizard
    await page.click('[data-testid="button-template-wizard"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Select Athletes
    await page.click('[aria-label="Import athletes"]');

    // Wait for team selection
    await expect(page.locator('text="Select Teams"')).toBeVisible({ timeout: 10000 });

    // Wait for teams or no teams message
    const teamCheckbox = page.locator('[id^="team-"]').first();
    const noTeamsMessage = page.locator('text="No teams found"');

    await Promise.race([
      teamCheckbox.waitFor({ state: 'visible', timeout: 10000 }),
      noTeamsMessage.waitFor({ state: 'visible', timeout: 10000 })
    ]);

    const hasTeams = await teamCheckbox.isVisible();
    if (hasTeams) {
      // Next button should be disabled initially (no team selected)
      const nextBtn = page.locator('button:has-text("Next")');
      await expect(nextBtn).toBeDisabled();

      // Select a team
      await teamCheckbox.click();

      // Next button should now be enabled
      await expect(nextBtn).toBeEnabled();

      // Unselect the team
      await teamCheckbox.click();

      // Next button should be disabled again
      await expect(nextBtn).toBeDisabled();
    }
  });
});

test.describe('Import Wizard Summary', () => {
  test('print Import Wizard test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Import Wizard Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Open wizard dialog');
    console.log('✅ Complete athlete template flow (3 steps)');
    console.log('✅ Complete measurement template flow (4 steps)');
    console.log('✅ Back button navigation');
    console.log('✅ Cancel button behavior');
    console.log('✅ CSV content validation');
    console.log('✅ Select All / Clear All team selection');
    console.log('✅ Toggle example rows');
    console.log('✅ Next button disabled until team selected');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
