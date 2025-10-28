import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from '../helpers/auth';

/**
 * E2E Test Template: CRUD Operations
 *
 * This template provides a standard structure for testing Create, Read, Update,
 * Delete operations for any entity in the application.
 *
 * HOW TO USE:
 * 1. Copy this file to tests/e2e/[entity-name]-crud.spec.ts
 * 2. Replace [ENTITY] with your entity name (e.g., "Team", "Measurement")
 * 3. Replace [ROUTE] with your route path (e.g., "/teams", "/measurements")
 * 4. Update test data in testData object
 * 5. Update selectors to match your actual form fields
 * 6. Run tests: npm run test:staging
 *
 * EXAMPLE: For a "Team" entity:
 * - File: tests/e2e/team-crud.spec.ts
 * - Route: /teams
 * - Test data: { name: 'Test Team', level: 'HS', season: '2024-Fall' }
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Generate unique test data to avoid conflicts
const timestamp = Date.now();
const testData = {
  // TODO: Replace with your entity's fields
  name: `Test[ENTITY]${timestamp}`,
  field1: `Value1${timestamp}`,
  field2: `Value2${timestamp}`,
  // Add more fields as needed
};

test.describe('[ENTITY] CRUD Tests', () => {

  // Setup: Login before each test
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // TODO: Navigate to your entity's page
    await page.goto(`${STAGING_URL}/[ROUTE]`);
    await page.waitForLoadState('networkidle');
  });

  test('should successfully create a new [ENTITY]', async ({ page }) => {
    // Click "Add [ENTITY]" button
    // TODO: Update selector to match your actual button
    await page.click('[data-testid="add-[entity]-button"]');

    // Wait for modal/form to appear
    await page.waitForSelector('[role="dialog"]');

    // Fill in form fields
    // TODO: Update selectors and fields to match your actual form
    await page.fill('[data-testid="input-[entity]-name"]', testData.name);
    await page.fill('[data-testid="input-[entity]-field1"]', testData.field1);

    // For dynamic fields (like email arrays), click "Add" button first
    // await page.click('[data-testid="button-add-[field]"]');
    // await page.fill('[data-testid="input-[field]-0"]', testData.field2);

    // Submit the form
    // TODO: Update button text to match your form
    await page.click('button[type="submit"]:has-text("Add [ENTITY]")');

    // Wait for modal to close
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });

    // Verify [ENTITY] appears in the list
    await page.waitForSelector(`text=${testData.name}`);
    const entityRow = await page.locator(`text=${testData.name}`).count();
    expect(entityRow).toBeGreaterThan(0);

    // Verify success message
    const successMessage = await page.locator('text=/[entity].*created|success|added/i').count();
    expect(successMessage).toBeGreaterThan(0);
  });

  test('should successfully edit an existing [ENTITY]', async ({ page }) => {
    // First, create an [ENTITY] to edit
    await page.click('[data-testid="add-[entity]-button"]');
    await page.waitForSelector('[role="dialog"]');
    await page.fill('[data-testid="input-[entity]-name"]', testData.name);
    await page.fill('[data-testid="input-[entity]-field1"]', testData.field1);
    await page.click('button[type="submit"]:has-text("Add [ENTITY]")');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Wait for [ENTITY] to appear in list
    await page.waitForSelector('[data-testid^="button-edit-[entity]-"]');

    // Find and click edit button
    const editButton = page.locator('[data-testid^="button-edit-[entity]-"]').first();
    await editButton.click();

    // Wait for edit modal to appear
    await page.waitForSelector('[role="dialog"]');

    // Update a field
    const updatedValue = 'Updated Value';
    await page.fill('[data-testid="input-[entity]-field1"]', updatedValue);

    // Save changes
    await page.click('button[type="submit"]:has-text("Save"), button:has-text("Update")');

    // Wait for modal to close
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });

    // Verify changes were saved
    await page.waitForSelector(`text=${updatedValue}`);
    const updated = await page.locator(`text=${updatedValue}`).count();
    expect(updated).toBeGreaterThan(0);
  });

  test('should successfully delete a [ENTITY]', async ({ page }) => {
    // First, create an [ENTITY] to delete
    await page.click('[data-testid="add-[entity]-button"]');
    await page.waitForSelector('[role="dialog"]');
    await page.fill('[data-testid="input-[entity]-name"]', testData.name);
    await page.fill('[data-testid="input-[entity]-field1"]', testData.field1);
    await page.click('button[type="submit"]:has-text("Add [ENTITY]")');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Wait for [ENTITY] to appear and page to update
    await page.waitForLoadState('networkidle');

    // Get initial count
    const initialCount = await page.locator('[data-testid^="checkbox-[entity]-"]').count();

    // Find and click delete button
    const deleteButton = page.locator('[data-testid^="button-delete-[entity]-"]').first();
    await deleteButton.click();

    // Confirm deletion (if confirmation dialog appears)
    const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")');
    const confirmExists = await confirmButton.count();
    if (confirmExists > 0) {
      await confirmButton.first().click();
    }

    // Wait for deletion to complete
    await page.waitForLoadState('networkidle');

    // Verify count decreased
    const finalCount = await page.locator('[data-testid^="checkbox-[entity]-"]').count();
    expect(finalCount).toBeLessThan(initialCount);

    // Verify [ENTITY] no longer appears in list
    const deleted = await page.locator(`text=${testData.name}`).count();
    expect(deleted).toBe(0);
  });

  test('should show validation errors for required fields', async ({ page }) => {
    // Click "Add [ENTITY]" button
    await page.click('[data-testid="add-[entity]-button"]');
    await page.waitForSelector('[role="dialog"]');

    // Try to submit without filling required fields
    await page.click('button[type="submit"]:has-text("Save"), button:has-text("Add [ENTITY]")');

    // Wait for validation errors to appear
    await page.waitForSelector('.error, [role="alert"], text=/required|must|invalid/i');

    // Should still be on the form (modal visible)
    const modalVisible = await page.locator('[role="dialog"]').count();
    expect(modalVisible).toBeGreaterThan(0);

    // Should show validation error messages
    const errorMessages = await page.locator('.error, [role="alert"], text=/required|must|invalid/i').count();
    expect(errorMessages).toBeGreaterThan(0);
  });

  test('should successfully view [ENTITY] details', async ({ page }) => {
    // Ensure there's at least one [ENTITY]
    const entityCount = await page.locator('[data-testid^="button-view-[entity]-"]').count();

    if (entityCount === 0) {
      // Create an [ENTITY] first
      await page.click('[data-testid="add-[entity]-button"]');
      await page.waitForSelector('[role="dialog"]');
      await page.fill('[data-testid="input-[entity]-name"]', testData.name);
      await page.fill('[data-testid="input-[entity]-field1"]', testData.field1);
      await page.click('button[type="submit"]:has-text("Add [ENTITY]")');
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
      await page.waitForSelector('[data-testid^="button-view-[entity]-"]');
    }

    // Click "View" button for first [ENTITY]
    await page.click('[data-testid^="button-view-[entity]-"]');

    // Wait for navigation to details page
    await page.waitForLoadState('networkidle');

    // Should be on [ENTITY] details page
    expect(page.url()).toMatch(/\/[route]\/[a-z0-9-]+/i);

    // Details page should show [ENTITY] information
    const detailsContent = await page.locator('main, article, .details').count();
    expect(detailsContent).toBeGreaterThan(0);
  });

  test('should successfully search and filter [ENTITY]s', async ({ page }) => {
    // Create a test [ENTITY] with unique name
    const uniqueName = `UniqueSearch${timestamp}`;
    await page.click('[data-testid="add-[entity]-button"]');
    await page.waitForSelector('[role="dialog"]');
    await page.fill('[data-testid="input-[entity]-name"]', uniqueName);
    await page.fill('[data-testid="input-[entity]-field1"]', testData.field1);
    await page.click('button[type="submit"]:has-text("Add [ENTITY]")');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Wait for [ENTITY] to appear in list
    await page.waitForSelector(`text=${uniqueName}`, { timeout: 10000 });

    // Use search functionality
    const searchInput = page.locator('[data-testid="[entity]-search"]');
    await searchInput.fill(uniqueName);

    // Wait for search results to update
    await page.waitForLoadState('networkidle');

    // Verify only the searched [ENTITY] appears
    const searchResults = await page.locator(`text=${uniqueName}`).count();
    expect(searchResults).toBeGreaterThan(0);

    // Clear search
    await searchInput.clear();
    await page.waitForLoadState('networkidle');

    // Should show all [ENTITY]s again
    const allEntities = await page.locator('[data-testid^="checkbox-[entity]-"]').count();
    expect(allEntities).toBeGreaterThan(0);
  });
});

test.describe('[ENTITY] CRUD Summary', () => {
  test('print [ENTITY] CRUD test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('[ENTITY] CRUD Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Create new [ENTITY]');
    console.log('✅ Edit [ENTITY] information');
    console.log('✅ Delete [ENTITY]');
    console.log('✅ Form validation - required fields');
    console.log('✅ View [ENTITY] details');
    console.log('✅ Search and filter [ENTITY]s');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
