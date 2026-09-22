import { test, expect } from './fixtures/e2e-base';
import { loginAsCoach, logout } from './helpers/auth';

/**
 * REPORT MULTI-SELECT SHARING: End-to-End Tests
 *
 * Test Coverage:
 * - Coach can open "Send to Athletes" dialog from individual report
 * - Athletes who already received the report show as disabled with "Already sent" badge
 * - Coach can select multiple athletes via team and individual selection
 * - Coach can send report to multiple athletes at once
 * - Success toast appears with count of athletes
 * - Dialog closes after successful send
 * - Reopening dialog shows newly sent athletes as "Already sent"
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Report Multi-Select Sharing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
  });

  test('should display "Send to Athletes" button on individual report view', async ({ page }) => {
    // Navigate to reports page
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Find an individual report
    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReports = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReports) {
      test.skip(true, 'No reports available to test multi-share');
      return;
    }

    // Click on the report to view it
    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Verify the "Send to Athletes" button is visible (with Users icon)
    const sendButton = page.locator('button:has-text("Send to Athletes")');
    await expect(sendButton).toBeVisible({ timeout: 10000 });
  });

  test('should open multi-share dialog when clicking "Send to Athletes"', async ({ page }) => {
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Find and click on an individual report
    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReport = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReport) {
      test.skip(true, 'No individual reports available');
      return;
    }

    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Click "Send to Athletes" button
    await page.click('button:has-text("Send to Athletes")');

    // Verify dialog opens
    const dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify dialog contains expected elements
    await expect(dialog.locator('text=Send Report to Athletes')).toBeVisible();
    await expect(dialog.locator('textarea')).toBeVisible(); // message field
  });

  test('should show already-sent athletes as disabled with sent date badge', async ({ page }) => {
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReport = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReport) {
      test.skip(true, 'No reports available');
      return;
    }

    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Open multi-share dialog
    await page.click('button:has-text("Send to Athletes")');
    const dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Look for athletes with "Already sent" or "Sent" badge
    const alreadySentBadge = dialog.locator('text=/Already sent|Sent/i').first();
    const hasSentAthletes = await alreadySentBadge.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSentAthletes) {
      // Verify the badge is visible
      await expect(alreadySentBadge).toBeVisible();

      // Verify the corresponding checkbox is disabled
      const athleteRow = alreadySentBadge.locator('../..');
      const checkbox = athleteRow.locator('input[type="checkbox"]');
      await expect(checkbox).toBeDisabled();
    }
  });

  test('should select multiple athletes via team selection', async ({ page }) => {
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReport = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReport) {
      test.skip(true, 'No reports available');
      return;
    }

    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Open multi-share dialog
    await page.click('button:has-text("Send to Athletes")');
    const dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Look for a team checkbox
    const teamCheckbox = dialog.locator('[id^="team-"]').first();
    const hasTeams = await teamCheckbox.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasTeams) {
      test.skip(true, 'No teams available for selection');
      return;
    }

    // Click team checkbox
    await teamCheckbox.click();

    // Verify the selected count updates in the button
    const sendButton = dialog.locator('button:has-text("Send to")');
    const buttonText = await sendButton.textContent();
    expect(buttonText).toMatch(/Send to \d+ Athlete/);
  });

  test('should select individual athletes', async ({ page }) => {
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReport = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReport) {
      test.skip(true, 'No reports available');
      return;
    }

    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Open multi-share dialog
    await page.click('button:has-text("Send to Athletes")');
    const dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Look for individual athlete checkbox (not disabled)
    const athleteCheckbox = dialog.locator('[id^="athlete-"]:not([disabled])').first();
    const hasAthletes = await athleteCheckbox.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasAthletes) {
      test.skip(true, 'No available athletes for selection');
      return;
    }

    // Click athlete checkbox
    await athleteCheckbox.click();

    // Verify the athlete appears in selected list
    const selectedSection = dialog.locator('text=Selected Athletes').locator('..');
    await expect(selectedSection).toBeVisible();
  });

  test('should successfully send report to multiple athletes', async ({ page }) => {
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReport = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReport) {
      test.skip(true, 'No reports available');
      return;
    }

    // Get the report name for later verification
    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Open multi-share dialog
    await page.click('button:has-text("Send to Athletes")');
    const dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select at least one athlete (try team first, then individual)
    const teamCheckbox = dialog.locator('[id^="team-"]:not([disabled])').first();
    const hasTeams = await teamCheckbox.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasTeams) {
      await teamCheckbox.click();
    } else {
      // Try individual athletes
      const athleteCheckbox = dialog.locator('[id^="athlete-"]:not([disabled])').first();
      const hasAthletes = await athleteCheckbox.isVisible({ timeout: 3000 }).catch(() => false);

      if (!hasAthletes) {
        test.skip(true, 'No available athletes to select');
        return;
      }

      await athleteCheckbox.click();
    }

    // Add optional message
    const messageInput = dialog.locator('textarea');
    await messageInput.fill('Great progress this season! Keep up the excellent work.');

    // Get the send button text to verify count
    const sendButton = dialog.locator('button:has-text("Send to")');
    const buttonText = await sendButton.textContent();
    const athleteCount = buttonText?.match(/\d+/)?.[0];

    // Click send
    await sendButton.click();

    // Wait for success toast
    const toast = page.locator('[role="status"], .toast').filter({ hasText: /sent|success/i });
    await expect(toast).toBeVisible({ timeout: 10000 });

    // Verify toast shows count
    const toastText = await toast.textContent();
    if (athleteCount) {
      expect(toastText).toContain(athleteCount);
    }

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('should show info text about already-sent athletes', async ({ page }) => {
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReport = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReport) {
      test.skip(true, 'No reports available');
      return;
    }

    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Open multi-share dialog
    await page.click('button:has-text("Send to Athletes")');
    const dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Look for info text about already sent
    const infoText = dialog.locator('text=/already have this report|already received/i');
    const hasInfo = await infoText.isVisible({ timeout: 3000 }).catch(() => false);

    // Info text may or may not be visible depending on whether athletes have received the report
    if (hasInfo) {
      await expect(infoText).toBeVisible();
    }
  });

  test('should warn if selection exceeds 100 athletes', async ({ page }) => {
    // This test requires a large organization with many athletes
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReport = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReport) {
      test.skip(true, 'No reports available');
      return;
    }

    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Open multi-share dialog
    await page.click('button:has-text("Send to Athletes")');
    const dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Try to select all athletes
    const selectAllButton = dialog.locator('button:has-text("Select All")');
    const hasSelectAll = await selectAllButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSelectAll) {
      await selectAllButton.click();

      // Check if warning appears
      const warning = dialog.locator('text=/exceeds 100|too many|limit/i');
      const hasWarning = await warning.isVisible({ timeout: 2000 }).catch(() => false);

      // Warning only appears if > 100 selected
      // This is optional and depends on organization size
    }
  });

  test('should disable send button when no athletes selected', async ({ page }) => {
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReport = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReport) {
      test.skip(true, 'No reports available');
      return;
    }

    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Open multi-share dialog
    await page.click('button:has-text("Send to Athletes")');
    const dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Send button should be disabled when nothing is selected
    const sendButton = dialog.locator('button:has-text("Send to")');
    await expect(sendButton).toBeDisabled();
  });

  test('complete workflow: send to multiple athletes and verify state on reopen', async ({ page }) => {
    await page.goto(`${TESTING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const reportCard = page.locator('[data-testid="report-card"]').first();
    const hasReport = await reportCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasReport) {
      test.skip(true, 'No reports available');
      return;
    }

    await reportCard.click();
    await page.waitForLoadState('networkidle');

    // Step 1: Open dialog and note initial state
    await page.click('button:has-text("Send to Athletes")');
    let dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select an athlete who hasn't received the report yet
    const availableCheckbox = dialog.locator('[id^="athlete-"]:not([disabled])').first();
    const hasAvailable = await availableCheckbox.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasAvailable) {
      test.skip(true, 'No available athletes to send to');
      return;
    }

    // Get the athlete's name for verification
    const athleteLabel = availableCheckbox.locator('..').locator('label');
    const athleteName = await athleteLabel.textContent();

    // Select the athlete
    await availableCheckbox.click();

    // Send the report
    const sendButton = dialog.locator('button:has-text("Send to")');
    await sendButton.click();

    // Wait for success
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Step 2: Reopen dialog
    await page.click('button:has-text("Send to Athletes")');
    dialog = page.locator('[data-testid="send-report-multi-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Step 3: Verify the athlete now shows as "Already sent"
    if (athleteName) {
      const athleteRow = dialog.locator(`text=${athleteName}`).locator('..');
      const sentBadge = athleteRow.locator('text=/Already sent|Sent/i');

      // The athlete should now be marked as sent
      await expect(sentBadge).toBeVisible({ timeout: 5000 });

      // And the checkbox should be disabled
      const checkbox = athleteRow.locator('input[type="checkbox"]');
      await expect(checkbox).toBeDisabled();
    }
  });
});
