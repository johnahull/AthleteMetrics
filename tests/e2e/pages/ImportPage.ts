/**
 * Import/Export Page Object Model
 *
 * Note: Import/Export functionality is now a tab within the Data Entry page.
 * This page object navigates to /data-entry?tab=import.
 */

import { Page } from '@playwright/test';
import path from 'path';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

export class ImportPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    // Import/Export is now a tab within the Data Entry page
    await this.page.goto(`${STAGING_URL}/data-entry?tab=import`);
    // Wait for lazy-loaded content to appear
    await this.page.waitForSelector('[data-testid="file-drop-zone"]', { timeout: 15000 });
  }

  async uploadFile(filePath: string): Promise<void> {
    const absolutePath = path.resolve(filePath);
    const fileInput = await this.page.locator('[data-testid="csv-file-input"]').or(
      this.page.locator('input[type="file"]')
    );
    await fileInput.setInputFiles(absolutePath);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForPreview(): Promise<void> {
    await this.page.waitForSelector('[data-testid="csv-preview-table"]', { timeout: 10000 }).catch(() =>
      this.page.waitForSelector('table', { timeout: 10000 })
    );
  }

  async mapColumn(csvColumn: string, appColumn: string): Promise<void> {
    await this.page.selectOption(`[data-testid="map-column-${csvColumn}"]`, appColumn).catch(() =>
      this.page.selectOption(`select[name="${csvColumn}"]`, appColumn)
    );
  }

  async clickConfirmImport(): Promise<void> {
    await this.page.click('[data-testid="csv-confirm-import"]').catch(() =>
      this.page.click('button:has-text("Confirm Import")')
    );
  }

  async clickCancelImport(): Promise<void> {
    await this.page.click('[data-testid="csv-cancel-import"]').catch(() =>
      this.page.click('button:has-text("Cancel")')
    );
  }

  async waitForImportComplete(timeout: number = 60000): Promise<void> {
    await this.page.waitForSelector('[data-testid="csv-progress-bar"]', {
      state: 'hidden',
      timeout
    }).catch(() =>
      this.page.waitForSelector('.progress-bar', { state: 'hidden', timeout })
    );
  }

  async getImportErrors(): Promise<string[]> {
    const errorElements = await this.page.locator('[data-testid="csv-import-errors"] li').or(
      this.page.locator('.import-errors li')
    ).all();

    const errors: string[] = [];
    for (const element of errorElements) {
      const text = await element.textContent();
      if (text) errors.push(text);
    }

    return errors;
  }

  async getImportSummary(): Promise<{ success: number; failed: number } | null> {
    try {
      const summary = await this.page.waitForSelector('[data-testid="import-summary"]', { timeout: 5000 });
      const text = await summary.textContent();
      
      // Parse summary text like "Imported 10 athletes, 2 failed"
      const successMatch = text?.match(/(\d+)\s+(athlete|measurement)/i);
      const failedMatch = text?.match(/(\d+)\s+failed/i);

      return {
        success: successMatch ? parseInt(successMatch[1]) : 0,
        failed: failedMatch ? parseInt(failedMatch[1]) : 0,
      };
    } catch {
      return null;
    }
  }
}
