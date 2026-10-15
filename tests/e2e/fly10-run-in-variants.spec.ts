import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';
import { goToDataEntry } from './helpers/navigation';

/**
 * AM-FEAT-017: FLY10 run-in variants.
 * The run-in is part of the metric code, so the entry form lists the five
 * variants by label and no longer shows a free-form fly-in distance field.
 * Requires an org with FLY10_TIME enabled (migration 0150 enables the variants).
 */
test.describe('FLY10 run-in variants entry', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToDataEntry(page);
  });

  test('metric picker lists the five run-in variants and shows no fly-in field', async ({ page }) => {
    await expect(page.getByTestId('input-fly-in-distance')).toHaveCount(0);

    await page.getByTestId('metric-select').click();
    for (const yd of [5, 10, 15, 20, 30]) {
      await expect(page.getByRole('option', { name: `10-Yard Fly, ${yd} yd run-in` })).toBeVisible();
    }

    await page.getByRole('option', { name: '10-Yard Fly, 10 yd run-in' }).click({ force: true });
    await expect(page.getByTestId('metric-select')).toContainText('10 yd run-in');
    await expect(page.getByTestId('input-fly-in-distance')).toHaveCount(0);
  });
});
