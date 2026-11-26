import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { loginAsDefaultUser, loginWithCredentials } from './helpers/auth';

/**
 * E2E Tests: Anytime (standing) wellness requests (AM-FEAT-027)
 *
 * Coach sends an "Anytime" request to one athlete; the athlete answers it from
 * "Anytime check-ins" as often as they like (a same-day resubmit replaces the day's
 * entry), it never raises the dashboard pending-tasks banner, the coach sees day
 * compliance, and a signed-out visit to its link asks to sign in.
 *
 * Self-contained: the default user (an admin of the global-setup organization, also the
 * coach here: CI has only that one account) creates a template, an athlete account with a
 * known password and one measurement (the athlete dashboard only mounts the pending-tasks
 * banner once it has data) through the API, and afterAll deletes them again.
 *
 * Components: RequestModal, RequestsList (/wellness Requests tab), wellness-my-requests,
 * wellness-submit, PendingTasksBanner (/my-dashboard)
 *
 * Quarantined in CI (tests/e2e/quarantine.json, issue #490): in a full run the one shared admin
 * account has used up the API rate limit before this spec starts (even GETs answer 429).
 * Run it on its own: E2E_QUARANTINE=include npx playwright test wellness-anytime-request
 *   --config=playwright.staging.config.ts --project=chromium
 */

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';
const UNIQUE = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TEMPLATE_NAME = `Anytime Check ${UNIQUE}`;
const ATHLETE = {
  username: `anytime_${UNIQUE}`,
  password: 'AnytimePass123!',
  firstName: 'Ava',
  lastName: `Anytime${UNIQUE}`,
};

function organizationId(): string {
  // Written by global-setup.ts on every run (CI included), unlike .local-e2e-config.json
  const config = JSON.parse(readFileSync(join(process.cwd(), 'tests/e2e/.e2e-test-config.json'), 'utf-8'));
  return config.organizationId;
}

const RATE_LIMITED = 'shared write rate limit already used up by earlier specs';

/** Signs in and marks the onboarding tour as done: its overlay would intercept clicks on a first login */
async function signIn(page: Page, username?: string): Promise<void> {
  if (username) await loginWithCredentials(page, username, ATHLETE.password);
  else await loginAsDefaultUser(page);
  await page.request.put(`${BASE_URL}/api/profile/onboarding-status`, { data: { completed: true } });
}

async function newSignedInPage(browser: Browser, username?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, username);
  return page;
}

async function openRequestsTab(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/wellness`);
  await page.getByRole('tab', { name: 'Requests' }).click();
}

/** Answer the template's required scale question and submit; expects the standing success card */
async function submitCheckIn(page: Page): Promise<boolean> {
  await expect(page.getByTestId('standing-replace-note')).toBeVisible();
  // Standing requests use the signed-in athlete: no name picker
  await expect(page.getByTestId('athlete-selector')).toHaveCount(0);
  const slider = page.getByRole('slider').first();
  await slider.focus();
  await slider.press('ArrowRight');
  const submitted = page.waitForResponse(
    r => r.url().includes('/api/wellness/responses') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Submit' }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  await expect(page.getByTestId('standing-submit-success')).toBeVisible();
  return (await response.json()).replaced;
}

test.describe.serial('Wellness Anytime requests', () => {
  test.setTimeout(90 * 1000);

  let orgId: string;
  let templateId: string;
  let athleteId: string;
  let requestId: string;
  let publicToken: string;
  let hasMeasurement = false;

  test.beforeAll(async ({ browser }) => {
    orgId = organizationId();
    const page = await newSignedInPage(browser);
    const api = page.request;

    const template = await api.post(`${BASE_URL}/api/organizations/${orgId}/wellness/templates`, {
      data: {
        name: TEMPLATE_NAME,
        description: 'Anytime E2E template',
        isActive: true,
        config: {
          questions: [
            { id: 'energy', type: 'scale', label: 'How is your energy today?', scaleMin: 1, scaleMax: 5, minLabel: 'Very Low', maxLabel: 'Very High', required: true },
            { id: 'notes', type: 'text', label: 'Anything else?', maxLength: 500, required: false },
          ],
        },
      },
    });
    test.skip(template.status() === 429, RATE_LIMITED);
    expect(template.ok(), `create template: ${await template.text()}`).toBeTruthy();
    templateId = (await template.json()).id;

    // An adult with a real email and a birth date, so the profile gate lets them in
    const athlete = await api.post(`${BASE_URL}/api/organizations/${orgId}/users`, {
      data: {
        ...ATHLETE,
        emails: [`${ATHLETE.username}@test.com`],
        birthDate: '2000-03-01',
        role: 'athlete',
      },
    });
    expect(athlete.ok(), `create athlete: ${await athlete.text()}`).toBeTruthy();
    athleteId = (await athlete.json()).id;

    const measurement = await api.post(`${BASE_URL}/api/measurements`, {
      data: { userId: athleteId, metric: 'FLY10_TIME', value: 1.2, date: new Date().toISOString().slice(0, 10), flyInDistance: 20 },
    });
    // Only the banner check needs it, so a used-up measurement budget drops that check alone
    hasMeasurement = measurement.ok();
    if (measurement.status() !== 429) {
      expect(measurement.ok(), `create measurement: ${await measurement.text()}`).toBeTruthy();
    }

    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    if (!orgId) return;
    const page = await newSignedInPage(browser);
    const api = page.request;
    // In order: the request first, the template last. Deleting a user is a soft delete
    // (deactivated, memberships dropped); global teardown removes the organization itself.
    const paths = [
      requestId && `/api/organizations/${orgId}/wellness/requests/${requestId}`,
      athleteId && `/api/users/${athleteId}`,
      templateId && `/api/organizations/${orgId}/wellness/templates/${templateId}`,
    ];
    for (const path of paths) {
      if (!path) continue;
      const res = await api.delete(`${BASE_URL}${path}`);
      if (!res.ok()) console.warn(`Cleanup DELETE ${path} failed: ${res.status()}`);
    }
    await page.context().close();
  });

  test('coach sends an Anytime request to one athlete', async ({ browser }) => {
    const page = await newSignedInPage(browser);
    await openRequestsTab(page);

    await page.getByTestId('button-send-request').click();
    const modal = page.getByTestId('request-modal');
    await expect(modal).toBeVisible();

    await modal.getByTestId('select-template').click();
    await page.getByRole('option', { name: TEMPLATE_NAME }).click();

    await modal.getByTestId('send-mode-anytime').click();
    await expect(modal.getByTestId('anytime-description')).toBeVisible();
    // Anytime requests never expire and are answered by signed-in athletes only
    await expect(modal.getByTestId('input-expiry-date')).toHaveCount(0);
    await expect(modal.getByTestId('radio-magic-link')).toBeDisabled();

    await modal.getByPlaceholder(/^Search /).fill(ATHLETE.lastName);
    await modal.locator(`#athlete-${athleteId}`).click();

    const created = page.waitForResponse(
      r => /\/wellness\/requests$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'
    );
    await modal.getByTestId('button-send-request-submit').click();
    const response = await created;
    test.skip(response.status() === 429, RATE_LIMITED);
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.isStanding).toBe(true);
    expect(body.distributionMethod).toBe('athlete_account');
    expect(body.expiresAt).toBeNull();
    expect(body.targetAthleteIds).toEqual([athleteId]);
    requestId = body.id;
    publicToken = body.publicToken;
    expect(publicToken).toBeTruthy();

    await expect(modal).toBeHidden();
    await expect(page.getByTestId(`request-status-${requestId}`)).toContainText('Anytime');

    await page.context().close();
  });

  test('athlete answers it from Anytime check-ins, twice the same day, with no dashboard banner', async ({ browser }) => {
    test.skip(!requestId, RATE_LIMITED);
    const page = await newSignedInPage(browser, ATHLETE.username);

    // An optional, never-due request must not raise the pending-tasks banner
    if (hasMeasurement) {
      const myRequests = page.waitForResponse(r => r.url().includes('/api/wellness/my-requests'));
      await page.goto(`${BASE_URL}/my-dashboard`);
      // The banner only mounts in the full (non-empty) dashboard; prove that layout rendered
      await expect(page.getByText('Ready for your next session?')).toBeVisible();
      await myRequests;
      await expect(page.getByTestId('pending-tasks-banner')).toHaveCount(0);
    }

    await page.goto(`${BASE_URL}/wellness/my-requests`);
    const anytime = page.getByTestId('anytime-requests-section');
    await expect(anytime).toContainText('Anytime check-ins');
    // (Card titles of organization templates read "Wellness Check-In": the public template
    // endpoint this page uses only serves system templates. Pre-existing, not Anytime-specific.)
    await expect(anytime.getByTestId('wellness-request-card')).toHaveCount(1);
    await expect(page.getByTestId('pending-requests-section')).toHaveCount(0);

    await anytime.getByRole('button', { name: 'Fill out' }).click();
    await expect(page).toHaveURL(new RegExp(`/wellness/submit/${publicToken}$`));
    await expect(page.getByText(TEMPLATE_NAME).first()).toBeVisible();
    expect(await submitCheckIn(page)).toBe(false);

    // Still listed after a check-in
    await page.getByRole('link', { name: 'Back to my check-ins' }).click();
    await expect(page.getByTestId('anytime-requests-section').getByTestId('wellness-request-card')).toHaveCount(1);

    // A second check-in the same day succeeds and replaces today's entry
    await page.goto(`${BASE_URL}/wellness/submit/${publicToken}`);
    expect(await submitCheckIn(page)).toBe(true);

    // Only the live entry is listed: the first one is superseded
    const mine = await (await page.request.get(`${BASE_URL}/api/wellness/my-responses`)).json();
    expect(mine.responses.filter((r: { requestId: string }) => r.requestId === requestId)).toHaveLength(1);

    await page.context().close();
  });

  test('coach sees day compliance for the Anytime request', async ({ browser }) => {
    test.skip(!requestId, RATE_LIMITED);
    const page = await newSignedInPage(browser);
    await openRequestsTab(page);
    // Compliance counts COMPLETE UTC days (ending yesterday) since the request was created, so a request
    // created today has none yet; today's entries count from tomorrow. The day-counting itself
    // (two submits on one day = one entry day) is covered by the wellness-compliance unit tests.
    await expect(page.getByTestId(`request-status-${requestId}`)).toContainText('Anytime');
    await expect(page.getByTestId(`completion-text-${requestId}`)).toHaveText('No complete days yet');
    await page.context().close();
  });

  test('a signed-out visit to the request link asks to sign in, then returns to the check-in', async ({ browser }) => {
    test.skip(!requestId, RATE_LIMITED);
    // New contexts get the project's signed-in storageState unless told otherwise
    const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
    await page.goto(`${BASE_URL}/wellness/submit/${publicToken}`);
    await expect(page.getByText('Please sign in to submit this check-in')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await page.fill('#username, input[name="username"]', ATHLETE.username);
    await page.fill('#password, input[name="password"]', ATHLETE.password);
    await page.click('button[type="submit"]');

    await page.waitForURL(url => url.pathname === `/wellness/submit/${publicToken}`);
    await expect(page.getByTestId('standing-replace-note')).toBeVisible();
    await page.context().close();
  });
});
