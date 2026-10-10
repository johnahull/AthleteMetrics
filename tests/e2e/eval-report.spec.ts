/**
 * E2E Tests for the Eval Report coach UI (AM-FEAT-019 P5)
 *
 * Coverage: the per-athlete "Generate eval report" entry point, the selection dialog (preset, metric
 * checklist, college gauge, Load, coach note), preview, generate + PDF download, the optional share link
 * (never created automatically), the remembered selection, and eval battery templates
 * (save an event's metrics as a template, create an event from a template).
 *
 * Test data is created through the API in beforeAll and removed in afterAll. The CI E2E suite is red (#490),
 * so run this spec locally against a database that has the site metrics and the default "Soccer eval (yards)"
 * template (a normal `db:push` + `db:migrate:manual` database does).
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { loginAsDefaultUser, loginAsAthlete } from './helpers/auth';
import { canTestRoleAuthorization } from './fixtures/test-users';

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

const unique = Date.now().toString(36);
const EVENT_NAME = `E2E Eval Report Event ${unique}`;
const TEMPLATE_NAME = `E2E Eval Battery ${unique}`;
const FROM_TEMPLATE_EVENT_NAME = `E2E Eval From Template ${unique}`;

// A date in the recent past so athletes of these birth years have a stable age band
const EVENT_DATE = new Date().toISOString().split('T')[0];
const BIRTH_YEAR_SENIOR = new Date().getFullYear() - 18;

const MEASURED = [
  { metric: 'DASH_10YD', value: 1.9 },
  { metric: 'FLY10_TIME', value: 1.1 },
  { metric: 'JUMP_CMJ_HOH', value: 19 },
  { metric: 'AGILITY_505_YD_L', value: 2.7 },
  { metric: 'AGILITY_505_YD_R', value: 2.74 },
  { metric: 'VERTICAL_JUMP', value: 20 },
];

interface Created {
  organizationId: string;
  eventId: string;
  measuredAthlete: { id: string; name: string };
  unmeasuredAthlete: { id: string; name: string };
  extraEventIds: string[];
  reportIds: string[];
  templateIds: string[];
  /** The org's eval report settings before the run; put back in afterAll. Null when they could not be read. */
  originalSettings: { presets: unknown; lastSelection: unknown } | null;
}

async function json(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function openReportsTab(page: Page, eventId: string) {
  await page.goto(`${BASE_URL}/events/${eventId}`);
  await page.waitForSelector('[data-testid="tab-reports"]', { timeout: 15000 });
  await page.click('[data-testid="tab-reports"]');
  await expect(page.getByTestId('eval-reports-card')).toBeVisible();
}

async function openDialog(page: Page, athleteName: string) {
  await page.getByRole('button', { name: `Generate eval report for ${athleteName}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Headline metrics')).toBeVisible({ timeout: 15000 });
  return dialog;
}

test.describe('Eval report (AM-FEAT-019 P5)', () => {
  test.describe.configure({ mode: 'serial' });

  const created: Created = {
    organizationId: '',
    eventId: '',
    measuredAthlete: { id: '', name: '' },
    unmeasuredAthlete: { id: '', name: '' },
    extraEventIds: [],
    reportIds: [],
    templateIds: [],
    originalSettings: null,
  };

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsDefaultUser(page);
    const api = page.request;

    // Athletes created through the API join the user's first organization, so use that one
    const memberships = await json(await api.get(`${BASE_URL}/api/auth/me/organizations`));
    const me = await json(await api.get(`${BASE_URL}/api/auth/me`));
    created.organizationId =
      (Array.isArray(memberships) ? memberships[0]?.organizationId : undefined) ??
      me?.user?.primaryOrganizationId ??
      me?.primaryOrganizationId;
    expect(created.organizationId, 'the test user needs an organization').toBeTruthy();
    const settingsUrl = `${BASE_URL}/api/organizations/${created.organizationId}/eval-report-settings`;

    // Start from clean org settings (a remembered selection or preset would change what the dialog shows),
    // and keep the originals to put back in afterAll
    const settingsResponse = await api.get(settingsUrl);
    if (settingsResponse.ok()) {
      const original = await settingsResponse.json();
      created.originalSettings = { presets: original.presets ?? {}, lastSelection: original.lastSelection ?? null };
      const cleared = await api.put(settingsUrl, { data: { presets: {}, lastSelection: null } });
      expect(cleared.ok(), `clear settings: ${await cleared.text()}`).toBeTruthy();
    }

    const makeAthlete = async (firstName: string, withMeasurements: boolean) => {
      const lastName = `Eval${unique}`;
      const response = await api.post(`${BASE_URL}/api/athletes`, {
        data: {
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          emails: [`${firstName.toLowerCase()}.${unique}@example.com`],
          birthDate: `${BIRTH_YEAR_SENIOR}-02-10`,
          birthYear: BIRTH_YEAR_SENIOR,
          graduationYear: new Date().getFullYear(),
          gender: 'Female',
          sports: ['Soccer'],
        },
      });
      expect(response.ok(), `create athlete: ${await response.text()}`).toBeTruthy();
      const athlete = await response.json();
      // Athletes created through the API start inactive; an eval report is only built for an active athlete
      const activated = await api.patch(`${BASE_URL}/api/athletes/${athlete.id}/status`, { data: { isActive: true } });
      expect(activated.ok(), `activate athlete: ${await activated.text()}`).toBeTruthy();
      return { id: athlete.id as string, name: `${firstName} ${lastName}`, withMeasurements };
    };
    const measured = await makeAthlete('Measured', true);
    const unmeasured = await makeAthlete('Unmeasured', false);
    created.measuredAthlete = { id: measured.id, name: measured.name };
    created.unmeasuredAthlete = { id: unmeasured.id, name: unmeasured.name };

    const eventResponse = await api.post(`${BASE_URL}/api/events`, {
      data: {
        name: EVENT_NAME,
        startDate: `${EVENT_DATE}T12:00:00.000Z`,
        visibility: 'org_private',
        registrationMode: 'open',
        status: 'published',
        organizationId: created.organizationId,
      },
    });
    expect(eventResponse.ok(), `create event: ${await eventResponse.text()}`).toBeTruthy();
    created.eventId = (await eventResponse.json()).id;

    // Set up the event's metrics from the default battery. If the global default is missing, create an
    // equivalent organization template. One request either way: adding metrics one by one trips the rate limit.
    const available = await json(await api.get(`${BASE_URL}/api/organizations/${created.organizationId}/eval-templates`));
    let battery = Array.isArray(available)
      ? available.find((t: { name: string; organizationId: string | null }) => t.name === 'Soccer eval (yards)' && !t.organizationId)
      : undefined;
    if (!battery) {
      const keys = ['DASH_10', 'FLY_10', 'CMJ_HOH', '505_LEFT', '505_RIGHT', 'HANDS_FREE_JUMP'];
      const made = await api.post(`${BASE_URL}/api/organizations/${created.organizationId}/eval-templates`, {
        data: {
          name: `E2E Battery ${unique}`,
          sport: 'SOCCER',
          metrics: keys.map((metricKey, displayOrder) => ({ metricKey, isRequired: true, displayOrder })),
        },
      });
      expect(made.ok(), `create fallback template: ${await made.text()}`).toBeTruthy();
      battery = await made.json();
      created.templateIds.push(battery.id);
    }
    const applied = await api.post(`${BASE_URL}/api/events/${created.eventId}/apply-eval-template`, { data: { templateId: battery.id } });
    expect(applied.ok(), `apply template: ${await applied.text()}`).toBeTruthy();
    const { added } = await applied.json();
    for (const m of MEASURED) expect(added, `${m.metric} is part of the battery`).toContain(m.metric);

    const bulk = await api.post(`${BASE_URL}/api/events/${created.eventId}/measurements/bulk`, {
      data: { measurements: MEASURED.map((m) => ({ userId: measured.id, metric: m.metric, value: m.value, date: EVENT_DATE })) },
    });
    expect(bulk.ok(), `add measurements: ${await bulk.text()}`).toBeTruthy();

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsDefaultUser(page);
      const api = page.request;
      // Put the organization's eval report settings back, whatever the tests did
      if (created.originalSettings) {
        await api
          .put(`${BASE_URL}/api/organizations/${created.organizationId}/eval-report-settings`, { data: created.originalSettings })
          .catch(() => {});
      }
      for (const id of created.reportIds) await api.delete(`${BASE_URL}/api/reports/${id}`).catch(() => {});
      for (const id of created.templateIds) await api.delete(`${BASE_URL}/api/eval-templates/${id}`).catch(() => {});
      for (const id of [created.eventId, ...created.extraEventIds].filter(Boolean)) {
        await api.delete(`${BASE_URL}/api/events/${id}`).catch(() => {});
      }
      for (const id of [created.measuredAthlete.id, created.unmeasuredAthlete.id].filter(Boolean)) {
        await api.delete(`${BASE_URL}/api/athletes/${id}`).catch(() => {});
      }
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('offers "Generate eval report" only for athletes with measurements in the event', async ({ page }) => {
    await openReportsTab(page, created.eventId);

    await expect(page.getByRole('button', { name: `Generate eval report for ${created.measuredAthlete.name}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Generate eval report for ${created.unmeasuredAthlete.name}` })).toHaveCount(0);
  });

  test('opens with the preset and headline metrics from the defaults', async ({ page }) => {
    await openReportsTab(page, created.eventId);
    const dialog = await openDialog(page, created.measuredAthlete.name);

    // The athlete graduates this year: Senior
    await expect(dialog.getByRole('radio', { name: 'Senior' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: '10-yard dash', exact: true })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Fly 10', exact: true })).toBeChecked();
    // Measured but not a headline metric: offered, unchecked
    await expect(dialog.getByRole('checkbox', { name: 'Hands-free jump height', exact: true })).not.toBeChecked();
    // Radar is off by default
    await expect(dialog.getByRole('switch', { name: 'Radar chart' })).not.toBeChecked();
  });

  test('switching the preset applies its defaults; choices can be changed; preview shows the report without saving', async ({ page }) => {
    await openReportsTab(page, created.eventId);
    const dialog = await openDialog(page, created.measuredAthlete.name);

    const college = dialog.getByRole('switch', { name: 'Show college standard gauge' });
    await expect(college).toBeChecked(); // Senior
    await dialog.getByRole('radio', { name: 'Middle school' }).click();
    await expect(college).not.toBeChecked();
    await dialog.getByRole('radio', { name: 'High school' }).click();
    await expect(college).not.toBeChecked();
    await dialog.getByRole('radio', { name: 'Senior' }).click();
    await expect(college).toBeChecked();

    await dialog.getByRole('checkbox', { name: 'Fly 10', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Hands-free jump height', exact: true }).click();
    await dialog.getByRole('radio', { name: 'Heavy' }).click();
    await dialog.getByRole('textbox', { name: /what we saw/i }).fill('Quick off the mark today.');
    await expect(dialog.getByText('25 / 2000')).toBeVisible();

    await dialog.getByRole('button', { name: 'Preview' }).click();
    const body = dialog.getByTestId('eval-report-body');
    await expect(body).toBeVisible();
    await expect(body.getByText('Hands-free jump height')).toBeVisible();
    await expect(body.getByText('Fly 10')).toHaveCount(0);
    await expect(body.getByText('Quick off the mark today.')).toBeVisible();
    await expect(body.getByText(/Load:\s*heavy/i)).toBeVisible();
    // Never any pre-test survey data in the report
    await expect(body.getByText(/sleep|soreness|stress|energy|cycle/i)).toHaveCount(0);

    // Nothing was saved by previewing
    const defaults = await json(
      await page.request.get(`${BASE_URL}/api/events/${created.eventId}/athletes/${created.measuredAthlete.id}/eval-report/defaults`)
    );
    expect(defaults.source).toBe('computed');
  });

  test('generate saves the report, downloads a PDF and creates no share link', async ({ page }) => {
    await openReportsTab(page, created.eventId);
    const dialog = await openDialog(page, created.measuredAthlete.name);
    await dialog.getByRole('checkbox', { name: 'Fly 10', exact: true }).click(); // a choice worth remembering
    await dialog.getByRole('textbox', { name: /what we saw/i }).fill('Remembered note.');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Generate report' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    await expect(dialog.getByText('Report saved')).toBeVisible();
    const reportLink = dialog.getByRole('link', { name: /open saved report/i });
    const href = await reportLink.getAttribute('href');
    expect(href).toMatch(/^\/reports\/[\w-]+$/);
    const reportId = href!.split('/').pop()!;
    created.reportIds.push(reportId);

    // The share link is optional and off by default: nothing exists until the coach asks
    await expect(dialog.getByText(/no link has been created/i)).toBeVisible();
    const snapshots = await json(await page.request.get(`${BASE_URL}/api/reports/${reportId}/snapshots`));
    expect(Array.isArray(snapshots) ? snapshots : snapshots.snapshots ?? []).toHaveLength(0);

    // The saved report opens
    await reportLink.click();
    await expect(page).toHaveURL(new RegExp(`/reports/${reportId}$`));
    await expect(page.getByTestId('eval-report-body')).toBeVisible();
  });

  test('"Create share link" is a separate, optional step', async ({ page }) => {
    await openReportsTab(page, created.eventId);
    const dialog = await openDialog(page, created.measuredAthlete.name);
    await dialog.getByRole('button', { name: 'Generate report' }).click();
    await expect(dialog.getByText('Report saved')).toBeVisible();
    const href = await dialog.getByRole('link', { name: /open saved report/i }).getAttribute('href');
    created.reportIds.push(href!.split('/').pop()!);

    await dialog.getByRole('button', { name: /create share link/i }).click();
    await expect(page.getByText('Create New Share Link')).toBeVisible();
  });

  test('the last saved report for the athlete is the starting point next time, and the org remembers the selection', async ({ page }) => {
    await openReportsTab(page, created.eventId);
    const dialog = await openDialog(page, created.measuredAthlete.name);

    await expect(dialog.getByText(/last saved report/i)).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Fly 10', exact: true })).not.toBeChecked();
    await expect(dialog.getByRole('textbox', { name: /what we saw/i })).toHaveValue('Remembered note.');

    const settings = await json(await page.request.get(`${BASE_URL}/api/organizations/${created.organizationId}/eval-report-settings`));
    expect(settings.lastSelection).toBeTruthy();
    expect(settings.lastSelection.metricKeys).not.toContain('FLY_10');
  });

  test('saves the event metrics as a template and creates a new event from it', async ({ page }) => {
    // Save as template from the Metrics tab
    await page.goto(`${BASE_URL}/events/${created.eventId}`);
    await page.waitForSelector('[data-testid="tab-metrics"]', { timeout: 15000 });
    await page.click('[data-testid="tab-metrics"]');
    await page.getByRole('button', { name: 'Save metrics as template' }).click();
    await page.getByLabel('Template name').fill(TEMPLATE_NAME);
    await page.getByRole('button', { name: 'Save template' }).click();
    await expect(page.getByText('Template saved').first()).toBeVisible();

    const templates = await json(await page.request.get(`${BASE_URL}/api/organizations/${created.organizationId}/eval-templates`));
    const saved = templates.find((t: { name: string }) => t.name === TEMPLATE_NAME);
    expect(saved, 'the template exists').toBeTruthy();
    created.templateIds.push(saved.id);
    const metricCount = saved.metrics.length;
    expect(metricCount).toBeGreaterThanOrEqual(MEASURED.length);

    // Create a new event from it
    await page.goto(`${BASE_URL}/events/new`);
    await page.getByLabel(/event name/i).fill(FROM_TEMPLATE_EVENT_NAME);
    await page.getByLabel(/start date/i).fill(EVENT_DATE);
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('combobox', { name: /start from template/i }).click();
    await page.getByRole('option', { name: TEMPLATE_NAME }).click();
    // The template's tests are in the list before the event exists, so the coach can adjust them
    await expect(page.getByText(`Selected Metrics (${metricCount})`)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /publish event/i }).click();

    await expect(page).toHaveURL(/\/events\/[\w-]+$/, { timeout: 20000 });
    await expect(page.getByText(`created with ${metricCount} metrics`).first()).toBeVisible();
    created.extraEventIds.push(page.url().split('/').pop()!);

    await page.click('[data-testid="tab-metrics"]');
    await expect(page.getByText(`${metricCount} metrics configured`)).toBeVisible();
  });

  test('a non-writer cannot reach eval report data', async ({ page }) => {
    test.skip(!canTestRoleAuthorization('coach', 'athlete'), 'Needs separate coach and athlete credentials (E2E_ATHLETE_USERNAME / E2E_ATHLETE_PASSWORD)');
    await loginAsAthlete(page);

    const defaults = await page.request.get(
      `${BASE_URL}/api/events/${created.eventId}/athletes/${created.measuredAthlete.id}/eval-report/defaults`
    );
    expect(defaults.status()).toBe(404);

    await page.goto(`${BASE_URL}/events/${created.eventId}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('eval-reports-card')).toHaveCount(0);
    await expect(page.getByText('Generate eval report')).toHaveCount(0);
  });
});
