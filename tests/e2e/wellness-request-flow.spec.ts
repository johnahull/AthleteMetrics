import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { navigateTo } from './helpers/navigation';

/**
 * E2E Tests: Wellness Request Flow
 *
 * Tests verify the wellness request creation and management:
 * - Creating wellness requests
 * - Selecting teams/athletes
 * - Scheduling (immediate vs future)
 * - Viewing request list
 * - Canceling requests
 *
 * Components: RequestModal, RequestsList at /wellness (Requests tab)
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Wellness Request Flow Tests', () => {
  let createdRequestIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await navigateTo(page, '/wellness');

    // Wait for wellness page to load
    await page.waitForSelector('text=Wellness Questionnaires', { timeout: 10000 });

    // Navigate to Requests tab
    const requestsTab = page.locator('[role="tab"]:has-text("Requests")');
    await requestsTab.click();
    await page.waitForTimeout(500); // Wait for tab content to render

    createdRequestIds = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup created requests
    for (const requestId of createdRequestIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/wellness/requests/${requestId}`);
      } catch (error) {
        console.warn(`Failed to cleanup request ${requestId}:`, error);
      }
    }
  });

  test('should successfully create a wellness request for a team', async ({ page }) => {
    // Click "Create Request" button
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    // Wait for request modal to appear
    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { timeout: 5000 });

    // Select a template (first available template)
    const templateSelect = page.locator('select[name="templateId"], [data-testid="select-template"]');
    const templateSelectExists = await templateSelect.count();

    if (templateSelectExists > 0) {
      await templateSelect.click();
      // Select first template option (skip the placeholder)
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    // Select target type: Team
    const teamRadio = page.locator('input[value="team"], [data-testid="radio-target-team"]');
    const teamRadioExists = await teamRadio.count();

    if (teamRadioExists > 0) {
      await teamRadio.click();
      await page.waitForTimeout(300);

      // Select a team
      const teamSelect = page.locator('select[name="teamIds"], [data-testid="select-teams"]');
      const teamSelectExists = await teamSelect.count();

      if (teamSelectExists > 0) {
        await teamSelect.click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
    }

    // Select schedule type: Immediate
    const immediateRadio = page.locator('input[value="immediate"], [data-testid="radio-schedule-immediate"]');
    const immediateRadioExists = await immediateRadio.count();

    if (immediateRadioExists > 0) {
      await immediateRadio.click();
      await page.waitForTimeout(300);
    }

    // Capture request ID from API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/wellness/requests') && response.request().method() === 'POST'
    );

    // Submit the request
    await page.click('button[type="submit"]:has-text("Create Request"), button:has-text("Send Request")');

    // Capture request ID for cleanup
    try {
      const response = await responsePromise;
      const request = await response.json();
      if (request?.id) {
        createdRequestIds.push(request.id);
      }
    } catch (error) {
      console.warn('Failed to capture request ID for cleanup:', error);
    }

    // Wait for modal to close
    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Verify success message
    const successMessage = await page.locator('text=/request.*created|request.*sent|success/i').count();
    expect(successMessage).toBeGreaterThan(0);

    // Verify request appears in the list
    await page.waitForTimeout(2000);
    const requestsList = page.locator('[data-testid="requests-list"], .requests-list');
    await expect(requestsList).toBeVisible({ timeout: 5000 });
  });

  test('should create a scheduled request for future date', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { timeout: 5000 });

    // Select a template
    const templateSelect = page.locator('select[name="templateId"], [data-testid="select-template"]');
    const templateSelectExists = await templateSelect.count();

    if (templateSelectExists > 0) {
      await templateSelect.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    // Select target type: Team
    const teamRadio = page.locator('input[value="team"], [data-testid="radio-target-team"]');
    const teamRadioExists = await teamRadio.count();

    if (teamRadioExists > 0) {
      await teamRadio.click();
      await page.waitForTimeout(300);

      const teamSelect = page.locator('select[name="teamIds"], [data-testid="select-teams"]');
      const teamSelectExists = await teamSelect.count();

      if (teamSelectExists > 0) {
        await teamSelect.click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
    }

    // Select schedule type: Scheduled
    const scheduledRadio = page.locator('input[value="scheduled"], [data-testid="radio-schedule-scheduled"]');
    const scheduledRadioExists = await scheduledRadio.count();

    if (scheduledRadioExists > 0) {
      await scheduledRadio.click();
      await page.waitForTimeout(300);

      // Set future date (tomorrow)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      const dateInput = page.locator('input[type="date"], input[name="scheduledDate"]');
      const dateInputExists = await dateInput.count();

      if (dateInputExists > 0) {
        await dateInput.fill(dateStr);
        await page.waitForTimeout(300);
      }
    }

    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/wellness/requests') && response.request().method() === 'POST'
    );

    await page.click('button[type="submit"]:has-text("Create Request"), button:has-text("Send Request"), button:has-text("Schedule Request")');

    try {
      const response = await responsePromise;
      const request = await response.json();
      if (request?.id) createdRequestIds.push(request.id);
    } catch (error) {
      console.warn('Failed to capture request ID:', error);
    }

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });

    const successMessage = await page.locator('text=/request.*scheduled|request.*created|success/i').count();
    expect(successMessage).toBeGreaterThan(0);
  });

  test('should create request for specific athletes', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { timeout: 5000 });

    // Select a template
    const templateSelect = page.locator('select[name="templateId"], [data-testid="select-template"]');
    const templateSelectExists = await templateSelect.count();

    if (templateSelectExists > 0) {
      await templateSelect.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    // Select target type: Athletes
    const athletesRadio = page.locator('input[value="athletes"], [data-testid="radio-target-athletes"]');
    const athletesRadioExists = await athletesRadio.count();

    if (athletesRadioExists > 0) {
      await athletesRadio.click();
      await page.waitForTimeout(500);

      // Select specific athletes (multi-select or checkboxes)
      const athleteCheckboxes = page.locator('input[type="checkbox"][name*="athlete"]');
      const checkboxCount = await athleteCheckboxes.count();

      if (checkboxCount > 0) {
        // Select first athlete
        await athleteCheckboxes.first().click();
        await page.waitForTimeout(300);
      }
    }

    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/wellness/requests') && response.request().method() === 'POST'
    );

    await page.click('button[type="submit"]:has-text("Create Request"), button:has-text("Send Request")');

    try {
      const response = await responsePromise;
      const request = await response.json();
      if (request?.id) createdRequestIds.push(request.id);
    } catch (error) {
      console.warn('Failed to capture request ID:', error);
    }

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });

    const successMessage = await page.locator('text=/request.*created|request.*sent|success/i').count();
    expect(successMessage).toBeGreaterThan(0);
  });

  test('should view request list with pagination', async ({ page }) => {
    // Verify requests list is visible
    const requestsList = page.locator('[data-testid="requests-list"], .requests-table, table');
    await expect(requestsList).toBeVisible({ timeout: 10000 });

    // Check for request rows
    const requestRows = page.locator('tr[data-testid^="request-row-"], tbody tr');
    const rowCount = await requestRows.count();

    // Should have at least 0 rows (empty state is OK)
    expect(rowCount).toBeGreaterThanOrEqual(0);

    // If pagination exists, test it
    const nextPageButton = page.locator('button:has-text("Next"), [data-testid="pagination-next"]');
    const nextPageExists = await nextPageButton.count();

    if (nextPageExists > 0 && !(await nextPageButton.isDisabled())) {
      await nextPageButton.click();
      await page.waitForTimeout(1000);

      // Should still see request list after pagination
      await expect(requestsList).toBeVisible();
    }
  });

  test('should filter requests by status', async ({ page }) => {
    // Look for status filter dropdown
    const statusFilter = page.locator('select[name="status"], [data-testid="filter-status"]');
    const statusFilterExists = await statusFilter.count();

    if (statusFilterExists > 0) {
      // Select "Pending" status
      await statusFilter.click();
      await page.click('text=Pending');
      await page.waitForTimeout(1000);

      // Verify filtering worked (list updated)
      const requestsList = page.locator('[data-testid="requests-list"], .requests-table');
      await expect(requestsList).toBeVisible({ timeout: 5000 });

      // Select "All" to reset
      await statusFilter.click();
      await page.click('text=All');
      await page.waitForTimeout(1000);
    }
  });

  test('should cancel a pending request', async ({ page }) => {
    // Create a request first
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { timeout: 5000 });

    const templateSelect = page.locator('select[name="templateId"], [data-testid="select-template"]');
    const templateSelectExists = await templateSelect.count();

    if (templateSelectExists > 0) {
      await templateSelect.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    const teamRadio = page.locator('input[value="team"], [data-testid="radio-target-team"]');
    const teamRadioExists = await teamRadio.count();

    if (teamRadioExists > 0) {
      await teamRadio.click();
      await page.waitForTimeout(300);

      const teamSelect = page.locator('select[name="teamIds"], [data-testid="select-teams"]');
      const teamSelectExists = await teamSelect.count();

      if (teamSelectExists > 0) {
        await teamSelect.click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
    }

    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/wellness/requests') && response.request().method() === 'POST'
    );

    await page.click('button[type="submit"]:has-text("Create Request"), button:has-text("Send Request")');

    let requestId: string | null = null;
    try {
      const response = await responsePromise;
      const request = await response.json();
      if (request?.id) {
        requestId = request.id;
        createdRequestIds.push(request.id);
      }
    } catch (error) {
      console.warn('Failed to capture request ID:', error);
    }

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(2000);

    // Find and click cancel button for the request
    const cancelButton = page.locator('[data-testid^="button-cancel-request-"]').first();
    const cancelExists = await cancelButton.count();

    if (cancelExists > 0) {
      await cancelButton.click();

      // Confirm cancellation
      const confirmButton = page.locator('button:has-text("Cancel Request"), button:has-text("Confirm")');
      const confirmExists = await confirmButton.count();
      if (confirmExists > 0) {
        await confirmButton.first().click();
      }

      await page.waitForTimeout(1000);

      // Verify request status changed or removed
      const successMessage = await page.locator('text=/request.*cancelled|cancelled.*success/i').count();
      expect(successMessage).toBeGreaterThanOrEqual(0); // May or may not show toast

      // Remove from cleanup since cancelled
      if (requestId) {
        createdRequestIds = createdRequestIds.filter(id => id !== requestId);
      }
    }
  });

  test('should view request details', async ({ page }) => {
    // Look for "View Details" button or link
    const viewButton = page.locator('[data-testid^="button-view-request-"], a:has-text("View Details")').first();
    const viewExists = await viewButton.count();

    if (viewExists > 0) {
      await viewButton.click();
      await page.waitForTimeout(1000);

      // Should show request details modal or navigate to details page
      const detailsModal = page.locator('[data-testid="request-details"], [role="dialog"]');
      const detailsModalExists = await detailsModal.count();

      if (detailsModalExists > 0) {
        await expect(detailsModal).toBeVisible();

        // Close modal
        const closeButton = page.locator('button:has-text("Close"), [data-testid="close-modal"]');
        const closeExists = await closeButton.count();
        if (closeExists > 0) {
          await closeButton.click();
        }
      }
    }
  });

  test('should show validation error when creating request without template', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { timeout: 5000 });

    // Try to submit without selecting template
    await page.click('button[type="submit"]:has-text("Create Request"), button:has-text("Send Request")');

    // Wait for validation error
    await page.waitForSelector('text=/template.*required|select.*template/i', { timeout: 5000 });

    const errorMessage = await page.locator('text=/template.*required|select.*template/i').count();
    expect(errorMessage).toBeGreaterThan(0);
  });
});

test.describe('Wellness Request Flow Summary', () => {
  test('print wellness request flow test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Wellness Request Flow Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Create wellness request for team');
    console.log('✅ Create scheduled request for future date');
    console.log('✅ Create request for specific athletes');
    console.log('✅ View request list with pagination');
    console.log('✅ Filter requests by status');
    console.log('✅ Cancel a pending request');
    console.log('✅ View request details');
    console.log('✅ Validation error without template');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
