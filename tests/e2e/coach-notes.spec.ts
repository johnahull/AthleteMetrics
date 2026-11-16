/**
 * E2E Tests for Coach notes for the AI (individual report page) and the org "Example analysis (your style)".
 *
 * Coverage:
 * 1. Coach expands the notes form, fills goals + a few fields, saves, reloads: values persist
 * 2. Clear empties the notes (UI and API)
 * 3. Generate with dirty notes saves them first (PATCH before the generate request; the provider route is stubbed,
 *    no real AI API is ever called)
 * 4. Athletes never see the form and the report API response has no coachNotes (also not in a team report UI)
 * 5. Org admin saves an example analysis in org settings; a value over 1500 characters is blocked with a message
 *
 * Needs a database with the default site metrics and role users (the global setup creates org admin, coach, athlete
 * and site admin from E2E_*_USERNAME/PASSWORD). The CI E2E suite is red (#490), so run this spec locally.
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAs as loginAsRole } from './helpers/auth';
import { canTestRoleAuthorization } from './fixtures/test-users';

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';
const unique = Date.now().toString(36);
type Role = Parameters<typeof loginAsRole>[1];

/** Log in and mark the onboarding tour as done: its overlay would intercept every click of a first login. */
async function loginAs(page: Page, role: Role) {
  await loginAsRole(page, role);
  await page.request.put(`${BASE_URL}/api/profile/onboarding-status`, { data: { completed: true } });
}

const STYLE_EXAMPLE = `## Snapshot\nFly time is the strength here. Keep the focus on short sprints.`;

test.describe('Coach notes for the AI', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(
    !canTestRoleAuthorization('org_admin', 'coach', 'athlete', 'site_admin'),
    'Needs distinct org admin, coach, athlete and site admin accounts'
  );

  let orgId = '';
  let athleteId = '';
  let reportId = '';
  let teamReportId = '';
  let originalStyleExample: string | null = null;

  const notesUrl = (id: string) => `${BASE_URL}/api/reports/${id}/coach-notes`;

  async function openNotes(page: Page, id = reportId) {
    await page.goto(`${BASE_URL}/reports/${id}`);
    const toggle = page.getByRole('button', { name: 'Coach notes for the AI' });
    await expect(toggle).toBeVisible({ timeout: 20000 });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(page.getByTestId('coach-notes-form')).toBeVisible();
  }

  test.beforeAll(async ({ browser }) => {
    // Athlete id
    const athleteCtx = await browser.newContext();
    const athletePage = await athleteCtx.newPage();
    await loginAs(athletePage, 'athlete');
    athleteId = (await (await athletePage.request.get(`${BASE_URL}/api/auth/me`)).json()).user.id;
    await athleteCtx.close();

    // Site admin enables AI for the org
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await loginAs(adminPage, 'org_admin');
    const orgs = await (await adminPage.request.get(`${BASE_URL}/api/auth/me/organizations`)).json();
    orgId = orgs[0].organizationId;
    await adminCtx.close();

    const siteCtx = await browser.newContext();
    const sitePage = await siteCtx.newPage();
    await loginAs(sitePage, 'site_admin');
    const enableBySite = await sitePage.request.patch(`${BASE_URL}/api/organizations/${orgId}`, {
      data: { aiEnabledBySiteAdmin: true },
    });
    expect(enableBySite.ok(), `site admin enable AI: ${await enableBySite.text()}`).toBeTruthy();
    await siteCtx.close();

    // Org admin: AI on, a measurement for the athlete, one individual and one team report
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'org_admin');
    const api = page.request;
    const org = await (await api.get(`${BASE_URL}/api/organizations/${orgId}`)).json();
    originalStyleExample = org.aiStyleExample ?? null;
    const enable = await api.patch(`${BASE_URL}/api/organizations/${orgId}/org-settings`, { data: { aiEnabled: true } });
    expect(enable.ok(), `enable AI: ${await enable.text()}`).toBeTruthy();

    const today = new Date().toISOString().split('T')[0];
    const measurement = await api.post(`${BASE_URL}/api/measurements`, {
      data: { userId: athleteId, metric: 'FLY10_TIME', value: 1.2, date: today, flyInDistance: 20 },
    });
    expect(measurement.ok(), `create measurement: ${await measurement.text()}`).toBeTruthy();

    const create = (reportType: 'individual' | 'team') =>
      api.post(`${BASE_URL}/api/reports`, {
        data: {
          name: `E2E Coach Notes ${reportType} ${unique}`,
          reportType,
          organizationId: orgId,
          config: {
            ...(reportType === 'individual' ? { athleteId } : {}),
            timeframe: { type: 'preset', preset: 'all_time' },
            metrics: ['FLY10_TIME'],
          },
        },
      });
    const individual = await create('individual');
    expect(individual.ok(), `create individual report: ${await individual.text()}`).toBeTruthy();
    // An individual report is created through the batch path: { reports: [...] }
    reportId = (await individual.json()).reports[0].id;
    const team = await create('team');
    expect(team.ok(), `create team report: ${await team.text()}`).toBeTruthy();
    teamReportId = (await team.json()).id;
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginAs(page, 'org_admin');
      for (const id of [reportId, teamReportId].filter(Boolean)) {
        await page.request.delete(`${BASE_URL}/api/reports/${id}`).catch(() => undefined);
      }
      await page.request.patch(`${BASE_URL}/api/organizations/${orgId}/org-settings`, {
        data: { aiStyleExample: originalStyleExample },
      });
    } finally {
      await ctx.close();
    }
  });

  test.describe('as coach', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'coach');
    });

    test('saves goals and fields, and they persist after a reload', async ({ page }) => {
      await openNotes(page);
      await page.getByLabel('Goals').fill('Make varsity and run a sub 5.0 forty');
      await page.getByLabel('Season phase').selectOption('pre');
      await page.getByLabel('Sessions per week').fill('3');
      await page.getByLabel('Restriction area').fill('Left hamstring');
      await page.getByLabel('PT-cleared').click();
      await page.getByLabel('Surface').click();
      await page.getByLabel('What I saw').fill('Strong start, upright in the last 10 yards');

      const patch = page.waitForResponse((r) => r.url().endsWith(`/coach-notes`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Save notes' }).click();
      expect((await patch).status()).toBe(200);
      await expect(page.getByText('Coach notes saved')).toBeVisible();

      await page.reload();
      // A report with notes opens the form already expanded
      await expect(page.getByTestId('coach-notes-form')).toBeVisible({ timeout: 20000 });
      await expect(page.getByLabel('Goals')).toHaveValue('Make varsity and run a sub 5.0 forty');
      await expect(page.getByLabel('Season phase')).toHaveValue('pre');
      await expect(page.getByLabel('Sessions per week')).toHaveValue('3');
      await expect(page.getByLabel('Restriction area')).toHaveValue('Left hamstring');
      await expect(page.getByLabel('PT-cleared')).toBeChecked();
      await expect(page.getByLabel('Surface')).toBeChecked();
      await expect(page.getByLabel('What I saw')).toHaveValue('Strong start, upright in the last 10 yards');
    });

    test('shows a validation message instead of saving invalid values', async ({ page }) => {
      await openNotes(page);
      let patched = false;
      page.on('request', (r) => {
        if (r.method() === 'PATCH' && r.url().endsWith('/coach-notes')) patched = true;
      });
      await page.getByLabel('Sessions per week').fill('20');
      await page.getByRole('button', { name: 'Save notes' }).click();
      await expect(page.locator('#cn-sessions-err')).toBeVisible();
      expect(patched).toBe(false);
    });

    test('Clear empties the notes', async ({ page }) => {
      await openNotes(page);
      // Own setup: save something first so this test does not depend on an earlier one
      await page.getByLabel('Goals').fill('Goal to be cleared');
      const saved = page.waitForResponse((r) => r.url().endsWith(`/coach-notes`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Save notes' }).click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByLabel('Goals')).not.toHaveValue('');
      const patch = page.waitForResponse((r) => r.url().endsWith(`/coach-notes`) && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Clear' }).click();
      expect((await patch).status()).toBe(200);
      await expect(page.getByText('Coach notes cleared')).toBeVisible();
      await expect(page.getByLabel('Goals')).toHaveValue('');
      await expect(page.getByLabel('Restriction area')).toHaveValue('');
      await expect(page.getByLabel('PT-cleared')).not.toBeChecked();

      const report = await (await page.request.get(`${BASE_URL}/api/reports/${reportId}`)).json();
      expect(report.coachNotes ?? null).toBeNull();
    });

    test('Generate saves dirty notes first, then calls the (stubbed) provider', async ({ page }) => {
      const order: string[] = [];
      await page.route('**/api/reports/*/generate-insights', async (route) => {
        order.push('generate');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ insights: '## Snapshot\nStubbed insight.', generatedAt: new Date().toISOString(), model: 'stub' }),
        });
      });
      page.on('request', (r) => {
        if (r.method() === 'PATCH' && r.url().endsWith('/coach-notes')) order.push('patch');
      });

      await openNotes(page);
      await page.getByLabel('Goals').fill('Unsaved goal before generating');
      await page.getByRole('button', { name: /^Generate/ }).first().click();
      await expect(page.getByText('Stubbed insight.')).toBeVisible({ timeout: 15000 });
      expect(order).toEqual(['patch', 'generate']);

      const report = await (await page.request.get(`${BASE_URL}/api/reports/${reportId}`)).json();
      expect(report.coachNotes?.goals).toBe('Unsaved goal before generating');
    });

    test('is not offered on a team report, and the API refuses notes for it', async ({ page }) => {
        await page.goto(`${BASE_URL}/reports/${teamReportId}`);
      await expect(page.getByText('Coaching Insights').first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: 'Coach notes for the AI' })).toHaveCount(0);
      const res = await page.request.patch(notesUrl(teamReportId), { data: { goals: 'x' } });
      expect(res.status()).toBe(400);
    });
  });

  // Opt-in: COACH_NOTES_SCREENSHOTS=1 writes screenshots/ai-coach-notes-app-*.png for PR review
  test.describe('screenshots', () => {
    test.skip(!process.env.COACH_NOTES_SCREENSHOTS, 'set COACH_NOTES_SCREENSHOTS=1');
    for (const [name, size] of [['desktop', { width: 1280, height: 720 }], ['mobile', { width: 375, height: 667 }]] as const) {
      test(`coach notes form ${name}`, async ({ page }) => {
        await page.setViewportSize(size);
        await loginAs(page, 'coach');
        const saved = await page.request.patch(notesUrl(reportId), {
          data: { goals: 'Make varsity and run a sub 5.0 forty', seasonPhase: 'pre', sessionsPerWeek: 3, whatISaw: 'Strong start, upright in the last 10 yards' },
        });
        expect(saved.ok()).toBeTruthy();
        await openNotes(page);
        await page.getByTestId('coach-notes-form').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `screenshots/ai-coach-notes-app-${name}.png`, fullPage: name === 'mobile' });
      });
    }
  });

  test.describe('as athlete', () => {
    test('does not see the form and never receives coachNotes', async ({ browser, page }) => {
      // The coach's notes exist and the report is shared with the athlete
      await loginAs(page, 'org_admin');
      const saved = await page.request.patch(notesUrl(reportId), { data: { goals: 'Secret coach goal' } });
      expect(saved.ok(), await saved.text()).toBeTruthy();
      const shared = await page.request.post(`${BASE_URL}/api/reports/${reportId}/share`, { data: { athleteId } });
      expect([200, 201, 409]).toContain(shared.status());

      const ctx = await browser.newContext();
      const athletePage = await ctx.newPage();
      await loginAs(athletePage, 'athlete');
      const apiResponse = athletePage.waitForResponse(
        (r) => r.url().endsWith(`/api/reports/${reportId}`) && r.request().method() === 'GET'
      );
      await athletePage.goto(`${BASE_URL}/reports/${reportId}`);
      const response = await apiResponse;
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).not.toHaveProperty('coachNotes');
      expect(JSON.stringify(body)).not.toContain('Secret coach goal');

      await expect(athletePage.getByText('Performance Summary').first()).toBeVisible({ timeout: 20000 });
      await expect(athletePage.getByRole('button', { name: 'Coach notes for the AI' })).toHaveCount(0);
      await expect(athletePage.getByTestId('coach-notes-form')).toHaveCount(0);

      // Writing is refused for an athlete
      const write = await athletePage.request.patch(notesUrl(reportId), { data: { goals: 'hacked' } });
      expect(write.status()).toBe(403);
      await ctx.close();
    });
  });

  test.describe('org settings: example analysis', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'org_admin');
      await page.goto(`${BASE_URL}/organizations/${orgId}/settings/admin`);
      await expect(page.getByLabel('Example analysis (your style)')).toBeVisible({ timeout: 20000 });
    });

    test('org admin saves an example analysis and it persists', async ({ page }) => {
      const field = page.getByLabel('Example analysis (your style)');
      await field.fill(STYLE_EXAMPLE);
      await page.getByRole('button', { name: 'Save Changes' }).click();
      await expect(page.getByText('Settings updated').first()).toBeVisible({ timeout: 10000 });

      await page.reload();
      await expect(page.getByLabel('Example analysis (your style)')).toHaveValue(STYLE_EXAMPLE);
    });

    test('a value over 1500 characters is blocked in the browser (maxLength)', async ({ page }) => {
      const field = page.getByLabel('Example analysis (your style)');
      await field.fill('');
      await field.pressSequentially('a'.repeat(1510), { delay: 0 });
      await expect(field).toHaveValue('a'.repeat(1500));
      await expect(page.getByText('1500 / 1500')).toBeVisible();
    });

    test('the server also rejects an over-long example', async ({ page }) => {
      const res = await page.request.patch(`${BASE_URL}/api/organizations/${orgId}/org-settings`, {
        data: { aiStyleExample: 'a'.repeat(1501) },
      });
      expect(res.status()).toBe(400);
      expect(JSON.stringify(await res.json())).toMatch(/1500/);
    });
  });
});
