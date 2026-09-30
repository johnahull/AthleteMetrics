import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * Regression: authenticated mutations made with raw fetch() (e.g. report
 * "Generate Insights") were rejected with 403 "CSRF token missing" because the
 * server enforces CSRF but those call sites never sent the token.
 *
 * The app installs a fetch wrapper that attaches the token. This test issues
 * the same raw fetch from inside the app against the real server. The report id
 * doesn't exist, so the response is expected to be a 4xx from the route (or AI
 * gate) — the assertion is only that it is NOT a CSRF rejection, so no AI key
 * or seeded report is needed.
 */
test.describe('CSRF token on raw fetch mutations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await page.goto('/reports');
  });

  test('raw POST to generate-insights is not rejected by CSRF', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/reports/00000000-0000-0000-0000-000000000000/generate-insights', {
        method: 'POST',
      });
      return { status: res.status, body: await res.text() };
    });

    expect(result.body).not.toMatch(/csrf/i);
  });

  test('raw PATCH to insights is not rejected by CSRF', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/reports/00000000-0000-0000-0000-000000000000/insights', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insights: 'x' }),
      });
      return { status: res.status, body: await res.text() };
    });

    expect(result.body).not.toMatch(/csrf/i);
  });

  test('sends X-CSRF-Token on the request', async ({ page }) => {
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/generate-insights') && req.method() === 'POST',
    );
    await page.evaluate(() => {
      void fetch('/api/reports/00000000-0000-0000-0000-000000000000/generate-insights', {
        method: 'POST',
      });
    });
    const request = await requestPromise;
    expect(await request.headerValue('x-csrf-token')).toBeTruthy();
  });
});
