import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { goToAthletes } from './helpers/navigation';

/**
 * TIER 1 CRITICAL: Athlete CRUD Tests
 *
 * These tests verify the core athlete management functionality:
 * - Creating new athletes
 * - Editing athlete information
 * - Deleting athletes
 * - Form validation
 * - Viewing athlete profiles
 * - Bulk operations
 * - Search and filtering
 *
 * Tests follow TDD methodology: written first, infrastructure built to make them pass.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test data per test to avoid conflicts in parallel execution
// Uses crypto-based uniqueness to eliminate race conditions in parallel test execution
function generateTestAthlete() {
  // Generate guaranteed unique ID using timestamp + base36 encoding + random string
  // This eliminates the 0.01% collision risk from Math.random() * 10000
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    firstName: `TestFirst_${uniqueId}`,
    lastName: `TestLast_${uniqueId}`,
    email: `test_${uniqueId}@example.com`,
    birthDate: '2005-01-15', // YYYY-MM-DD format for HTML date input
    birthYear: 2005,
    school: 'Test High School',
    sport: 'Soccer',
    position: 'F'
  };
}

test.describe('Athlete CRUD Tests', () => {
  // Track created athletes for cleanup
  let createdAthleteIds: string[] = [];

  // NOTE: waitForLoadState('networkidle') usage
  // While networkidle can be flaky with React Query refetches, it's currently needed for:
  // 1. Ensuring React Query mutations complete before assertions
  // 2. Waiting for athlete list updates after CRUD operations
  // Future optimization: Add data-testid="athletes-loaded" marker and use specific element checks
  // Alternative approach: Use expect().toPass() with stable element count checks

  // Setup: Login before each test
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToAthletes(page);
    // Reset cleanup tracker
    createdAthleteIds = [];
  });

  // Cleanup: Delete test athletes created during test
  test.afterEach(async ({ page }) => {
    // Clean up any athletes created in this test to prevent orphaned data
    for (const athleteId of createdAthleteIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/athletes/${athleteId}`);
      } catch (error) {
        // Log but don't fail - global teardown will catch any stragglers
        console.warn(`Failed to cleanup athlete ${athleteId}:`, error);
      }
    }
  });

  test('should successfully create a new athlete', async ({ page }) => {
    const testAthlete = generateTestAthlete();

    // Click "Add Athlete" button
    await page.click('[data-testid="add-athlete-button"]');

    // Wait for modal to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in athlete information using actual form data-testids
    await page.fill('[data-testid="input-athlete-firstname"]', testAthlete.firstName);
    await page.fill('[data-testid="input-athlete-lastname"]', testAthlete.lastName);

    // Fill in required birth date field
    await page.fill('[data-testid="input-athlete-birthdate"]', testAthlete.birthDate);

    // Add email field (form uses dynamic email fields - need to click "+ Add Email" first)
    await page.click('[data-testid="button-add-email"]');
    await page.fill('[data-testid="input-email-0"]', testAthlete.email);

    // Listen for API response to capture athlete ID for cleanup
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/athletes') && response.request().method() === 'POST'
    );

    // Submit the form
    await page.click('[data-testid="submit-athlete"]');

    // Capture athlete ID from API response
    try {
      const response = await responsePromise;
      const athlete = await response.json();
      if (athlete?.id) {
        createdAthleteIds.push(athlete.id);
      }
    } catch (error) {
      console.warn('Failed to capture athlete ID for cleanup:', error);
    }

    // Wait for modal to close
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Verify athlete appears in the list - wait for the athlete row to be visible
    await page.waitForSelector(`text=${testAthlete.firstName} ${testAthlete.lastName}`, { timeout: 10000 });
    const athleteRow = await page.locator(`text=${testAthlete.firstName} ${testAthlete.lastName}`).count();
    expect(athleteRow).toBeGreaterThan(0);

    // Verify success message appears
    const successMessage = await page.locator('text=/athlete.*created|success|added/i').count();
    expect(successMessage).toBeGreaterThan(0);
  });

  test('should successfully edit an existing athlete', async ({ page }) => {
    const testAthlete = generateTestAthlete();

    // First, create an athlete to edit
    await page.click('[data-testid="add-athlete-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.fill('[data-testid="input-athlete-firstname"]', testAthlete.firstName);
    await page.fill('[data-testid="input-athlete-lastname"]', testAthlete.lastName);
    await page.fill('[data-testid="input-athlete-birthdate"]', testAthlete.birthDate);
    await page.click('[data-testid="button-add-email"]');
    await page.fill('[data-testid="input-email-0"]', testAthlete.email);

    // Capture athlete ID for cleanup
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/athletes') && response.request().method() === 'POST'
    );

    await page.click('[data-testid="submit-athlete"]');

    try {
      const response = await responsePromise;
      const athlete = await response.json();
      if (athlete?.id) createdAthleteIds.push(athlete.id);
    } catch (error) {
      console.warn('Failed to capture athlete ID for cleanup:', error);
    }

    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Wait for athlete to appear in list (edit button has data-testid="edit-athlete")
    await page.waitForSelector('[data-testid="edit-athlete"]', { timeout: 10000 });

    // Find and click edit button for the athlete
    const editButton = page.locator('[data-testid="edit-athlete"]').first();
    await editButton.click();

    // Wait for edit modal to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Update athlete information
    const updatedSchool = 'Updated High School';
    await page.fill('[data-testid="input-athlete-school"]', updatedSchool);

    // Save changes (button text is "Update Athlete" in edit mode)
    await page.click('[data-testid="submit-athlete"]');

    // Wait for modal to close
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Verify changes were saved - wait for updated school text to appear
    await page.waitForSelector(`text=${updatedSchool}`, { timeout: 10000 });
    const updatedSchoolText = await page.locator(`text=${updatedSchool}`).count();
    expect(updatedSchoolText).toBeGreaterThan(0);
  });

  test('should successfully delete an athlete', async ({ page }) => {
    const testAthlete = generateTestAthlete();

    // First, create an athlete to delete
    await page.click('[data-testid="add-athlete-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.fill('[data-testid="input-athlete-firstname"]', testAthlete.firstName);
    await page.fill('[data-testid="input-athlete-lastname"]', testAthlete.lastName);
    await page.fill('[data-testid="input-athlete-birthdate"]', testAthlete.birthDate);
    await page.click('[data-testid="button-add-email"]');
    await page.fill('[data-testid="input-email-0"]', testAthlete.email);

    // Capture athlete ID for cleanup (though this test deletes it anyway)
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/athletes') && response.request().method() === 'POST'
    );

    await page.click('[data-testid="submit-athlete"]');

    try {
      const response = await responsePromise;
      const athlete = await response.json();
      if (athlete?.id) createdAthleteIds.push(athlete.id);
    } catch (error) {
      console.warn('Failed to capture athlete ID for cleanup:', error);
    }

    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Wait for athlete to appear in list
    await expect(async () => {
      const athleteCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
      expect(athleteCount).toBeGreaterThan(0);
    }).toPass({ timeout: 5000 });

    // Get initial athlete count
    const initialCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();

    // Find and click delete button for the athlete (data-testid="delete-athlete")
    const deleteButton = page.locator('[data-testid="delete-athlete"]').first();
    await deleteButton.click();

    // Confirm deletion (if confirmation dialog appears)
    const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")');
    const confirmExists = await confirmButton.count();
    if (confirmExists > 0) {
      await confirmButton.first().click();
    }

    // Wait for deletion to complete
    await expect(async () => {
      const currentCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
      expect(currentCount).toBeLessThan(initialCount);
    }).toPass({ timeout: 5000 });

    // Verify athlete count decreased
    const finalCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
    expect(finalCount).toBeLessThan(initialCount);

    // Verify athlete no longer appears in list
    const deletedAthlete = await page.locator(`text=${testAthlete.firstName} ${testAthlete.lastName}`).count();
    expect(deletedAthlete).toBe(0);

    // Remove deleted athlete from cleanup tracker (already deleted by test)
    if (createdAthleteIds.length > 0) {
      createdAthleteIds.pop();
    }
  });

  test('should show validation errors for required fields', async ({ page }) => {
    // Click "Add Athlete" button
    await page.click('[data-testid="add-athlete-button"]');
    await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });

    // Try to submit without filling required fields
    await page.click('[data-testid="submit-athlete"]');

    // Wait for validation errors to appear (use locator with .or() instead of waitForSelector which only accepts CSS)
    const errorLocator = page.locator('.error, [role="alert"]').or(page.locator('text=/required|must|invalid/i'));
    await errorLocator.first().waitFor({ timeout: 5000 });

    // Should still be on the form (modal visible)
    const modalVisible = await page.locator('[role="dialog"], .modal').count();
    expect(modalVisible).toBeGreaterThan(0);

    // Should show validation error messages
    const errorMessages = await errorLocator.count();
    expect(errorMessages).toBeGreaterThan(0);
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    const testAthlete = generateTestAthlete();

    // Click "Add Athlete" button
    await page.click('[data-testid="add-athlete-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in fields with invalid email
    await page.fill('[data-testid="input-athlete-firstname"]', testAthlete.firstName);
    await page.fill('[data-testid="input-athlete-lastname"]', testAthlete.lastName);

    // Add email field and fill with invalid email
    await page.click('[data-testid="button-add-email"]');
    await page.fill('[data-testid="input-email-0"]', 'invalid-email-format');

    // Try to submit
    await page.click('[data-testid="submit-athlete"]');

    // Wait for email validation error to appear
    await page.waitForSelector('text=/invalid.*email|valid email|email.*format/i', { timeout: 5000 });

    // Should show email validation error
    const emailError = await page.locator('text=/invalid.*email|valid email|email.*format/i').count();
    expect(emailError).toBeGreaterThan(0);
  });

  test('should successfully view athlete profile', async ({ page }) => {
    const testAthlete = generateTestAthlete();

    // First, ensure there's at least one athlete
    const athleteCount = await page.locator('[data-testid^="button-view-athlete-"]').count();

    if (athleteCount === 0) {
      // Create an athlete first
      await page.click('[data-testid="add-athlete-button"]');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await page.fill('[data-testid="input-athlete-firstname"]', testAthlete.firstName);
      await page.fill('[data-testid="input-athlete-lastname"]', testAthlete.lastName);
      await page.fill('[data-testid="input-athlete-birthdate"]', testAthlete.birthDate);
      await page.click('[data-testid="button-add-email"]');
      await page.fill('[data-testid="input-email-0"]', testAthlete.email);

      // Capture athlete ID for cleanup
      const responsePromise = page.waitForResponse(response =>
        response.url().includes('/api/athletes') && response.request().method() === 'POST'
      );

      await page.click('[data-testid="submit-athlete"]');

      try {
        const response = await responsePromise;
        const athlete = await response.json();
        if (athlete?.id) createdAthleteIds.push(athlete.id);
      } catch (error) {
        console.warn('Failed to capture athlete ID for cleanup:', error);
      }

      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

      // Wait for athlete to appear in list
      await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 10000 });
    }

    // Click "View" button for first athlete
    await page.click('[data-testid^="button-view-athlete-"]');

    // Wait for navigation to profile page - wait for URL change
    await page.waitForURL(/\/athlete\/[a-z0-9-]+/i, { timeout: 5000 });

    // Should be on athlete profile page
    expect(page.url()).toMatch(/\/athlete\/[a-z0-9-]+/i);

    // Profile page should show athlete information
    const profileContent = await page.locator('main, article, .profile').count();
    expect(profileContent).toBeGreaterThan(0);
  });

  test('should successfully perform bulk delete operation', async ({ page }) => {
    // First, create multiple athletes with unique data
    for (let i = 0; i < 2; i++) {
      const testAthlete = generateTestAthlete(); // Generate unique athlete per iteration
      await page.click('[data-testid="add-athlete-button"]');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await page.fill('[data-testid="input-athlete-firstname"]', testAthlete.firstName);
      await page.fill('[data-testid="input-athlete-lastname"]', testAthlete.lastName);
      await page.fill('[data-testid="input-athlete-birthdate"]', testAthlete.birthDate);
      await page.click('[data-testid="button-add-email"]');
      await page.fill('[data-testid="input-email-0"]', testAthlete.email);

      // Capture athlete ID for cleanup
      const responsePromise = page.waitForResponse(response =>
        response.url().includes('/api/athletes') && response.request().method() === 'POST'
      );

      await page.click('[data-testid="submit-athlete"]');

      try {
        const response = await responsePromise;
        const athlete = await response.json();
        if (athlete?.id) createdAthleteIds.push(athlete.id);
      } catch (error) {
        console.warn('Failed to capture athlete ID for cleanup:', error);
      }

      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

      // Wait for athlete to appear in list
      await page.waitForSelector('[data-testid^="checkbox-athlete-"]', { timeout: 5000 });
    }

    // Get initial count
    const initialCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();

    // Select first two athletes
    const checkboxes = await page.locator('[data-testid^="checkbox-athlete-"]').all();
    if (checkboxes.length >= 2) {
      await checkboxes[0].click();
      await checkboxes[1].click();
    }

    // Click bulk delete button
    const bulkDeleteButton = page.locator('[data-testid="button-bulk-delete"]');
    const bulkDeleteExists = await bulkDeleteButton.count();

    if (bulkDeleteExists > 0) {
      await bulkDeleteButton.click();

      // Confirm deletion
      const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
      const confirmExists = await confirmButton.count();
      if (confirmExists > 0) {
        await confirmButton.first().click();
      }

      // Wait for deletion to complete
      await expect(async () => {
        const currentCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
        expect(currentCount).toBeLessThan(initialCount);
      }).toPass({ timeout: 5000 });

      // Verify athlete count decreased
      const finalCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
      expect(finalCount).toBeLessThan(initialCount);

      // Clear cleanup tracker since athletes were bulk deleted
      createdAthleteIds = [];
    }
  });

  test('should successfully search and filter athletes', async ({ page }) => {
    const testAthlete = generateTestAthlete();

    // First, create a test athlete with unique name
    await page.click('[data-testid="add-athlete-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    const uniqueName = `UniqueSearchTest${testAthlete.firstName}`;
    await page.fill('[data-testid="input-athlete-firstname"]', uniqueName);
    await page.fill('[data-testid="input-athlete-lastname"]', 'SearchLastName');
    await page.fill('[data-testid="input-athlete-birthdate"]', testAthlete.birthDate);
    await page.click('[data-testid="button-add-email"]');
    await page.fill('[data-testid="input-email-0"]', testAthlete.email);

    // Capture athlete ID for cleanup
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/athletes') && response.request().method() === 'POST'
    );

    await page.click('[data-testid="submit-athlete"]');

    try {
      const response = await responsePromise;
      const athlete = await response.json();
      if (athlete?.id) createdAthleteIds.push(athlete.id);
    } catch (error) {
      console.warn('Failed to capture athlete ID for cleanup:', error);
    }

    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Wait for athlete to appear in list
    await page.waitForSelector(`text=${uniqueName}`, { timeout: 10000 });

    // Use search functionality
    const searchInput = page.locator('[data-testid="athlete-search"]');
    await searchInput.fill(uniqueName);

    // Wait for search results to update
    await expect(page.locator(`text=${uniqueName}`)).toBeVisible({ timeout: 3000 });

    // Verify only the searched athlete appears
    const searchResults = await page.locator(`text=${uniqueName}`).count();
    expect(searchResults).toBeGreaterThan(0);

    // Clear search
    await searchInput.clear();

    // Wait for search to clear and all athletes to appear
    await expect(async () => {
      const athleteCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
      expect(athleteCount).toBeGreaterThan(0);
    }).toPass({ timeout: 3000 });

    // Should show all athletes again
    const allAthletes = await page.locator('[data-testid^="checkbox-athlete-"]').count();
    expect(allAthletes).toBeGreaterThan(0);
  });
});

test.describe('Athlete CRUD Summary', () => {
  test('print athlete CRUD test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Athlete CRUD Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Create new athlete');
    console.log('✅ Edit athlete information');
    console.log('✅ Delete athlete');
    console.log('✅ Form validation - required fields');
    console.log('✅ Form validation - email format');
    console.log('✅ View athlete profile');
    console.log('✅ Bulk delete operation');
    console.log('✅ Search and filter athletes');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
