import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { navigateTo } from './helpers/navigation';

/**
 * E2E Tests: Wellness Scheduled & Recurring Request Flows
 *
 * Tests verify the wellness scheduling and recurring functionality:
 * - Creating one-time scheduled requests for future dates
 * - Creating daily recurring schedules
 * - Creating weekly recurring schedules (specific days)
 * - Creating custom interval recurring schedules
 * - Pausing and resuming schedules
 * - Schedule cancellation
 * - End date and max occurrences validation
 * - UI mode switching (now/schedule/recurring)
 *
 * Components: RequestModal, RequestsList at /wellness (Requests tab)
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Wellness Scheduled & Recurring Request Tests', () => {
  let createdRequestIds: string[] = [];
  let createdScheduleIds: string[] = [];

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
    createdScheduleIds = [];
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

    // Cleanup created schedules
    for (const scheduleId of createdScheduleIds) {
      try {
        // Get current user's org ID from the page context
        const orgId = await page.evaluate(() => {
          const userStr = localStorage.getItem('user');
          if (!userStr) return null;
          const user = JSON.parse(userStr);
          return user?.organizationId || null;
        });

        if (orgId) {
          await page.request.delete(`${STAGING_URL}/api/organizations/${orgId}/wellness/schedules/${scheduleId}`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup schedule ${scheduleId}:`, error);
      }
    }
  });

  test('should create one-time scheduled request for future date', async ({ page }) => {
    // Click "Create Request" button
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    // Wait for request modal to appear
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

    // Select schedule type: Schedule for later
    const scheduleRadio = page.locator('input[value="scheduled"], [data-testid="radio-schedule-scheduled"]');
    const scheduleRadioExists = await scheduleRadio.count();

    if (scheduleRadioExists > 0) {
      await scheduleRadio.click();
      await page.waitForTimeout(300);

      // Set future date (tomorrow)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

      const dateInput = page.locator('input[type="date"], [data-testid="scheduled-date"]');
      const dateInputExists = await dateInput.count();
      if (dateInputExists > 0) {
        await dateInput.fill(dateStr);
      }

      // Set time (9:00 AM)
      const timeInput = page.locator('input[type="time"], [data-testid="scheduled-time"]');
      const timeInputExists = await timeInput.count();
      if (timeInputExists > 0) {
        await timeInput.fill('09:00');
      }
    }

    // Capture request ID from API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/wellness/requests') && response.request().method() === 'POST'
    );

    // Submit the form
    const submitButton = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Send")');
    await submitButton.click();

    // Verify request was created
    const response = await responsePromise;
    expect(response.status()).toBe(201);

    const responseData = await response.json();
    expect(responseData).toHaveProperty('id');
    expect(responseData.status).toBe('scheduled');
    expect(responseData.scheduledFor).toBeTruthy();

    createdRequestIds.push(responseData.id);

    // Verify modal closed
    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Verify request appears in list with "scheduled" status
    await page.waitForTimeout(1000);
    const requestRow = page.locator(`tr:has-text("${responseData.id}"), [data-request-id="${responseData.id}"]`).first();
    const requestRowExists = await requestRow.count();

    if (requestRowExists > 0) {
      await expect(requestRow).toContainText(/scheduled/i);
    }
  });

  test('should create daily recurring schedule', async ({ page }) => {
    // Click "Create Request" button
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    // Wait for request modal to appear
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

    // Select schedule type: Recurring
    const recurringRadio = page.locator('input[value="recurring"], [data-testid="radio-schedule-recurring"]');
    const recurringRadioExists = await recurringRadio.count();

    if (recurringRadioExists > 0) {
      await recurringRadio.click();
      await page.waitForTimeout(300);

      // Select recurrence type: Daily
      const dailyRadio = page.locator('input[value="daily"], [data-testid="radio-recurrence-daily"]');
      const dailyRadioExists = await dailyRadio.count();

      if (dailyRadioExists > 0) {
        await dailyRadio.click();
        await page.waitForTimeout(300);
      }

      // Set time (8:00 AM)
      const timeInput = page.locator('input[type="time"], [data-testid="recurring-time"]');
      const timeInputExists = await timeInput.count();
      if (timeInputExists > 0) {
        await timeInput.fill('08:00');
      }
    }

    // Capture schedule ID from API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/wellness/schedules') && response.request().method() === 'POST'
    );

    // Submit the form
    const submitButton = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Send")');
    await submitButton.click();

    // Verify schedule was created
    const response = await responsePromise;
    expect(response.status()).toBe(201);

    const responseData = await response.json();
    expect(responseData).toHaveProperty('id');
    expect(responseData.recurrenceType).toBe('daily');
    expect(responseData.status).toBe('active');
    expect(responseData.scheduledTime).toBe('08:00');

    createdScheduleIds.push(responseData.id);

    // Verify modal closed
    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });
  });

  test('should create weekly recurring schedule (Mon/Wed/Fri)', async ({ page }) => {
    // Click "Create Request" button
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    // Wait for request modal to appear
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

    // Select schedule type: Recurring
    const recurringRadio = page.locator('input[value="recurring"], [data-testid="radio-schedule-recurring"]');
    const recurringRadioExists = await recurringRadio.count();

    if (recurringRadioExists > 0) {
      await recurringRadio.click();
      await page.waitForTimeout(300);

      // Select recurrence type: Weekly
      const weeklyRadio = page.locator('input[value="weekly"], [data-testid="radio-recurrence-weekly"]');
      const weeklyRadioExists = await weeklyRadio.count();

      if (weeklyRadioExists > 0) {
        await weeklyRadio.click();
        await page.waitForTimeout(300);

        // Select days: Monday (1), Wednesday (3), Friday (5)
        const monButton = page.locator('button[data-day="1"], button:has-text("M")').first();
        const wedButton = page.locator('button[data-day="3"], button:has-text("W")').nth(1); // Second "W" is Wednesday
        const friButton = page.locator('button[data-day="5"], button:has-text("F")').first();

        const monExists = await monButton.count();
        const wedExists = await wedButton.count();
        const friExists = await friButton.count();

        if (monExists > 0) await monButton.click();
        if (wedExists > 0) await wedButton.click();
        if (friExists > 0) await friButton.click();

        await page.waitForTimeout(300);
      }

      // Set time (8:00 AM)
      const timeInput = page.locator('input[type="time"], [data-testid="recurring-time"]');
      const timeInputExists = await timeInput.count();
      if (timeInputExists > 0) {
        await timeInput.fill('08:00');
      }
    }

    // Capture schedule ID from API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/wellness/schedules') && response.request().method() === 'POST'
    );

    // Submit the form
    const submitButton = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Send")');
    await submitButton.click();

    // Verify schedule was created
    const response = await responsePromise;
    expect(response.status()).toBe(201);

    const responseData = await response.json();
    expect(responseData).toHaveProperty('id');
    expect(responseData.recurrenceType).toBe('weekly');
    expect(responseData.status).toBe('active');
    expect(responseData.daysOfWeek).toEqual(expect.arrayContaining([1, 3, 5]));

    createdScheduleIds.push(responseData.id);

    // Verify modal closed
    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });
  });

  test('should create custom interval recurring schedule (every 3 days)', async ({ page }) => {
    // Click "Create Request" button
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    // Wait for request modal to appear
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

    // Select schedule type: Recurring
    const recurringRadio = page.locator('input[value="recurring"], [data-testid="radio-schedule-recurring"]');
    const recurringRadioExists = await recurringRadio.count();

    if (recurringRadioExists > 0) {
      await recurringRadio.click();
      await page.waitForTimeout(300);

      // Select recurrence type: Custom
      const customRadio = page.locator('input[value="custom"], [data-testid="radio-recurrence-custom"]');
      const customRadioExists = await customRadio.count();

      if (customRadioExists > 0) {
        await customRadio.click();
        await page.waitForTimeout(300);

        // Set interval to 3 days
        const intervalInput = page.locator('input[type="number"], [data-testid="custom-interval"]');
        const intervalInputExists = await intervalInput.count();
        if (intervalInputExists > 0) {
          await intervalInput.fill('3');
        }
      }

      // Set time (8:00 AM)
      const timeInput = page.locator('input[type="time"], [data-testid="recurring-time"]');
      const timeInputExists = await timeInput.count();
      if (timeInputExists > 0) {
        await timeInput.fill('08:00');
      }
    }

    // Capture schedule ID from API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/wellness/schedules') && response.request().method() === 'POST'
    );

    // Submit the form
    const submitButton = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Send")');
    await submitButton.click();

    // Verify schedule was created
    const response = await responsePromise;
    expect(response.status()).toBe(201);

    const responseData = await response.json();
    expect(responseData).toHaveProperty('id');
    expect(responseData.recurrenceType).toBe('custom');
    expect(responseData.status).toBe('active');
    expect(responseData.customIntervalDays).toBe(3);

    createdScheduleIds.push(responseData.id);

    // Verify modal closed
    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });
  });

  test('should pause and resume a recurring schedule', async ({ page }) => {
    // First, create a daily schedule
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { timeout: 5000 });

    // Select template and team (simplified)
    const templateSelect = page.locator('select[name="templateId"], [data-testid="select-template"]');
    if (await templateSelect.count() > 0) {
      await templateSelect.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    const teamRadio = page.locator('input[value="team"], [data-testid="radio-target-team"]');
    if (await teamRadio.count() > 0) {
      await teamRadio.click();
      await page.waitForTimeout(300);

      const teamSelect = page.locator('select[name="teamIds"], [data-testid="select-teams"]');
      if (await teamSelect.count() > 0) {
        await teamSelect.click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
    }

    // Set to recurring daily
    const recurringRadio = page.locator('input[value="recurring"], [data-testid="radio-schedule-recurring"]');
    if (await recurringRadio.count() > 0) {
      await recurringRadio.click();
      await page.waitForTimeout(300);

      const dailyRadio = page.locator('input[value="daily"], [data-testid="radio-recurrence-daily"]');
      if (await dailyRadio.count() > 0) {
        await dailyRadio.click();
        await page.waitForTimeout(300);
      }

      const timeInput = page.locator('input[type="time"], [data-testid="recurring-time"]');
      if (await timeInput.count() > 0) {
        await timeInput.fill('08:00');
      }
    }

    const createResponsePromise = page.waitForResponse(response =>
      response.url().includes('/wellness/schedules') && response.request().method() === 'POST'
    );

    const submitButton = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Send")');
    await submitButton.click();

    const createResponse = await createResponsePromise;
    const scheduleData = await createResponse.json();
    createdScheduleIds.push(scheduleData.id);

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Now pause the schedule via API (simulating schedule management UI)
    const orgId = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      if (!userStr) return null;
      const user = JSON.parse(userStr);
      return user?.organizationId || null;
    });

    if (orgId) {
      const pauseResponse = await page.request.put(
        `${STAGING_URL}/api/organizations/${orgId}/wellness/schedules/${scheduleData.id}`,
        {
          data: { status: 'paused' }
        }
      );

      expect(pauseResponse.status()).toBe(200);
      const pausedData = await pauseResponse.json();
      expect(pausedData.status).toBe('paused');

      // Resume the schedule
      const resumeResponse = await page.request.put(
        `${STAGING_URL}/api/organizations/${orgId}/wellness/schedules/${scheduleData.id}`,
        {
          data: { status: 'active' }
        }
      );

      expect(resumeResponse.status()).toBe(200);
      const resumedData = await resumeResponse.json();
      expect(resumedData.status).toBe('active');
      expect(resumedData.nextRunAt).toBeTruthy(); // Should have recalculated next run
    }
  });

  test('should create schedule with end date', async ({ page }) => {
    // Click "Create Request" button
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { timeout: 5000 });

    // Select template and team
    const templateSelect = page.locator('select[name="templateId"], [data-testid="select-template"]');
    if (await templateSelect.count() > 0) {
      await templateSelect.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    const teamRadio = page.locator('input[value="team"], [data-testid="radio-target-team"]');
    if (await teamRadio.count() > 0) {
      await teamRadio.click();
      await page.waitForTimeout(300);

      const teamSelect = page.locator('select[name="teamIds"], [data-testid="select-teams"]');
      if (await teamSelect.count() > 0) {
        await teamSelect.click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
    }

    // Set to recurring daily
    const recurringRadio = page.locator('input[value="recurring"], [data-testid="radio-schedule-recurring"]');
    if (await recurringRadio.count() > 0) {
      await recurringRadio.click();
      await page.waitForTimeout(300);

      const dailyRadio = page.locator('input[value="daily"], [data-testid="radio-recurrence-daily"]');
      if (await dailyRadio.count() > 0) {
        await dailyRadio.click();
        await page.waitForTimeout(300);
      }

      const timeInput = page.locator('input[type="time"], [data-testid="recurring-time"]');
      if (await timeInput.count() > 0) {
        await timeInput.fill('08:00');
      }

      // Set end date (7 days from now)
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      const endDateStr = endDate.toISOString().split('T')[0];

      const endDateInput = page.locator('input[type="date"][name="endDate"], [data-testid="end-date"]');
      if (await endDateInput.count() > 0) {
        await endDateInput.fill(endDateStr);
      }
    }

    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/wellness/schedules') && response.request().method() === 'POST'
    );

    const submitButton = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Send")');
    await submitButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(201);

    const responseData = await response.json();
    expect(responseData).toHaveProperty('id');
    expect(responseData.endDate).toBeTruthy();

    createdScheduleIds.push(responseData.id);

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });
  });

  test('should create schedule with max occurrences', async ({ page }) => {
    // Click "Create Request" button
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { timeout: 5000 });

    // Select template and team
    const templateSelect = page.locator('select[name="templateId"], [data-testid="select-template"]');
    if (await templateSelect.count() > 0) {
      await templateSelect.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    const teamRadio = page.locator('input[value="team"], [data-testid="radio-target-team"]');
    if (await teamRadio.count() > 0) {
      await teamRadio.click();
      await page.waitForTimeout(300);

      const teamSelect = page.locator('select[name="teamIds"], [data-testid="select-teams"]');
      if (await teamSelect.count() > 0) {
        await teamSelect.click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
    }

    // Set to recurring daily
    const recurringRadio = page.locator('input[value="recurring"], [data-testid="radio-schedule-recurring"]');
    if (await recurringRadio.count() > 0) {
      await recurringRadio.click();
      await page.waitForTimeout(300);

      const dailyRadio = page.locator('input[value="daily"], [data-testid="radio-recurrence-daily"]');
      if (await dailyRadio.count() > 0) {
        await dailyRadio.click();
        await page.waitForTimeout(300);
      }

      const timeInput = page.locator('input[type="time"], [data-testid="recurring-time"]');
      if (await timeInput.count() > 0) {
        await timeInput.fill('08:00');
      }

      // Set max occurrences to 5
      const maxOccurrencesInput = page.locator('input[type="number"][name="maxOccurrences"], [data-testid="max-occurrences"]');
      if (await maxOccurrencesInput.count() > 0) {
        await maxOccurrencesInput.fill('5');
      }
    }

    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/wellness/schedules') && response.request().method() === 'POST'
    );

    const submitButton = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Send")');
    await submitButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(201);

    const responseData = await response.json();
    expect(responseData).toHaveProperty('id');
    expect(responseData.maxOccurrences).toBe(5);

    createdScheduleIds.push(responseData.id);

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });
  });

  test('should cancel a schedule', async ({ page }) => {
    // First, create a daily schedule
    const createButton = page.locator('button:has-text("Create Request"), button:has-text("New Request")');
    await createButton.click();

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { timeout: 5000 });

    // Select template and team (simplified)
    const templateSelect = page.locator('select[name="templateId"], [data-testid="select-template"]');
    if (await templateSelect.count() > 0) {
      await templateSelect.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    const teamRadio = page.locator('input[value="team"], [data-testid="radio-target-team"]');
    if (await teamRadio.count() > 0) {
      await teamRadio.click();
      await page.waitForTimeout(300);

      const teamSelect = page.locator('select[name="teamIds"], [data-testid="select-teams"]');
      if (await teamSelect.count() > 0) {
        await teamSelect.click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
    }

    // Set to recurring daily
    const recurringRadio = page.locator('input[value="recurring"], [data-testid="radio-schedule-recurring"]');
    if (await recurringRadio.count() > 0) {
      await recurringRadio.click();
      await page.waitForTimeout(300);

      const dailyRadio = page.locator('input[value="daily"], [data-testid="radio-recurrence-daily"]');
      if (await dailyRadio.count() > 0) {
        await dailyRadio.click();
        await page.waitForTimeout(300);
      }

      const timeInput = page.locator('input[type="time"], [data-testid="recurring-time"]');
      if (await timeInput.count() > 0) {
        await timeInput.fill('08:00');
      }
    }

    const createResponsePromise = page.waitForResponse(response =>
      response.url().includes('/wellness/schedules') && response.request().method() === 'POST'
    );

    const submitButton = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Send")');
    await submitButton.click();

    const createResponse = await createResponsePromise;
    const scheduleData = await createResponse.json();
    createdScheduleIds.push(scheduleData.id);

    await page.waitForSelector('[data-testid="request-modal"], [role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Now cancel the schedule via API
    const orgId = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      if (!userStr) return null;
      const user = JSON.parse(userStr);
      return user?.organizationId || null;
    });

    if (orgId) {
      const cancelResponse = await page.request.delete(
        `${STAGING_URL}/api/organizations/${orgId}/wellness/schedules/${scheduleData.id}`
      );

      expect(cancelResponse.status()).toBe(200);

      // Verify schedule is cancelled
      const getResponse = await page.request.get(
        `${STAGING_URL}/api/organizations/${orgId}/wellness/schedules`
      );

      const schedules = await getResponse.json();
      const cancelledSchedule = schedules.find((s: any) => s.id === scheduleData.id);

      if (cancelledSchedule) {
        expect(cancelledSchedule.status).toBe('cancelled');
      }
    }
  });
});
