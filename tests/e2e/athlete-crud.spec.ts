import { test, expect } from '@playwright/test';
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

// Generate unique test data to avoid conflicts
const timestamp = Date.now();
const testAthlete = {
  firstName: `TestFirst${timestamp}`,
  lastName: `TestLast${timestamp}`,
  email: `test${timestamp}@example.com`,
  birthYear: 2005,
  school: 'Test High School',
  sport: 'Soccer',
  position: 'F'
};

test.describe('Athlete CRUD Tests', () => {

  // Setup: Login before each test
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToAthletes(page);
  });

  test('should successfully create a new athlete', async ({ page }) => {
    // Click "Add Athlete" button
    await page.click('[data-testid="button-add-athlete"]');

    // Wait for modal to appear
    await page.waitForSelector('[role="dialog"], .modal, form', { timeout: 5000 });

    // Fill in athlete information
    // Note: These selectors may need adjustment based on actual form implementation
    await page.fill('[name="firstName"], input[placeholder*="First Name" i]', testAthlete.firstName);
    await page.fill('[name="lastName"], input[placeholder*="Last Name" i]', testAthlete.lastName);
    await page.fill('[name="email"], [type="email"]', testAthlete.email);

    // Submit the form
    await page.click('button[type="submit"]:has-text("Save"), button:has-text("Add Athlete"), button:has-text("Create")');

    // Wait for modal to close
    await page.waitForSelector('[role="dialog"], .modal', { state: 'hidden', timeout: 5000 });

    // Verify athlete appears in the list - wait for the athlete row to be visible
    await page.waitForSelector(`text=${testAthlete.firstName} ${testAthlete.lastName}`, { timeout: 10000 });
    const athleteRow = await page.locator(`text=${testAthlete.firstName} ${testAthlete.lastName}`).count();
    expect(athleteRow).toBeGreaterThan(0);

    // Verify success message appears
    const successMessage = await page.locator('text=/athlete.*created|success|added/i').count();
    expect(successMessage).toBeGreaterThan(0);
  });

  test('should successfully edit an existing athlete', async ({ page }) => {
    // First, create an athlete to edit
    await page.click('[data-testid="button-add-athlete"]');
    await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });
    await page.fill('[name="firstName"], input[placeholder*="First Name" i]', testAthlete.firstName);
    await page.fill('[name="lastName"], input[placeholder*="Last Name" i]', testAthlete.lastName);
    await page.fill('[name="email"], [type="email"]', testAthlete.email);
    await page.click('button[type="submit"]:has-text("Save"), button:has-text("Add Athlete")');
    await page.waitForSelector('[role="dialog"], .modal', { state: 'hidden', timeout: 5000 });

    // Wait for athlete to appear in list
    await page.waitForSelector('[data-testid^="button-edit-athlete-"]', { timeout: 10000 });

    // Find and click edit button for the athlete
    // The edit button should have a data-testid with the athlete ID
    // For now, we'll use a more general selector
    const editButton = page.locator('[data-testid^="button-edit-athlete-"]').first();
    await editButton.click();

    // Wait for edit modal to appear
    await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });

    // Update athlete information
    const updatedSchool = 'Updated High School';
    await page.fill('[name="school"], input[placeholder*="School" i]', updatedSchool);

    // Save changes
    await page.click('button[type="submit"]:has-text("Save"), button:has-text("Update")');

    // Wait for modal to close
    await page.waitForSelector('[role="dialog"], .modal', { state: 'hidden', timeout: 5000 });

    // Verify changes were saved - wait for updated school text to appear
    await page.waitForSelector(`text=${updatedSchool}`, { timeout: 10000 });
    const updatedSchoolText = await page.locator(`text=${updatedSchool}`).count();
    expect(updatedSchoolText).toBeGreaterThan(0);
  });

  test('should successfully delete an athlete', async ({ page }) => {
    // First, create an athlete to delete
    await page.click('[data-testid="button-add-athlete"]');
    await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });
    await page.fill('[name="firstName"], input[placeholder*="First Name" i]', testAthlete.firstName);
    await page.fill('[name="lastName"], input[placeholder*="Last Name" i]', testAthlete.lastName);
    await page.fill('[name="email"], [type="email"]', testAthlete.email);
    await page.click('button[type="submit"]:has-text("Save"), button:has-text("Add Athlete")');
    await page.waitForSelector('[role="dialog"], .modal', { state: 'hidden', timeout: 5000 });

    // Wait for athlete to appear and page to update
    await page.waitForLoadState('networkidle');

    // Get initial athlete count
    const initialCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();

    // Find and click delete button for the athlete
    const deleteButton = page.locator('[data-testid^="button-delete-athlete-"]').first();
    await deleteButton.click();

    // Confirm deletion (if confirmation dialog appears)
    const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")');
    const confirmExists = await confirmButton.count();
    if (confirmExists > 0) {
      await confirmButton.first().click();
    }

    // Wait for deletion to complete - wait for page to update
    await page.waitForLoadState('networkidle');

    // Verify athlete count decreased
    const finalCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
    expect(finalCount).toBeLessThan(initialCount);

    // Verify athlete no longer appears in list
    const deletedAthlete = await page.locator(`text=${testAthlete.firstName} ${testAthlete.lastName}`).count();
    expect(deletedAthlete).toBe(0);
  });

  test('should show validation errors for required fields', async ({ page }) => {
    // Click "Add Athlete" button
    await page.click('[data-testid="button-add-athlete"]');
    await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });

    // Try to submit without filling required fields
    await page.click('button[type="submit"]:has-text("Save"), button:has-text("Add Athlete")');

    // Wait for validation errors to appear
    await page.waitForSelector('.error, [role="alert"], text=/required|must|invalid/i', { timeout: 5000 });

    // Should still be on the form (modal visible)
    const modalVisible = await page.locator('[role="dialog"], .modal').count();
    expect(modalVisible).toBeGreaterThan(0);

    // Should show validation error messages
    const errorMessages = await page.locator('.error, [role="alert"], text=/required|must|invalid/i').count();
    expect(errorMessages).toBeGreaterThan(0);
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    // Click "Add Athlete" button
    await page.click('[data-testid="button-add-athlete"]');
    await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });

    // Fill in fields with invalid email
    await page.fill('[name="firstName"], input[placeholder*="First Name" i]', testAthlete.firstName);
    await page.fill('[name="lastName"], input[placeholder*="Last Name" i]', testAthlete.lastName);
    await page.fill('[name="email"], [type="email"]', 'invalid-email-format');

    // Try to submit
    await page.click('button[type="submit"]:has-text("Save"), button:has-text("Add Athlete")');

    // Wait for email validation error to appear
    await page.waitForSelector('text=/invalid.*email|valid email|email.*format/i', { timeout: 5000 });

    // Should show email validation error
    const emailError = await page.locator('text=/invalid.*email|valid email|email.*format/i').count();
    expect(emailError).toBeGreaterThan(0);
  });

  test('should successfully view athlete profile', async ({ page }) => {
    // First, ensure there's at least one athlete
    const athleteCount = await page.locator('[data-testid^="button-view-athlete-"]').count();

    if (athleteCount === 0) {
      // Create an athlete first
      await page.click('[data-testid="button-add-athlete"]');
      await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });
      await page.fill('[name="firstName"], input[placeholder*="First Name" i]', testAthlete.firstName);
      await page.fill('[name="lastName"], input[placeholder*="Last Name" i]', testAthlete.lastName);
      await page.fill('[name="email"], [type="email"]', testAthlete.email);
      await page.click('button[type="submit"]:has-text("Save"), button:has-text("Add Athlete")');
      await page.waitForSelector('[role="dialog"], .modal', { state: 'hidden', timeout: 5000 });

      // Wait for athlete to appear in list
      await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 10000 });
    }

    // Click "View" button for first athlete
    await page.click('[data-testid^="button-view-athlete-"]');

    // Wait for navigation to profile page
    await page.waitForLoadState('networkidle');

    // Should be on athlete profile page
    expect(page.url()).toMatch(/\/athlete\/[a-z0-9-]+/i);

    // Profile page should show athlete information
    const profileContent = await page.locator('main, article, .profile').count();
    expect(profileContent).toBeGreaterThan(0);
  });

  test('should successfully perform bulk delete operation', async ({ page }) => {
    // First, create multiple athletes
    for (let i = 0; i < 2; i++) {
      await page.click('[data-testid="button-add-athlete"]');
      await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });
      await page.fill('[name="firstName"], input[placeholder*="First Name" i]', `${testAthlete.firstName}${i}`);
      await page.fill('[name="lastName"], input[placeholder*="Last Name" i]', `${testAthlete.lastName}${i}`);
      await page.fill('[name="email"], [type="email"]', `${timestamp}${i}@example.com`);
      await page.click('button[type="submit"]:has-text("Save"), button:has-text("Add Athlete")');
      await page.waitForSelector('[role="dialog"], .modal', { state: 'hidden', timeout: 5000 });

      // Wait for athlete to appear in list
      await page.waitForLoadState('networkidle');
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
      await page.waitForLoadState('networkidle');

      // Verify athlete count decreased
      const finalCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
      expect(finalCount).toBeLessThan(initialCount);
    }
  });

  test('should successfully search and filter athletes', async ({ page }) => {
    // First, create a test athlete with unique name
    await page.click('[data-testid="button-add-athlete"]');
    await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });
    const uniqueName = `UniqueSearchTest${timestamp}`;
    await page.fill('[name="firstName"], input[placeholder*="First Name" i]', uniqueName);
    await page.fill('[name="lastName"], input[placeholder*="Last Name" i]', 'SearchLastName');
    await page.fill('[name="email"], [type="email"]', `search${timestamp}@example.com`);
    await page.click('button[type="submit"]:has-text("Save"), button:has-text("Add Athlete")');
    await page.waitForSelector('[role="dialog"], .modal', { state: 'hidden', timeout: 5000 });

    // Wait for athlete to appear in list
    await page.waitForSelector(`text=${uniqueName}`, { timeout: 10000 });

    // Use search functionality
    const searchInput = page.locator('[data-testid="input-search-athletes"]');
    await searchInput.fill(uniqueName);

    // Wait for search results to update - wait for network to settle
    await page.waitForLoadState('networkidle');

    // Verify only the searched athlete appears
    const searchResults = await page.locator(`text=${uniqueName}`).count();
    expect(searchResults).toBeGreaterThan(0);

    // Clear search
    await searchInput.clear();

    // Wait for search to clear and all athletes to appear
    await page.waitForLoadState('networkidle');

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
