/**
 * Measurement Page Object Model (Data Entry)
 */

import { Page } from '@playwright/test';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

export class MeasurementPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(`${STAGING_URL}/data-entry`);
    await this.page.waitForLoadState('networkidle');
  }

  async clickAddMeasurement(): Promise<void> {
    await this.page.click('[data-testid="add-measurement-button"]').catch(() =>
      this.page.click('button:has-text("Add Measurement")')
    );
  }

  async fillMeasurementForm(data: {
    athleteName?: string;
    metric: string;
    value: string;
    date?: string;
    notes?: string;
  }): Promise<void> {
    if (data.athleteName) {
      await this.page.selectOption('[data-testid="athlete-select"]', { label: data.athleteName }).catch(() =>
        this.page.selectOption('select[name="athleteId"]', { label: data.athleteName })
      );
    }

    await this.page.selectOption('[data-testid="metric-select"]', data.metric).catch(() =>
      this.page.selectOption('select[name="metric"]', data.metric)
    );

    await this.page.fill('[data-testid="measurement-value"]', data.value).catch(() =>
      this.page.fill('input[name="value"]', data.value)
    );

    if (data.date) {
      await this.page.fill('[name="date"]', data.date);
    }

    if (data.notes) {
      await this.page.fill('[name="notes"]', data.notes);
    }
  }

  async submitMeasurementForm(): Promise<void> {
    await this.page.click('[data-testid="submit-measurement"]').catch(() =>
      this.page.click('button[type="submit"]')
    );
    await this.page.waitForLoadState('networkidle');
  }

  async selectMetricType(type: string): Promise<void> {
    await this.page.selectOption('[data-testid="metric-select"]', type).catch(() =>
      this.page.selectOption('select[name="metric"]', type)
    );
  }

  async clickVerifyMeasurement(measurementId: string): Promise<void> {
    await this.page.click(`[data-testid="verify-measurement-${measurementId}"]`).catch(() =>
      this.page.click(`#measurement-${measurementId} button:has-text("Verify")`)
    );
  }

  async isMeasurementInList(value: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(`text="${value}"`, { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getValidationErrors(): Promise<string[]> {
    const errors = await this.page.locator('.error, [role="alert"]').all();
    const errorTexts: string[] = [];
    for (const error of errors) {
      const text = await error.textContent();
      if (text) errorTexts.push(text);
    }
    return errorTexts;
  }
}
