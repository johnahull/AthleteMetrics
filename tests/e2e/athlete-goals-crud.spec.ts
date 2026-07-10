import { test, expect, Page } from './fixtures/e2e-base';
import { loginAsAthlete, loginAsCoach } from './helpers/auth';

/**
 * ATHLETE GOALS CRUD E2E Tests
 *
 * Tests verify the goal management functionality:
 * - Create a new goal via the goal creation wizard
 * - View goals on the goals page
 * - Update goal target and date
 * - Mark goal as achieved (with confetti celebration)
 * - Delete a goal
 * - Goals appear on dashboard (up to 3)
 * - Coach can view but not modify athlete goals
 *
 * Prerequisites:
 * - Athlete account with measurements exists
 * - At least one metric measurement for baseline calculation
 *
 * NOTE: In CI environments, all roles may use the same admin account.
 * Admin users don't have an athleteId, so athlete-specific pages redirect.
 * Tests will be skipped when the test user isn't actually an athlete.
 */

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

/**
 * Helper to navigate to my-goals and check if user is actually an athlete.
 * Returns true if on my-goals, false if redirected (user isn't an athlete).
 */
async function navigateToMyGoals(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/my-goals`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  const url = page.url();
  if (!url.includes('/my-goals')) {
    console.log('User is not an athlete (redirected to:', url, ') - skipping athlete-specific test');
    return false;
  }
  return true;
}

/**
 * Helper to navigate to my-dashboard and check if user is actually an athlete.
 */
async function navigateToMyDashboard(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/my-dashboard`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  const url = page.url();
  if (!url.includes('/my-dashboard')) {
    console.log('User is not an athlete (redirected to:', url, ') - skipping athlete-specific test');
    return false;
  }
  return true;
}

test.describe('Athlete Goals CRUD', () => {
  test.describe('Goal Creation', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAthlete(page);
    });

    test('should navigate to My Goals page from sidebar', async ({ page }) => {
      const isAthlete = await navigateToMyDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Click on My Goals in sidebar
      const myGoalsLink = page.locator('[data-testid="sidebar-my-goals"], a:has-text("My Goals")');
      await myGoalsLink.click();

      // Verify we're on the goals page
      await expect(page).toHaveURL(/\/my-goals/);
      await expect(page.getByRole('heading', { name: /My Goals/i })).toBeVisible();
    });

    test('should open goal creation wizard when clicking Set New Goal', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Click Set New Goal button
      const setGoalButton = page.locator('[data-testid="set-new-goal-button"], button:has-text("Set New Goal")');
      await setGoalButton.click();

      // Verify wizard modal opens
      const wizardModal = page.locator('[data-testid="goal-wizard-modal"], [role="dialog"]');
      await expect(wizardModal).toBeVisible();
    });

    test('should create a goal via the goal wizard', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Click Set New Goal button
      await page.click('[data-testid="set-new-goal-button"], button:has-text("Set New Goal")');
      await page.waitForSelector('[data-testid="goal-wizard-modal"], [role="dialog"]');

      // Step 1: Select a metric
      const metricSelect = page.locator('[data-testid="metric-select"], select[name="metric"]');
      if (await metricSelect.isVisible()) {
        await metricSelect.selectOption({ index: 1 }); // Select first available metric
      } else {
        // Try clicking a metric card if using card-based selection
        const metricCard = page.locator('[data-testid^="metric-option-"]').first();
        if (await metricCard.isVisible()) {
          await metricCard.click();
        }
      }

      // Click Next
      await page.click('[data-testid="wizard-next-button"], button:has-text("Next")');

      // Step 2: Set goal type
      const goalTypeTarget = page.locator('[data-testid="goal-type-target"], [data-testid="goal-type-target_value"]');
      if (await goalTypeTarget.isVisible()) {
        await goalTypeTarget.click();
      }
      await page.click('[data-testid="wizard-next-button"], button:has-text("Next")');

      // Step 3: Set target value and date
      const targetValueInput = page.locator('[data-testid="target-value-input"], input[name="targetValue"]');
      await targetValueInput.fill('1.0');

      // Set target date (future date)
      const targetDateInput = page.locator('[data-testid="target-date-input"], input[name="targetDate"], input[type="date"]');
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      const dateStr = futureDate.toISOString().split('T')[0];
      await targetDateInput.fill(dateStr);

      // Submit the goal
      await page.click('[data-testid="wizard-submit-button"], button:has-text("Create Goal"), button:has-text("Save")');

      // Wait for success and verify goal appears
      await page.waitForLoadState('networkidle');

      // Verify goal was created (check for goal in list or success message)
      const successMessage = page.locator('[data-testid="goal-created-success"], .toast-success, [role="alert"]');
      const goalCard = page.locator('[data-testid^="goal-card-"], [data-testid="active-goals"] > *');

      // Either success message or goal card should appear
      const hasSuccess = await successMessage.isVisible().catch(() => false);
      const hasGoalCard = await goalCard.first().isVisible().catch(() => false);

      expect(hasSuccess || hasGoalCard).toBeTruthy();
    });

    test('should show validation errors for invalid goal data', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Click Set New Goal button
      await page.click('[data-testid="set-new-goal-button"], button:has-text("Set New Goal")');
      await page.waitForSelector('[data-testid="goal-wizard-modal"], [role="dialog"]');

      // Try to submit without selecting a metric (should show error)
      const nextButton = page.locator('[data-testid="wizard-next-button"], button:has-text("Next")');
      if (await nextButton.isEnabled()) {
        await nextButton.click();

        // Check for validation error
        const errorMessage = page.locator('[data-testid="validation-error"], .error-message, [role="alert"]');
        const isErrorVisible = await errorMessage.isVisible().catch(() => false);

        // Either error shows or we're still on step 1
        if (!isErrorVisible) {
          // Check we're still on metric selection step
          const metricStep = page.locator('[data-testid="step-metric"], [data-testid="wizard-step-1"]');
          await expect(metricStep).toBeVisible();
        }
      }
    });
  });

  test.describe('Goal Display and Management', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAthlete(page);
    });

    test('should display active goals on goals page', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Check for active goals section
      const activeGoalsSection = page.locator('[data-testid="active-goals"], h2:has-text("Active Goals")');
      await expect(activeGoalsSection).toBeVisible();
    });

    test('should display up to 3 goals on dashboard', async ({ page }) => {
      const isAthlete = await navigateToMyDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Check for goals card on dashboard
      const goalsCard = page.locator('[data-testid="goals-card"], [data-testid="dashboard-goals"]');
      const isVisible = await goalsCard.isVisible().catch(() => false);

      if (isVisible) {
        // Count displayed goals
        const goalItems = page.locator('[data-testid^="dashboard-goal-"], [data-testid="goals-card"] [data-testid^="goal-"]');
        const count = await goalItems.count();

        // Should show at most 3 goals
        expect(count).toBeLessThanOrEqual(3);
      }
    });

    test('should navigate to goals page when clicking View All on dashboard', async ({ page }) => {
      const isAthlete = await navigateToMyDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const viewAllLink = page.locator('[data-testid="view-all-goals"], a:has-text("View All Goals")');
      const isVisible = await viewAllLink.isVisible().catch(() => false);

      if (isVisible) {
        await viewAllLink.click();
        await expect(page).toHaveURL(/\/my-goals/);
      }
    });

    test('should show goal progress indicator', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const goalCards = page.locator('[data-testid^="goal-card-"]');
      const count = await goalCards.count();

      if (count > 0) {
        const firstGoal = goalCards.first();

        // Check for progress indicator (bar or percentage)
        const progressBar = firstGoal.locator('[data-testid="goal-progress-bar"], .progress-bar, [role="progressbar"]');
        const progressText = firstGoal.locator('[data-testid="goal-progress-percent"]');

        const hasProgressBar = await progressBar.isVisible().catch(() => false);
        const hasProgressText = await progressText.isVisible().catch(() => false);

        // At least one progress indicator should be visible
        expect(hasProgressBar || hasProgressText).toBeTruthy();
      }
    });
  });

  test.describe('Goal Update', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAthlete(page);
    });

    test('should open edit modal when clicking edit on a goal', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const goalCards = page.locator('[data-testid^="goal-card-"]');
      const count = await goalCards.count();

      if (count > 0) {
        // Click edit button on first goal
        const editButton = goalCards.first().locator('[data-testid="edit-goal-button"], button:has-text("Edit")');
        await editButton.click();

        // Verify edit modal/form opens
        const editModal = page.locator('[data-testid="edit-goal-modal"], [role="dialog"]');
        await expect(editModal).toBeVisible();
      }
    });

    test('should update goal target value', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const goalCards = page.locator('[data-testid^="goal-card-"]');
      const count = await goalCards.count();

      if (count > 0) {
        // Click edit button
        const editButton = goalCards.first().locator('[data-testid="edit-goal-button"], button:has-text("Edit")');
        await editButton.click();

        // Wait for modal
        await page.waitForSelector('[data-testid="edit-goal-modal"], [role="dialog"]');

        // Update target value
        const targetInput = page.locator('[data-testid="edit-target-value"], input[name="targetValue"]');
        await targetInput.clear();
        await targetInput.fill('0.95');

        // Save changes
        await page.click('[data-testid="save-goal-button"], button:has-text("Save")');

        // Wait for success
        await page.waitForLoadState('networkidle');

        // Verify update (check for success toast or updated value)
        const successToast = page.locator('.toast-success, [data-testid="goal-updated-success"]');
        const isSuccess = await successToast.isVisible().catch(() => false);

        if (!isSuccess) {
          // Modal should be closed
          const modal = page.locator('[data-testid="edit-goal-modal"], [role="dialog"]');
          await expect(modal).not.toBeVisible();
        }
      }
    });

    test('should mark goal as achieved', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const goalCards = page.locator('[data-testid^="goal-card-"]');
      const count = await goalCards.count();

      if (count > 0) {
        // Click mark as achieved button
        const achieveButton = goalCards.first().locator(
          '[data-testid="mark-achieved-button"], button:has-text("Mark as Achieved"), button:has-text("Complete")'
        );
        const isVisible = await achieveButton.isVisible().catch(() => false);

        if (isVisible) {
          await achieveButton.click();

          // Wait for any confirmation dialog
          const confirmDialog = page.locator('[data-testid="confirm-dialog"], [role="alertdialog"]');
          const hasConfirm = await confirmDialog.isVisible().catch(() => false);

          if (hasConfirm) {
            await page.click('[data-testid="confirm-button"], button:has-text("Confirm")');
          }

          // Wait for update
          await page.waitForLoadState('networkidle');

          // Check for achieved status badge or celebration
          const achievedBadge = page.locator('[data-testid="achieved-badge"], .badge:has-text("Achieved")');
          const celebration = page.locator('[data-testid="celebration"], canvas'); // confetti

          const hasAchievedBadge = await achievedBadge.first().isVisible().catch(() => false);
          const hasCelebration = await celebration.isVisible().catch(() => false);

          expect(hasAchievedBadge || hasCelebration).toBeTruthy();
        }
      }
    });
  });

  test.describe('Goal Deletion', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAthlete(page);
    });

    test('should show delete confirmation dialog', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const goalCards = page.locator('[data-testid^="goal-card-"]');
      const count = await goalCards.count();

      if (count > 0) {
        // Click delete button
        const deleteButton = goalCards.first().locator(
          '[data-testid="delete-goal-button"], button:has-text("Delete"), button[aria-label="Delete goal"]'
        );
        await deleteButton.click();

        // Verify confirmation dialog appears
        const confirmDialog = page.locator(
          '[data-testid="delete-confirm-dialog"], [role="alertdialog"], [data-testid="confirm-dialog"]'
        );
        await expect(confirmDialog).toBeVisible();
      }
    });

    test('should delete goal when confirmed', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const goalCards = page.locator('[data-testid^="goal-card-"]');
      const initialCount = await goalCards.count();

      if (initialCount > 0) {
        // Click delete button
        const deleteButton = goalCards.first().locator(
          '[data-testid="delete-goal-button"], button:has-text("Delete"), button[aria-label="Delete goal"]'
        );
        await deleteButton.click();

        // Confirm deletion
        await page.click('[data-testid="confirm-delete-button"], button:has-text("Delete"), button:has-text("Confirm")');

        // Wait for deletion
        await page.waitForLoadState('networkidle');

        // Verify goal count decreased or success message
        const successToast = page.locator('.toast-success, [data-testid="goal-deleted-success"]');
        const isSuccess = await successToast.isVisible().catch(() => false);

        if (!isSuccess) {
          // Count should have decreased
          const newCount = await goalCards.count();
          expect(newCount).toBeLessThan(initialCount);
        }
      }
    });

    test('should cancel deletion when clicking cancel', async ({ page }) => {
      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const goalCards = page.locator('[data-testid^="goal-card-"]');
      const initialCount = await goalCards.count();

      if (initialCount > 0) {
        // Click delete button
        const deleteButton = goalCards.first().locator(
          '[data-testid="delete-goal-button"], button:has-text("Delete"), button[aria-label="Delete goal"]'
        );
        await deleteButton.click();

        // Click cancel
        await page.click('[data-testid="cancel-delete-button"], button:has-text("Cancel")');

        // Verify dialog closed
        const confirmDialog = page.locator('[data-testid="delete-confirm-dialog"], [role="alertdialog"]');
        await expect(confirmDialog).not.toBeVisible();

        // Verify goal count unchanged
        const newCount = await goalCards.count();
        expect(newCount).toBe(initialCount);
      }
    });
  });

  test.describe('Coach View (Read-Only)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsCoach(page);
    });

    test('should allow coach to view athlete goals', async ({ page }) => {
      // Navigate to an athlete's profile/goals (coach view)
      await page.goto(`${BASE_URL}/athletes`);
      await page.waitForLoadState('networkidle');

      // Click on first athlete
      const athleteRow = page.locator('[data-testid^="athlete-row-"], tr[data-athlete-id]').first();
      const isVisible = await athleteRow.isVisible().catch(() => false);

      if (isVisible) {
        await athleteRow.click();
        await page.waitForLoadState('networkidle');

        // Look for goals section in athlete view
        const goalsSection = page.locator('[data-testid="athlete-goals"], [data-testid="goals-tab"]');
        const hasGoals = await goalsSection.isVisible().catch(() => false);

        if (hasGoals) {
          await goalsSection.click();

          // Goals should be visible
          const goalsList = page.locator('[data-testid="goals-list"], [data-testid^="goal-card-"]');
          await expect(goalsList.first()).toBeVisible();
        }
      }
    });

    test('should not show edit/delete buttons for coach viewing athlete goals', async ({ page }) => {
      await page.goto(`${BASE_URL}/athletes`);
      await page.waitForLoadState('networkidle');

      const athleteRow = page.locator('[data-testid^="athlete-row-"], tr[data-athlete-id]').first();
      const isVisible = await athleteRow.isVisible().catch(() => false);

      if (isVisible) {
        await athleteRow.click();
        await page.waitForLoadState('networkidle');

        // Navigate to goals if available
        const goalsTab = page.locator('[data-testid="goals-tab"]');
        if (await goalsTab.isVisible().catch(() => false)) {
          await goalsTab.click();
        }

        // Check that edit/delete buttons are NOT visible
        const editButton = page.locator('[data-testid="edit-goal-button"], button:has-text("Edit Goal")');
        const deleteButton = page.locator('[data-testid="delete-goal-button"]');

        await expect(editButton).not.toBeVisible();
        await expect(deleteButton).not.toBeVisible();
      }
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAthlete(page);
    });

    test('should be usable on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Goals page should still be navigable
      const pageHeading = page.getByRole('heading', { name: /Goals/i });
      await expect(pageHeading).toBeVisible();

      // Set New Goal button should be accessible
      const setGoalButton = page.locator('[data-testid="set-new-goal-button"], button:has-text("Set New Goal")');
      await expect(setGoalButton).toBeVisible();
    });

    test('goal wizard should work on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Open wizard
      await page.click('[data-testid="set-new-goal-button"], button:has-text("Set New Goal")');

      // Wizard should be visible and scrollable
      const wizard = page.locator('[data-testid="goal-wizard-modal"], [role="dialog"]');
      await expect(wizard).toBeVisible();

      // Close wizard
      const closeButton = page.locator('[data-testid="close-wizard-button"], button[aria-label="Close"]');
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    });
  });

  test.describe('Console Errors', () => {
    test('should not have console errors on goals page', async ({ page }) => {
      const consoleErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await loginAsAthlete(page);

      const isAthlete = await navigateToMyGoals(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Wait for components to render
      await page.waitForTimeout(2000);

      // Filter out known acceptable errors (like missing images, push notifications when VAPID not configured)
      const realErrors = consoleErrors.filter(
        (error) =>
          !error.includes('favicon') &&
          !error.includes('404') &&
          !error.includes('Failed to load resource') &&
          !/push.*notification/i.test(error) &&
          !/VAPID/i.test(error) &&
          !/service.?worker/i.test(error) &&
          !/Failed to fetch/i.test(error)
      );

      expect(realErrors.length).toBe(0);
    });
  });
});
