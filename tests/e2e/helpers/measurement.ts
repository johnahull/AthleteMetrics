/**
 * Measurement Helper Functions for E2E Tests
 */

import { Page } from '@playwright/test';
import { goToDataEntry } from './navigation';
import { clickWithFallback, fillWithFallback } from './selectors';

/**
 * Add measurement for athlete
 */
export async function addMeasurement(page: Page, measurementData: {
  athleteName?: string;
  metric: string;
  value: string;
  date?: string;
  notes?: string;
}): Promise<void> {
  await goToDataEntry(page);

  // Select athlete if provided
  if (measurementData.athleteName) {
    await page.selectOption('[data-testid="athlete-select"]', { label: measurementData.athleteName }).catch((error) => {
      console.debug('addMeasurement: athlete select testid failed, using fallback',
        error instanceof Error ? error.message : error
      );
      return page.selectOption('select[name="athleteId"]', { label: measurementData.athleteName });
    });
  }

  // Select metric
  await page.selectOption('[data-testid="metric-select"]', measurementData.metric).catch((error) => {
    console.debug('addMeasurement: metric select testid failed, using fallback',
      error instanceof Error ? error.message : error
    );
    return page.selectOption('select[name="metric"]', measurementData.metric);
  });

  // Fill value
  await fillWithFallback(
    page,
    '[data-testid="measurement-value"]',
    'input[name="value"]',
    measurementData.value,
    'Measurement value'
  );

  // Fill date if provided
  if (measurementData.date) {
    await fillWithFallback(
      page,
      '[data-testid="measurement-date"]',
      '[name="date"]',
      measurementData.date,
      'Measurement date'
    );
  }

  // Fill notes if provided
  if (measurementData.notes) {
    await fillWithFallback(
      page,
      '[data-testid="measurement-notes"]',
      '[name="notes"]',
      measurementData.notes,
      'Measurement notes'
    );
  }

  // Submit
  await clickWithFallback(
    page,
    '[data-testid="submit-measurement"]',
    'button[type="submit"]',
    'Submit measurement button'
  );

  await page.waitForLoadState('networkidle');
}

/**
 * Verify measurement
 */
export async function verifyMeasurement(page: Page, measurementId: string): Promise<void> {
  await clickWithFallback(
    page,
    `[data-testid="verify-measurement-${measurementId}"]`,
    `#measurement-${measurementId} button:has-text("Verify")`,
    `Verify button for measurement ${measurementId}`
  );

  await page.waitForLoadState('networkidle');
}

/**
 * Delete measurement
 */
export async function deleteMeasurement(page: Page, measurementId: string): Promise<void> {
  await clickWithFallback(
    page,
    `[data-testid="delete-measurement-${measurementId}"]`,
    `#measurement-${measurementId} button:has-text("Delete")`,
    `Delete button for measurement ${measurementId}`
  );

  // Confirm deletion
  await clickWithFallback(
    page,
    '[data-testid="confirm-delete"]',
    'button:has-text("Confirm")',
    'Confirm delete button'
  );

  await page.waitForLoadState('networkidle');
}
