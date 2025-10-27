/**
 * CSV Import/Export Helper Functions for E2E Tests
 */

import { Page } from '@playwright/test';
import { goToImportExport } from './navigation';
import path from 'path';

/**
 * Upload CSV file
 */
export async function uploadCSV(page: Page, filePath: string): Promise<void> {
  await goToImportExport(page);

  const absolutePath = path.resolve(filePath);

  const fileInput = await page.locator('[data-testid="csv-file-input"]').or(
    page.locator('input[type="file"]')
  );

  await fileInput.setInputFiles(absolutePath);
  await page.waitForLoadState('networkidle');
}

/**
 * Map CSV columns (if column mapping dialog appears)
 */
export async function mapColumns(page: Page, columnMapping: Record<string, string>): Promise<void> {
  for (const [csvColumn, appColumn] of Object.entries(columnMapping)) {
    await page.selectOption(
      `[data-testid="map-column-${csvColumn}"]`,
      appColumn
    ).catch(() =>
      page.selectOption(`select[name="${csvColumn}"]`, appColumn)
    );
  }
}

/**
 * Confirm import after preview
 */
export async function confirmImport(page: Page): Promise<void> {
  await page.click('[data-testid="csv-confirm-import"]').catch(() =>
    page.click('button:has-text("Confirm Import")')
  );

  await page.waitForLoadState('networkidle');
}

/**
 * Cancel import
 */
export async function cancelImport(page: Page): Promise<void> {
  await page.click('[data-testid="csv-cancel-import"]').catch(() =>
    page.click('button:has-text("Cancel")')
  );
}

/**
 * Wait for import to complete (batch processing)
 */
export async function waitForImportComplete(page: Page, timeout: number = 60000): Promise<void> {
  // Wait for progress bar to disappear
  await page.waitForSelector('[data-testid="csv-progress-bar"]', {
    state: 'hidden',
    timeout
  }).catch(() =>
    page.waitForSelector('.progress-bar', { state: 'hidden', timeout })
  );
}

/**
 * Get import errors
 */
export async function getImportErrors(page: Page): Promise<string[]> {
  const errorElements = await page.locator('[data-testid="csv-import-errors"] li').or(
    page.locator('.import-errors li')
  ).all();

  const errors: string[] = [];
  for (const element of errorElements) {
    const text = await element.textContent();
    if (text) errors.push(text);
  }

  return errors;
}

/**
 * Complete CSV import flow
 */
export async function importCSV(page: Page, filePath: string, columnMapping?: Record<string, string>): Promise<void> {
  await uploadCSV(page, filePath);

  if (columnMapping) {
    await mapColumns(page, columnMapping);
  }

  await confirmImport(page);
  await waitForImportComplete(page);
}
