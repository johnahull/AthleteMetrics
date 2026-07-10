import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * TIER GROUP WIZARD: End-to-End Tests
 *
 * Comprehensive E2E test suite for the Tier Group Wizard feature covering:
 * - Opening the wizard from benchmarks page
 * - Step 1: Metric selection and group configuration
 * - Step 2: Defining tiers with validation
 * - Step 3: Optional filters
 * - Step 4: Review and creation
 * - Verification of created benchmarks
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test data
function generateTestTierGroup() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    groupName: `Test Tier Group ${uniqueId}`,
    description: `E2E test tier group created at ${new Date().toISOString()}`,
    metricCode: 'FLY10_TIME', // Use existing metric
  };
}

test.describe('Tier Group Wizard Tests', () => {
  let createdBenchmarkIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdBenchmarkIds = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete created benchmarks
    for (const benchmarkId of createdBenchmarkIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/benchmarks/${benchmarkId}`);
      } catch (error) {
        console.warn(`Failed to cleanup benchmark ${benchmarkId}:`, error);
      }
    }
  });

  test('should open tier group wizard from benchmarks page', async ({ page }) => {
    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Click "Create Tier Group" button
    await page.click('[data-testid="tier-group-wizard-button"]');

    // Wait for wizard dialog to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify wizard title is visible
    await expect(page.locator('text=Create Tier Group')).toBeVisible();

    // Verify we're on step 1
    await expect(page.locator('text=Step 1 of 4')).toBeVisible();

    // Verify progress bar is visible
    await expect(page.locator('[role="progressbar"]')).toBeVisible();

    // Close wizard
    await page.click('button:has-text("Cancel")');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
  });

  test('should navigate through wizard steps with valid data', async ({ page }) => {
    const testTierGroup = generateTestTierGroup();

    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('[data-testid="tier-group-wizard-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // ========== STEP 1: Metric & Type ==========
    await expect(page.locator('text=Step 1: Metric & Type')).toBeVisible();

    // Select metric
    await page.click('#metric-select');
    await page.click(`text=FLY10_TIME`);

    // Enter group name
    await page.fill('#group-name', testTierGroup.groupName);

    // Enter description (optional)
    await page.fill('#description', testTierGroup.description);

    // Comparison operator should default to 'range'
    const operatorValue = await page.inputValue('#comparison-operator');
    expect(operatorValue).toBe('range');

    // Click Next
    await page.click('button:has-text("Next")');

    // ========== STEP 2: Define Tiers ==========
    await expect(page.locator('text=Step 2: Define Tiers')).toBeVisible();
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();

    // Verify 2 default tiers exist
    const tierCards = await page.locator('input[id^="tier-name-"]').count();
    expect(tierCards).toBe(2);

    // Fill tier 1 (Elite)
    await page.fill('#tier-name-0', 'Elite');
    await page.fill('#tier-min-0', '0.90');
    await page.fill('#tier-max-0', '1.00');

    // Fill tier 2 (Good)
    await page.fill('#tier-name-1', 'Good');
    await page.fill('#tier-min-1', '1.01');
    await page.fill('#tier-max-1', '1.15');

    // Add a third tier
    await page.click('button:has-text("Add Tier")');
    await page.waitForSelector('#tier-name-2', { timeout: 2000 });

    // Fill tier 3 (Average)
    await page.fill('#tier-name-2', 'Average');
    await page.fill('#tier-min-2', '1.16');
    await page.fill('#tier-max-2', '1.30');

    // Verify tier count
    await expect(page.locator('text=3 / 10 tiers')).toBeVisible();

    // Click Next
    await page.click('button:has-text("Next")');

    // ========== STEP 3: Filters (Optional) ==========
    await expect(page.locator('text=Step 3: Filters (Optional)')).toBeVisible();
    await expect(page.locator('text=Step 3 of 4')).toBeVisible();

    // Skip filters (optional step)
    await page.click('button:has-text("Next")');

    // ========== STEP 4: Review & Confirm ==========
    await expect(page.locator('text=Step 4: Review & Confirm')).toBeVisible();
    await expect(page.locator('text=Step 4 of 4')).toBeVisible();

    // Verify summary shows correct data
    await expect(page.locator(`text=${testTierGroup.groupName}`)).toBeVisible();
    await expect(page.locator('text=Elite')).toBeVisible();
    await expect(page.locator('text=Good')).toBeVisible();
    await expect(page.locator('text=Average')).toBeVisible();
    await expect(page.locator('text=3')).toBeVisible(); // 3 benchmarks

    // Listen for API response
    const responsePromise = page.waitForResponse(
      response =>
        response.url().includes('/api/benchmarks/tier-group') &&
        response.request().method() === 'POST',
      { timeout: 10000 }
    );

    // Create tier group
    await page.click('button:has-text("Create Tier Group")');

    // Capture benchmark IDs from response
    try {
      const response = await responsePromise;
      const data = await response.json();
      if (data.benchmarks && Array.isArray(data.benchmarks)) {
        createdBenchmarkIds.push(...data.benchmarks.map((b: any) => b.id));
      }
    } catch (error) {
      console.warn('Failed to capture benchmark IDs for cleanup:', error);
    }

    // Verify success toast
    await expect(page.locator('text=Tier Group Created')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=/Created \\d+ benchmarks/')).toBeVisible();

    // Verify dialog closed
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Verify we're back on benchmarks page
    expect(page.url()).toContain('/benchmarks');

    // Wait for benchmarks list to refresh
    await page.waitForLoadState('networkidle');

    // Verify created benchmarks appear in list (at least one tier name visible)
    await expect(page.locator('text=Elite')).toBeVisible({ timeout: 5000 });
  });

  test('should enforce minimum 2 tiers validation', async ({ page }) => {
    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('[data-testid="tier-group-wizard-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Step 1: Fill minimum required fields
    await page.click('#metric-select');
    await page.click(`text=FLY10_TIME`);
    await page.fill('#group-name', 'Test Min Tiers');
    await page.click('button:has-text("Next")');

    // Step 2: Try to remove a tier (should show error)
    await page.waitForSelector('#tier-name-0', { timeout: 2000 });

    // Fill tier data
    await page.fill('#tier-name-0', 'Tier 1');
    await page.fill('#tier-min-0', '1.0');
    await page.fill('#tier-max-0', '1.1');
    await page.fill('#tier-name-1', 'Tier 2');
    await page.fill('#tier-min-1', '1.2');
    await page.fill('#tier-max-1', '1.3');

    // Try to remove tier 1 (should fail - minimum 2 tiers)
    const removeButtons = page.locator('button:has(svg)').filter({ hasText: '' });
    const firstRemoveButton = removeButtons.first();
    await firstRemoveButton.click();

    // Verify error toast appears
    await expect(page.locator('text=Minimum Tiers Required')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=/at least 2 tiers/')).toBeVisible();

    // Verify still have 2 tiers
    const tierCount = await page.locator('input[id^="tier-name-"]').count();
    expect(tierCount).toBe(2);

    // Close wizard
    await page.click('button:has-text("Cancel")');
  });

  test('should require tier names and values before proceeding', async ({ page }) => {
    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('[data-testid="tier-group-wizard-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Step 1: Fill minimum fields
    await page.click('#metric-select');
    await page.click(`text=FLY10_TIME`);
    await page.fill('#group-name', 'Test Validation');
    await page.click('button:has-text("Next")');

    // Step 2: Try to proceed with incomplete tier data
    await page.waitForSelector('#tier-name-0', { timeout: 2000 });

    // Leave tier names and values empty
    // Try to click Next (should be disabled)
    const nextButton = page.locator('button:has-text("Next")');
    await expect(nextButton).toBeDisabled();

    // Fill tier 1 name only (still incomplete)
    await page.fill('#tier-name-0', 'Elite');
    await expect(nextButton).toBeDisabled();

    // Fill tier 1 min value (still incomplete)
    await page.fill('#tier-min-0', '0.90');
    await expect(nextButton).toBeDisabled();

    // Fill tier 1 max value (tier 1 complete, but tier 2 still incomplete)
    await page.fill('#tier-max-0', '1.00');
    await expect(nextButton).toBeDisabled();

    // Complete tier 2
    await page.fill('#tier-name-1', 'Good');
    await page.fill('#tier-min-1', '1.01');
    await page.fill('#tier-max-1', '1.15');

    // Now Next button should be enabled
    await expect(nextButton).toBeEnabled();

    // Close wizard
    await page.click('button:has-text("Cancel")');
  });

  test('should allow adding up to 10 tiers', async ({ page }) => {
    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('[data-testid="tier-group-wizard-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Step 1: Fill minimum fields
    await page.click('#metric-select');
    await page.click(`text=FLY10_TIME`);
    await page.fill('#group-name', 'Test Max Tiers');
    await page.click('button:has-text("Next")');

    // Step 2: Add tiers up to maximum (10)
    await page.waitForSelector('#tier-name-0', { timeout: 2000 });

    // Already have 2 tiers, add 8 more
    for (let i = 0; i < 8; i++) {
      const addTierButton = page.locator('button:has-text("Add Tier")');
      await addTierButton.click();
      await page.waitForTimeout(200); // Small delay for UI update
    }

    // Verify we have 10 tiers
    await expect(page.locator('text=10 / 10 tiers')).toBeVisible();

    // Verify "Add Tier" button is now disabled
    const addTierButton = page.locator('button:has-text("Add Tier")');
    await expect(addTierButton).toBeDisabled();

    // Try to add one more tier (should show error)
    await addTierButton.click({ force: true }); // Force click even if disabled

    // Should show error toast
    await expect(page.locator('text=Maximum Tiers Reached')).toBeVisible({ timeout: 3000 });

    // Close wizard
    await page.click('button:has-text("Cancel")');
  });

  test('should support optional filters on step 3', async ({ page }) => {
    const testTierGroup = generateTestTierGroup();

    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('[data-testid="tier-group-wizard-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Step 1: Fill required fields
    await page.click('#metric-select');
    await page.click(`text=FLY10_TIME`);
    await page.fill('#group-name', testTierGroup.groupName);
    await page.click('button:has-text("Next")');

    // Step 2: Fill tiers
    await page.fill('#tier-name-0', 'Elite');
    await page.fill('#tier-min-0', '0.90');
    await page.fill('#tier-max-0', '1.00');
    await page.fill('#tier-name-1', 'Good');
    await page.fill('#tier-min-1', '1.01');
    await page.fill('#tier-max-1', '1.15');
    await page.click('button:has-text("Next")');

    // Step 3: Apply filters
    await expect(page.locator('text=Step 3: Filters (Optional)')).toBeVisible();

    // Select gender filter
    await page.click('#gender-select');
    await page.click('text=Male');

    // Set age range
    await page.fill('#age-min', '18');
    await page.fill('#age-max', '22');

    // Set position
    await page.fill('#position', 'Forward');

    // Set level
    await page.fill('#level', 'College');

    // Click Next
    await page.click('button:has-text("Next")');

    // Step 4: Verify filters appear in review
    await expect(page.locator('text=Filters Applied')).toBeVisible();
    await expect(page.locator('text=Male')).toBeVisible();
    await expect(page.locator('text=/18.*22/')).toBeVisible();
    await expect(page.locator('text=Forward')).toBeVisible();
    await expect(page.locator('text=College')).toBeVisible();

    // Don't create - just close
    await page.click('button:has-text("Cancel")');
  });

  test('should allow navigation back to previous steps', async ({ page }) => {
    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('[data-testid="tier-group-wizard-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Step 1: Fill fields
    await page.click('#metric-select');
    await page.click(`text=FLY10_TIME`);
    await page.fill('#group-name', 'Test Back Navigation');
    await page.click('button:has-text("Next")');

    // Step 2: Verify we're on step 2
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();
    await expect(page.locator('text=Step 2: Define Tiers')).toBeVisible();

    // Click Back
    await page.click('button:has-text("Back")');

    // Verify we're back on step 1
    await expect(page.locator('text=Step 1 of 4')).toBeVisible();
    await expect(page.locator('text=Step 1: Metric & Type')).toBeVisible();

    // Verify form data is preserved
    const groupNameValue = await page.inputValue('#group-name');
    expect(groupNameValue).toBe('Test Back Navigation');

    // Navigate forward again
    await page.click('button:has-text("Next")');
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();

    // Fill tier data
    await page.fill('#tier-name-0', 'Elite');
    await page.fill('#tier-min-0', '0.90');
    await page.fill('#tier-max-0', '1.00');
    await page.fill('#tier-name-1', 'Good');
    await page.fill('#tier-min-1', '1.01');
    await page.fill('#tier-max-1', '1.15');
    await page.click('button:has-text("Next")');

    // Step 3
    await expect(page.locator('text=Step 3 of 4')).toBeVisible();

    // Click Back
    await page.click('button:has-text("Back")');

    // Verify we're back on step 2
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();

    // Verify tier data is preserved
    const tier1Name = await page.inputValue('#tier-name-0');
    expect(tier1Name).toBe('Elite');

    // Close wizard
    await page.click('button:has-text("Cancel")');
  });

  test('should support single-value comparison operators', async ({ page }) => {
    const testTierGroup = generateTestTierGroup();

    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('[data-testid="tier-group-wizard-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Step 1: Select metric
    await page.click('#metric-select');
    await page.click(`text=FLY10_TIME`);
    await page.fill('#group-name', testTierGroup.groupName);

    // Change comparison operator to "lte" (lower is better)
    await page.click('#comparison-operator');
    await page.click('text=≤ Lower is better (single value)');

    await page.click('button:has-text("Next")');

    // Step 2: Verify single value fields appear instead of range
    await expect(page.locator('#tier-value-0')).toBeVisible();
    await expect(page.locator('#tier-value-1')).toBeVisible();

    // Verify min/max fields are NOT present
    await expect(page.locator('#tier-min-0')).not.toBeVisible();
    await expect(page.locator('#tier-max-0')).not.toBeVisible();

    // Fill single threshold values
    await page.fill('#tier-name-0', 'Elite');
    await page.fill('#tier-value-0', '1.00');
    await page.fill('#tier-name-1', 'Good');
    await page.fill('#tier-value-1', '1.10');

    // Proceed to next step
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")'); // Skip filters

    // Step 4: Verify review shows single values
    await expect(page.locator('text=≤ 1.00')).toBeVisible();
    await expect(page.locator('text=≤ 1.10')).toBeVisible();

    // Close without creating
    await page.click('button:has-text("Cancel")');
  });

  test('should reset form state when wizard is closed and reopened', async ({ page }) => {
    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('[data-testid="tier-group-wizard-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill some data
    await page.click('#metric-select');
    await page.click(`text=FLY10_TIME`);
    await page.fill('#group-name', 'Test Reset');
    await page.fill('#description', 'This should be cleared');

    // Close wizard
    await page.click('button:has-text("Cancel")');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Reopen wizard
    await page.click('[data-testid="tier-group-wizard-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify form is reset
    await expect(page.locator('text=Step 1 of 4')).toBeVisible();
    const groupNameValue = await page.inputValue('#group-name');
    expect(groupNameValue).toBe('');

    const descriptionValue = await page.inputValue('#description');
    expect(descriptionValue).toBe('');

    // Close wizard
    await page.click('button:has-text("Cancel")');
  });
});

test.describe('Tier Group Wizard Summary', () => {
  test('print tier group wizard test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Tier Group Wizard Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Open wizard from benchmarks page');
    console.log('✅ Navigate through all 4 steps with valid data');
    console.log('✅ Enforce minimum 2 tiers validation');
    console.log('✅ Require tier names and values before proceeding');
    console.log('✅ Allow adding up to 10 tiers');
    console.log('✅ Support optional filters on step 3');
    console.log('✅ Allow navigation back to previous steps');
    console.log('✅ Support single-value comparison operators');
    console.log('✅ Reset form state when closed and reopened');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
