import { test, expect, Page } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * E2E Tests for Issue #367 — Metric explanations in reports
 *
 * Verifies:
 *  1. An authenticated coach sees the explanation trigger next to metric labels
 *     and can expand it to read "What it measures" and "Why it matters".
 *  2. Each report view renders a "Glossary of metrics" section at the bottom.
 *  3. A parent opening a public shared link sees the same frozen glossary
 *     (no login required).
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

async function getUserOrgId(page: Page): Promise<string | null> {
  const res = await page.request.get(`${STAGING_URL}/api/auth/me/organizations`);
  if (!res.ok()) return null;
  const orgs = await res.json();
  if (!Array.isArray(orgs) || orgs.length === 0) return null;
  return orgs[0].organizationId ?? null;
}

function generateReportName() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return `Explanations E2E ${uniqueId}`;
}

test.describe('Report metric explanations — E2E', () => {
  const createdReportIds: string[] = [];
  const createdSnapshotIds: string[] = [];

  test.afterEach(async ({ page }) => {
    for (const id of createdSnapshotIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/snapshots/${id}`);
      } catch {
        // swallow — best effort cleanup
      }
    }
    for (const id of createdReportIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/${id}`);
      } catch {
        // swallow — best effort cleanup
      }
    }
    createdReportIds.length = 0;
    createdSnapshotIds.length = 0;
  });

  test('coach can expand metric explanation on a team report', async ({ page }) => {
    await loginAsDefaultUser(page);
    const orgId = await getUserOrgId(page);
    expect(orgId).not.toBeNull();

    const createRes = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: generateReportName(),
        reportType: 'team',
        organizationId: orgId,
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
        },
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const report = await createRes.json();
    createdReportIds.push(report.id);

    await page.goto(`${STAGING_URL}/reports/${report.id}`);
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('button', { name: /Explanation for 10-Yard Fly/i }).first();
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Expanded content should include the built-in description fragment
    await expect(page.getByText(/maximum velocity measurement/i)).toBeVisible();

    // Glossary section at the bottom
    await expect(page.getByRole('heading', { name: /Glossary of metrics/i })).toBeVisible();
  });

  test('public shared link shows glossary without authentication', async ({ browser, page }) => {
    await loginAsDefaultUser(page);
    const orgId = await getUserOrgId(page);

    const createRes = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: generateReportName(),
        reportType: 'team',
        organizationId: orgId,
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME'],
        },
      },
    });
    const report = await createRes.json();
    createdReportIds.push(report.id);

    const snapRes = await page.request.post(`${STAGING_URL}/api/reports/${report.id}/snapshots`, {
      data: { expirationDays: 1 },
    });
    expect(snapRes.ok()).toBeTruthy();
    const snap = await snapRes.json();
    createdSnapshotIds.push(snap.id);
    expect(snap.publicToken).toBeTruthy();

    // Open in a fresh context with NO auth cookies to mimic a parent
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    try {
      await anonPage.goto(`${STAGING_URL}/public/reports/${snap.publicToken}`);
      await anonPage.waitForLoadState('networkidle');
      await expect(
        anonPage.getByRole('heading', { name: /Glossary of metrics/i }),
      ).toBeVisible();
      await expect(anonPage.getByText(/10-Yard Fly/i).first()).toBeVisible();
    } finally {
      await anonContext.close();
    }
  });
});
