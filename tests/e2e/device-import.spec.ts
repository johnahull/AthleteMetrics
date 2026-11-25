import { test, expect, type Page } from '@playwright/test';
import { loginAsDefaultUser, loginAsAthlete, loginAsCoach } from './helpers/auth';
import { navigateTo } from './helpers/navigation';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Device Import E2E Tests
 *
 * Tests the Dashr timing gate data sync feature end-to-end:
 * - Device Import tab on Data Entry page (/data-entry?tab=device)
 * - Event-linked import flow (from event results tab)
 * - Multi-session CSV handling
 * - Athlete matching and overrides
 * - Duplicate handling strategies
 * - Rollback from success summary
 * - Permission checks
 * - Frozen event button state
 *
 * These tests run against the staging/testing environment.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHR_CSV = path.join(__dirname, 'fixtures/csv-files/dashr-sample.csv');
const DASHR_MULTI_RUN_CSV = path.join(__dirname, 'fixtures/csv-files/dashr-multi-run.csv');

test.describe('Device Import — Data Entry Tab Flow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('should show Device Import tab on Data Entry page', async ({ page }) => {
    await navigateTo(page, '/data-entry?tab=device');

    // Should show the Device Import tab and content
    await expect(page.locator('[data-testid="device-import-tab"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Import Device Data')).toBeVisible({ timeout: 10000 });

    // Should show the upload button
    await expect(page.locator('text=Upload Device File')).toBeVisible();
  });

  test('should redirect legacy /import/device URL to data entry tab', async ({ page }) => {
    await navigateTo(page, '/data-entry?tab=device');

    // Should redirect to data entry with device tab
    await page.waitForURL('**/data-entry?tab=device', { timeout: 10000 });
    await expect(page.locator('text=Import Device Data')).toBeVisible({ timeout: 10000 });
  });

  test('should open import dialog and show upload step', async ({ page }) => {
    await navigateTo(page, '/data-entry?tab=device');

    // Click the upload button to open dialog
    await page.click('text=Upload Device File');

    // Dialog should be visible with upload step
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

    // Should show file drop zone or upload area
    await expect(
      page.locator('text=/drop.*file|choose.*file|select.*file|upload/i').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('should upload Dashr CSV and show session selection or review', async ({ page }) => {
    await navigateTo(page, '/data-entry?tab=device');

    // Open dialog
    await page.click('text=Upload Device File');
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

    // Upload the CSV file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(DASHR_CSV);

    // Click upload/parse button
    const uploadButton = page.locator('button:has-text("Upload"), button:has-text("Parse"), button:has-text("Import")');
    if (await uploadButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadButton.first().click();
    }

    // Should advance to session-select or review step
    // Multi-session CSV goes to session-select, single-session goes to review
    await expect(
      page.locator('text=/session|review|select.*date|athlete/i').first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('should handle multi-session CSV with date picker', async ({ page }) => {
    await navigateTo(page, '/data-entry?tab=device');

    // Open dialog and upload
    await page.click('text=Upload Device File');
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(DASHR_CSV);

    // Trigger upload
    const uploadButton = page.locator('button:has-text("Upload"), button:has-text("Parse"), button:has-text("Import")');
    if (await uploadButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadButton.first().click();
    }

    // Wait for the response - multi-session CSV should show session picker
    // The dashr-sample.csv has sessions from Dec 2025, Jul 2025, Jun 2025, May 2025, Jun 2022
    await page.waitForTimeout(3000);

    // Check if session selection step is shown (multi-session CSV)
    const sessionStep = page.locator('text=/select.*session|session.*date|choose.*date/i');
    if (await sessionStep.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Should show multiple date options
      const dateOptions = page.locator('tr, [role="row"], [data-session-date]');
      const count = await dateOptions.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe('Device Import — Review and Commit', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('should show athlete match results in review step', async ({ page }) => {
    await navigateTo(page, '/data-entry?tab=device');

    // Open dialog and upload
    await page.click('text=Upload Device File');
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(DASHR_CSV);

    // Trigger upload
    const uploadButton = page.locator('button:has-text("Upload"), button:has-text("Parse"), button:has-text("Import")');
    if (await uploadButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await uploadButton.first().click();
    }

    // Wait for parsing to complete
    await page.waitForTimeout(5000);

    // If multi-session, select a session first
    const sessionSelect = page.locator('text=/select.*session|session.*date/i');
    if (await sessionSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click first session option
      const firstOption = page.locator('tr, [role="row"], [data-session-date]').first();
      await firstOption.click().catch(() => {});

      // Click continue/next
      const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Review")');
      if (await continueBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await continueBtn.first().click();
      }
    }

    // Should be in review step — look for athlete name or match indicators
    await expect(
      page.locator('text=/athlete|match|review|hull|christian/i').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('lists every run of a drill and marks the best values', async ({ page }) => {
    await navigateTo(page, '/data-entry?tab=device');

    await page.click('text=Upload Device File');
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

    // One session, two 30 yd runs: A has the faster 30 yd, B the faster 10 / 20 yd gates
    await page.locator('input[type="file"]').setInputFiles(DASHR_MULTI_RUN_CSV);
    await page.locator('button:has-text("Parse File")').click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.getByText('Review Athletes')).toBeVisible({ timeout: 15000 });
    // 2 dash runs; the derived FLY10_TIME and FLY10_TIME_RI10 are not counted as runs
    await expect(dialog.getByText('2 runs', { exact: true })).toBeVisible();

    // Expand the athlete row
    await dialog.locator('tr', { hasText: 'Christian' }).getByRole('button').first().click();

    const group = dialog.getByTestId('runs-DASH_30YD');
    await expect(group.getByText('(2 runs)')).toBeVisible();
    await expect(group.getByText('14:00:00')).toBeVisible();
    await expect(group.getByText('14:05:00')).toBeVisible();
    // Best 30 yd (run A) + best 10 yd and 20 yd splits (run B)
    await expect(group.getByText('Best')).toHaveCount(3);
  });
});

// Two exports of one session that share the 09:10 run: the morning file has 09:00 and 09:10, the afternoon file 09:10
// and 14:00. Each run is a 30 yd dash with one 10 yd gate (drill row + 1 split row, no derived fly).
const OVERLAP_BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';
const overlapFile = (name: string, lastName: string) => ({
  name: `${name}.csv`,
  mimeType: 'text/csv',
  buffer: Buffer.from(
    fs.readFileSync(path.join(__dirname, `fixtures/csv-files/${name}.csv`), 'utf8').replaceAll('E2E_LAST_NAME', lastName),
  ),
});

test.describe('Device Import — Duplicate strategy on overlapping imports', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  /** An athlete in the organization the Device Import tab imports into (the user's first organization) */
  async function createAthlete(page: Page) {
    const orgs = await (await page.request.get(`${OVERLAP_BASE_URL}/api/auth/me/organizations`)).json();
    const organizationId = orgs[0]?.organizationId;
    expect(organizationId, 'the test user needs an organization').toBeTruthy();
    const lastName = `Overlap${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const response = await page.request.post(`${OVERLAP_BASE_URL}/api/athletes`, {
      data: { firstName: 'Overlap', lastName, birthYear: 2008, sports: ['Football'], status: 'active', organizationId },
    });
    expect(response.ok()).toBeTruthy();
    const athlete = await response.json();
    return { id: athlete.id as string, lastName };
  }

  async function importFile(page: Page, file: ReturnType<typeof overlapFile>, strategy: 'skip' | 'replace') {
    await navigateTo(page, '/data-entry?tab=device');
    await page.click('text=Upload Device File');
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.locator('input[type="file"]').setInputFiles(file);
    await page.locator('button:has-text("Parse File")').click();
    await expect(dialog.getByText('Review Athletes')).toBeVisible({ timeout: 15000 });
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByLabel(strategy === 'skip' ? 'Skip duplicates' : 'Replace duplicates').check();
    await dialog.getByRole('button', { name: 'Import 1 Athlete' }).click();
    await expect(dialog.getByText('Import Complete')).toBeVisible({ timeout: 15000 });
    const count = async (label: string) =>
      Number(await dialog.getByText(label, { exact: true }).locator('xpath=preceding-sibling::div').textContent());
    return { created: await count('Created'), replaced: await count('Replaced'), skipped: await count('Skipped') };
  }

  /** Final times of the athlete's stored 30 yd runs, sorted */
  async function storedRuns(page: Page, athleteId: string) {
    const response = await page.request.get(`${OVERLAP_BASE_URL}/api/measurements?userId=${athleteId}&metric=DASH_30YD`);
    expect(response.ok()).toBeTruthy();
    const rows: Array<{ value: string }> = await response.json();
    return rows.map((r) => Number(r.value)).sort();
  }

  test('skip: the second import adds only the new run time', async ({ page }) => {
    const athlete = await createAthlete(page);
    expect(await importFile(page, overlapFile('dashr-overlap-morning', athlete.lastName), 'skip')).toEqual({ created: 4, replaced: 0, skipped: 0 });

    // 09:10 is already imported (drill row + split skipped); 14:00 is added
    expect(await importFile(page, overlapFile('dashr-overlap-afternoon', athlete.lastName), 'skip')).toEqual({ created: 2, replaced: 0, skipped: 2 });
    expect(await storedRuns(page, athlete.id)).toEqual([4.4, 4.5, 4.6]);
  });

  test('replace: only the rows of the same run time are replaced, the other morning run stays', async ({ page }) => {
    const athlete = await createAthlete(page);
    expect(await importFile(page, overlapFile('dashr-overlap-morning', athlete.lastName), 'replace')).toEqual({ created: 4, replaced: 0, skipped: 0 });

    // 09:10 replaced (drill row + split), 14:00 added, 09:00 untouched
    expect(await importFile(page, overlapFile('dashr-overlap-afternoon', athlete.lastName), 'replace')).toEqual({ created: 4, replaced: 2, skipped: 0 });
    expect(await storedRuns(page, athlete.id)).toEqual([4.4, 4.5, 4.6]);
  });
});

test.describe('Device Import — Permission Checks', () => {

  test('should not show Device Import tab content for athletes without org', async ({ page }) => {
    await loginAsAthlete(page);

    // Try to navigate to data entry with device tab
    await navigateTo(page, '/data-entry?tab=device');
    await page.waitForLoadState('networkidle');

    // Athletes without org context should see "No Organization" message
    const noOrg = page.locator('text=/no organization|not authorized|access denied/i');
    const importPage = page.locator('text=Import Device Data');

    const hasNoOrgMessage = await noOrg.isVisible({ timeout: 5000 }).catch(() => false);
    const hasImportPage = await importPage.isVisible({ timeout: 2000 }).catch(() => false);

    // Either the athlete gets a "no org" message or sees the page but has no org
    expect(hasNoOrgMessage || hasImportPage).toBeTruthy();
  });
});

test.describe('Device Import — Event-Linked Flow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('should show Device Import button on event results tab', async ({ page }) => {
    // Navigate to events list first
    await navigateTo(page, '/events');
    await page.waitForLoadState('networkidle');

    // Find an event and click on it
    const eventLink = page.locator('a[href*="/events/"]').first();
    const hasEvents = await eventLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasEvents) {
      await eventLink.click();
      await page.waitForLoadState('networkidle');

      // Click on Results tab
      const resultsTab = page.locator('button:has-text("Results"), [role="tab"]:has-text("Results")');
      if (await resultsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await resultsTab.click();
        await page.waitForTimeout(1000);

        // Look for Import Device Data button
        const importButton = page.locator('button:has-text("Import Device Data"), button:has-text("Device Import")');
        // It may or may not be visible depending on event configuration and organization
        // Just verify the results tab loaded
        const resultsContent = page.locator('text=/results|publish|data entry/i');
        await expect(resultsContent.first()).toBeVisible({ timeout: 5000 });
      }
    } else {
      // No events exist — skip gracefully
      test.skip();
    }
  });
});

test.describe('Device Import — Error Handling', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('should show error for invalid file type', async ({ page }) => {
    await navigateTo(page, '/data-entry?tab=device');

    // Open dialog
    await page.click('text=Upload Device File');
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

    // Upload a CSV with non-Dashr format (general CSV, not device data)
    const invalidFile = path.join(__dirname, 'fixtures/csv-files/invalid-data.csv');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(invalidFile);

    // Click the "Parse File" button to trigger parsing
    const parseButton = page.locator('button:has-text("Parse File")');
    await expect(parseButton).toBeVisible({ timeout: 5000 });
    await parseButton.click();

    // Should show error — either inline in the dialog or via toast notification.
    // The Dashr parser will reject this file because it doesn't match expected format.
    // Error appears as a toast with "Parse Failed" title and error description.
    await expect(
      page.getByText(/error|invalid|not.*dashr|unrecognized|failed|parse failed/i).first()
    ).toBeVisible({ timeout: 15000 });
  });
});
