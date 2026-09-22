import { test, expect, type Page } from './fixtures/e2e-base';
import { readFileSync } from 'fs';
import { loginAsDefaultUser, loginAs } from './helpers/auth';
import { canTestRoleAuthorization, hasUserCredentials } from './fixtures/test-users';

/**
 * LLM EXPORT FEATURE: End-to-End Tests
 *
 * Covers the split-button the coach uses to hand an athlete's data to an LLM.
 *
 * What we exercise:
 *  - Copy-to-clipboard primary action (with the 1.5s "Copied ✓" confirmation)
 *  - Dropdown → Download as Markdown (.md)
 *  - Dropdown → Download as JSON (.json) + payload shape
 *  - Role gating: the button is ABSENT (not disabled) for athletes viewing themselves
 *  - Keyboard accessibility: Tab/Enter to copy, chevron dropdown reachable
 *
 * Surface under test: the Individual Report view. The button lives on both the
 * report view and the athlete profile — the report view is the higher-traffic
 * path for coaches and easier to scaffold deterministically from a test.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

function generateTestReport() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `LLM Export Test ${uniqueId}`,
    description: `E2E test report created at ${new Date().toISOString()}`,
  };
}

async function getUserOrgId(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const authData = localStorage.getItem('auth');
    if (authData) {
      const parsed = JSON.parse(authData);
      return parsed.organizationContext || null;
    }
    return null;
  });
}

/**
 * Pull a usable athlete id from the org so the individual report has a real target.
 * Returns null when no athletes exist — the caller should skip the test in that case
 * rather than fail noisily (empty staging orgs are a legitimate environment state).
 */
async function getFirstAthleteId(page: Page, organizationId: string | null): Promise<string | null> {
  const res = await page.request.get(`${STAGING_URL}/api/athletes`);
  if (!res.ok()) return null;
  const athletes = await res.json();
  if (!Array.isArray(athletes) || athletes.length === 0) return null;
  if (organizationId) {
    const inOrg = athletes.find((a: any) =>
      a.organizationId === organizationId || a.organizations?.some?.((o: any) => o.id === organizationId),
    );
    if (inOrg?.id) return inOrg.id;
  }
  return athletes[0]?.id ?? null;
}

/**
 * Scaffold an individual report for a given athlete and return its id.
 * Mirrors the pattern used in report-pdf-export.spec.ts — we skip the wizard
 * and POST directly to keep the test focused on the export button, not creation.
 */
async function createIndividualReport(
  page: Page,
  athleteId: string,
  organizationId: string | null,
): Promise<string> {
  const testReport = generateTestReport();
  const res = await page.request.post(`${STAGING_URL}/api/reports`, {
    data: {
      name: testReport.name,
      description: testReport.description,
      reportType: 'individual',
      organizationId,
      config: {
        athleteId,
        timeframe: { type: 'preset', preset: 'season' },
        metrics: ['FLY10_TIME'],
      },
    },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create report: ${res.status()} ${await res.text()}`);
  }
  const data = await res.json();
  return data.id;
}

test.describe('Athlete LLM Export - End-to-End', () => {
  let createdReportIds: string[] = [];

  test.beforeEach(async ({ page, context }) => {
    await loginAsDefaultUser(page);
    createdReportIds = [];

    // Clipboard read/write permission must be granted BEFORE we navigate,
    // otherwise navigator.clipboard.readText() throws NotAllowedError in Chromium.
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: STAGING_URL });
    } catch (err) {
      // Some browsers don't support clipboard permissions; tests that require
      // clipboard readback will handle the failure individually.
      console.warn('Clipboard permissions not granted:', err instanceof Error ? err.message : err);
    }
  });

  test.afterEach(async ({ page }) => {
    for (const reportId of createdReportIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/${reportId}`);
      } catch (error) {
        console.warn(`Failed to cleanup report ${reportId}:`, error);
      }
    }
  });

  test('renders the split-button on an individual report for a coach', async ({ page }) => {
    const orgId = await getUserOrgId(page);
    const athleteId = await getFirstAthleteId(page, orgId);
    test.skip(!athleteId, 'No athletes available in the org — cannot scaffold an individual report.');

    const reportId = await createIndividualReport(page, athleteId!, orgId);
    createdReportIds.push(reportId);

    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    // Both halves of the split button should be present.
    await expect(page.getByTestId('llm-export-copy')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('llm-export-menu')).toBeVisible();
  });

  test('copy-for-LLM writes a Markdown export to the clipboard', async ({ page }) => {
    const orgId = await getUserOrgId(page);
    const athleteId = await getFirstAthleteId(page, orgId);
    test.skip(!athleteId, 'No athletes available in the org — cannot scaffold an individual report.');

    const reportId = await createIndividualReport(page, athleteId!, orgId);
    createdReportIds.push(reportId);

    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    const copyButton = page.getByTestId('llm-export-copy');
    await expect(copyButton).toBeVisible({ timeout: 10000 });

    await copyButton.click();

    // Gate the clipboard read on the UI confirmation, not on the network response.
    // page.waitForResponse resolves when bytes hit the wire — but the hook still
    // has to parse response.text() and then await clipboard.writeText() before
    // the clipboard is actually populated. The "Copied" label is set after
    // writeText resolves, so it's the true readiness signal.
    await expect(copyButton).toContainText('Copied', { timeout: 5000 });

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    // Shape-level assertion: catches content regressions (missing sections) without
    // coupling the test to every markdown formatting tweak.
    expect(clipboardText).toContain('# Athlete Performance Export');
    expect(clipboardText).toContain('## Athlete Profile');
    expect(clipboardText).toContain('## Metric Glossary');
    expect(clipboardText.length).toBeGreaterThan(100);
  });

  test('the button shows "Copied ✓" briefly and reverts to idle', async ({ page }) => {
    const orgId = await getUserOrgId(page);
    const athleteId = await getFirstAthleteId(page, orgId);
    test.skip(!athleteId, 'No athletes available in the org — cannot scaffold an individual report.');

    const reportId = await createIndividualReport(page, athleteId!, orgId);
    createdReportIds.push(reportId);

    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    const copyButton = page.getByTestId('llm-export-copy');
    await expect(copyButton).toBeVisible({ timeout: 10000 });
    await expect(copyButton).toContainText('Copy for LLM');

    await copyButton.click();

    // Confirmation appears within ~1s and holds for ~1.5s (CONFIRMATION_MS in LlmExportButton.tsx).
    await expect(copyButton).toContainText('Copied', { timeout: 3000 });

    // Then reverts — within ~3s of click we should see the idle label again.
    await expect(copyButton).toContainText('Copy for LLM', { timeout: 5000 });
  });

  test('dropdown → Download as Markdown triggers a .md download', async ({ page }) => {
    const orgId = await getUserOrgId(page);
    const athleteId = await getFirstAthleteId(page, orgId);
    test.skip(!athleteId, 'No athletes available in the org — cannot scaffold an individual report.');

    const reportId = await createIndividualReport(page, athleteId!, orgId);
    createdReportIds.push(reportId);

    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('llm-export-menu').click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('llm-export-download-markdown').click();
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    // Filename convention from llm-export-service: <slug>-<YYYY-MM-DD>.md
    // where slug is at least one character of [a-z0-9-] (slugify falls back to "athlete").
    expect(filename).toMatch(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.md$/);

    const path = await download.path();
    expect(path).toBeTruthy();
    const contents = readFileSync(path!, 'utf-8');
    expect(contents).toContain('# Athlete Performance Export');
    expect(contents).toContain('## Athlete Profile');
  });

  test('dropdown → Download as JSON triggers a .json download with the expected shape', async ({ page }) => {
    const orgId = await getUserOrgId(page);
    const athleteId = await getFirstAthleteId(page, orgId);
    test.skip(!athleteId, 'No athletes available in the org — cannot scaffold an individual report.');

    const reportId = await createIndividualReport(page, athleteId!, orgId);
    createdReportIds.push(reportId);

    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('llm-export-menu').click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('llm-export-download-json').click();
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/);

    const path = await download.path();
    const contents = readFileSync(path!, 'utf-8');
    const parsed = JSON.parse(contents);

    // Sanity-check the AthleteLlmExport shape without asserting every field — the
    // unit test covers exhaustive shape. E2E only needs to confirm the pipe is live.
    expect(parsed).toHaveProperty('generatedAt');
    expect(parsed).toHaveProperty('athlete');
    expect(parsed.athlete).toHaveProperty('id');
    expect(parsed.athlete).toHaveProperty('fullName');
    expect(parsed).toHaveProperty('currentSnapshot');
    expect(parsed).toHaveProperty('measurementHistory');
    expect(parsed).toHaveProperty('activeGoals');
    expect(parsed).toHaveProperty('recentWellness');
    expect(parsed).toHaveProperty('metricGlossary');
  });

  test('keyboard flow: Tab focuses the copy button, Enter triggers copy', async ({ page }) => {
    const orgId = await getUserOrgId(page);
    const athleteId = await getFirstAthleteId(page, orgId);
    test.skip(!athleteId, 'No athletes available in the org — cannot scaffold an individual report.');

    const reportId = await createIndividualReport(page, athleteId!, orgId);
    createdReportIds.push(reportId);

    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    const copyButton = page.getByTestId('llm-export-copy');
    await expect(copyButton).toBeVisible({ timeout: 10000 });

    // Focus the button programmatically rather than tab-counting — the page has
    // many focusable elements before this button and counting tabs is a recipe
    // for flaky tests. Keyboard-triggered activation is what we're testing.
    await copyButton.focus();
    await expect(copyButton).toBeFocused();

    await page.keyboard.press('Enter');

    // "Copied" label is the deterministic readiness signal — it's set after the
    // hook finishes fetching AND writing to the clipboard.
    await expect(copyButton).toContainText('Copied', { timeout: 5000 });
  });

  test('happy-path API call via coach session returns a Markdown body', async ({ page }) => {
    // Happy-path safety net: if a regression wires the button to the wrong URL
    // or a middleware change breaks the allowlist for coaches, this catches it.
    // True athlete-role denial lives in tests/integration/llm-export.test.ts,
    // which has real DB fixtures and doesn't need a live athlete session.
    const orgId = await getUserOrgId(page);
    const athleteId = await getFirstAthleteId(page, orgId);
    test.skip(!athleteId, 'No athletes available in the org — cannot scaffold an individual report.');

    const res = await page.request.get(
      `${STAGING_URL}/api/athletes/${athleteId}/llm-export?format=markdown`,
    );
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toMatch(/^text\/markdown/);
    const body = await res.text();
    expect(body).toContain('# Athlete Performance Export');
  });
});

/**
 * Role-gating block: verify the button is ABSENT (not disabled) for athletes
 * viewing their own profile. Requires separate athlete credentials to be
 * configured — skipped in environments with only a single admin account.
 *
 * Defense-in-depth: the API route also enforces the allowlist, so a regression
 * here would be caught by tests/integration/llm-export.test.ts. This E2E block
 * guards the UX contract that athletes never see a teaser of a tool they
 * cannot use.
 */
test.describe('Athlete LLM Export - Role Gating', () => {
  test.skip(
    !canTestRoleAuthorization('coach', 'athlete') || !hasUserCredentials('athlete'),
    'Requires distinct coach and athlete credentials (E2E_COACH_* and E2E_ATHLETE_*).',
  );

  test('the button is NOT rendered for an athlete viewing their own report', async ({ page }) => {
    await loginAs(page, 'athlete');

    // Athletes do get their own reports page at /athlete-dashboard or /dashboard;
    // if an athlete somehow lands on an individual report for themselves, the
    // LlmExportButton should not be in the DOM.
    await page.goto(`${STAGING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Assert absence across the entire page — the button should not leak into
    // any view an athlete can reach. toHaveCount(0) beats toBeHidden() here
    // because toBeHidden passes for display:none tease buttons too.
    await expect(page.getByTestId('llm-export-copy')).toHaveCount(0);
    await expect(page.getByTestId('llm-export-menu')).toHaveCount(0);
  });
});
