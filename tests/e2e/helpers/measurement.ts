/**
 * Measurement Helper Functions for E2E Tests
 */

import { Page } from '@playwright/test';
import { goToDataEntry } from './navigation';

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
  await page.fill('[data-testid="measurement-value"]', measurementData.value).catch((error) => {
    console.debug('addMeasurement: measurement value testid failed, using fallback',
      error instanceof Error ? error.message : error
    );
    return page.fill('input[name="value"]', measurementData.value);
  });

  // Fill date if provided
  if (measurementData.date) {
    await page.fill('[name="date"]', measurementData.date);
  }

  // Fill notes if provided
  if (measurementData.notes) {
    await page.fill('[name="notes"]', measurementData.notes);
  }

  // Submit
  await page.click('[data-testid="submit-measurement"]').catch((error) => {
    console.debug('addMeasurement: submit button testid failed, using fallback',
      error instanceof Error ? error.message : error
    );
    return page.click('button[type="submit"]');
  });

  await page.waitForLoadState('networkidle');
}

/**
 * Verify measurement
 */
export async function verifyMeasurement(page: Page, measurementId: string): Promise<void> {
  await page.click(`[data-testid="verify-measurement-${measurementId}"]`).catch((error) => {
    console.debug(`verifyMeasurement: verify button testid failed for ${measurementId}, using fallback`,
      error instanceof Error ? error.message : error
    );
    return page.click(`#measurement-${measurementId} button:has-text("Verify")`);
  });
  await page.waitForLoadState('networkidle');
}

/**
 * Delete measurement
 */
export async function deleteMeasurement(page: Page, measurementId: string): Promise<void> {
  await page.click(`[data-testid="delete-measurement-${measurementId}"]`).catch((error) => {
    console.debug(`deleteMeasurement: delete button testid failed for ${measurementId}, using fallback`,
      error instanceof Error ? error.message : error
    );
    return page.click(`#measurement-${measurementId} button:has-text("Delete")`);
  });

  // Confirm deletion
  await page.click('[data-testid="confirm-delete"]').catch((error) => {
    console.debug('deleteMeasurement: confirm button testid failed, using fallback',
      error instanceof Error ? error.message : error
    );
    return page.click('button:has-text("Confirm")');
  });

  await page.waitForLoadState('networkidle');
}
