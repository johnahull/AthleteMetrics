import { test, expect, Page } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * ATHLETE COACHING NOTES E2E Tests (AM-FEAT-025)
 *
 * - A coach / admin adds, edits and deletes notes on the athlete profile (including a note dated in the past,
 *   and a pinned note that stays on top)
 * - Quick-add from the dashboard: pick the organization, then the athlete, then write the note
 *
 * Each test creates its own athlete through the API (in an existing organization: see getOrganization), so it works
 * against any environment where the default user is a site admin.
 *
 * That the athlete never sees notes is covered by tests/integration/athlete-notes.test.ts (404 for the athlete) and
 * CoachingNotesCard.test.tsx (nothing renders unless the server answers 200): an athlete created through the API is
 * inactive until invited, so a real athlete session cannot be started here.
 */

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

// Organization creation is rate limited (5 per 15 minutes) and the budget is shared by the whole E2E suite, so reuse
// an existing organization and create one only when there is none.
async function getOrganization(page: Page): Promise<{ id: string; name: string }> {
  const listResponse = await page.request.get(`${BASE_URL}/api/organizations`);
  expect(listResponse.ok()).toBeTruthy();
  const existing = (await listResponse.json()) as Array<{ id: string; name: string; isActive?: boolean }>;
  const usable = existing.find((o) => o.isActive !== false);
  if (usable) return usable;

  const orgResponse = await page.request.post(`${BASE_URL}/api/organizations`, {
    data: { name: `NotesOrg_${Date.now().toString(36)}` },
  });
  expect(orgResponse.ok()).toBeTruthy();
  return orgResponse.json();
}

async function createOrgAndAthlete(page: Page) {
  const org = await getOrganization(page);
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const athleteResponse = await page.request.post(`${BASE_URL}/api/athletes`, {
    data: {
      firstName: 'Noted',
      lastName: `Athlete${tag}`,
      birthYear: 2008,
      sports: ['Football'],
      status: 'active',
      organizationId: org.id,
    },
  });
  expect(athleteResponse.ok()).toBeTruthy();
  const athlete = await athleteResponse.json();
  return { org, athlete };
}

const card = (page: Page) => page.getByTestId('coaching-notes-card');
const dialog = (page: Page) => page.getByTestId('coaching-note-dialog');

async function addNote(page: Page, body: string, opts: { date?: string; flagged?: boolean } = {}) {
  await page.getByTestId('add-note-button').click();
  await expect(dialog(page)).toBeVisible();
  if (opts.date) await dialog(page).getByLabel('Observed on').fill(opts.date);
  await dialog(page).getByLabel('Note').fill(body);
  if (opts.flagged) await dialog(page).getByLabel(/pin to the top/i).click();
  await dialog(page).getByTestId('save-note').click();
  await expect(dialog(page)).toBeHidden();
}

test.describe('Athlete coaching notes', () => {
  test('add, order, edit and delete notes on the athlete profile', async ({ page }) => {
    await loginAsDefaultUser(page);
    const { athlete } = await createOrgAndAthlete(page);

    await page.goto(`${BASE_URL}/athletes/${athlete.id}`);
    await expect(card(page)).toBeVisible();
    await expect(page.getByTestId('no-notes')).toBeVisible();

    // A note about last session, one dated in the past, and a pinned one
    await addNote(page, 'Late hip drop on the 5-0-5');
    await addNote(page, 'Strong first step in October testing', { date: '2025-10-15' });
    await addNote(page, 'No max velocity sprinting until PT clears', { date: '2025-09-01', flagged: true });

    const notes = card(page).getByTestId('coaching-note');
    await expect(notes).toHaveCount(3);
    // Pinned first, then newest observation date
    await expect(notes.nth(0)).toContainText('No max velocity sprinting');
    await expect(notes.nth(0).getByTestId('note-flagged')).toBeVisible();
    await expect(notes.nth(1)).toContainText('Late hip drop');
    await expect(notes.nth(2)).toContainText('Oct 15, 2025');

    // Edit the second note
    await notes.nth(1).getByRole('button', { name: 'Edit note' }).click();
    await expect(dialog(page).getByLabel('Note')).toHaveValue('Late hip drop on the 5-0-5');
    await dialog(page).getByLabel('Note').fill('Hips now stay low on the 5-0-5');
    await dialog(page).getByTestId('save-note').click();
    await expect(dialog(page)).toBeHidden();
    await expect(card(page)).toContainText('Hips now stay low on the 5-0-5');
    await expect(card(page)).not.toContainText('Late hip drop');

    // Delete asks for confirmation, then removes the note
    await notes.nth(1).getByRole('button', { name: 'Delete note' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(notes).toHaveCount(2);
    await expect(card(page)).not.toContainText('Hips now stay low');

    // Reload: the notes are stored, not just on screen
    await page.reload();
    await expect(card(page).getByTestId('coaching-note')).toHaveCount(2);
  });

  test('with more than 3 notes the card starts collapsed and shows only pinned notes', async ({ page }) => {
    await loginAsDefaultUser(page);
    const { athlete } = await createOrgAndAthlete(page);

    await page.goto(`${BASE_URL}/athletes/${athlete.id}`);
    await addNote(page, 'Pinned: no max velocity sprinting', { date: '2025-09-01', flagged: true });
    await addNote(page, 'Second note', { date: '2025-10-01' });
    await addNote(page, 'Third note', { date: '2025-10-02' });
    // The fourth note crosses the threshold; adding it keeps the card open so the new note is visible
    await addNote(page, 'Fourth note', { date: '2025-10-03' });
    await expect(card(page)).toContainText('Fourth note');

    await page.reload();
    const toggle = card(page).getByTestId('coaching-notes-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(card(page).getByTestId('coaching-notes-summary')).toContainText('4 notes · 1 pinned');
    await expect(card(page).getByTestId('coaching-note')).toHaveCount(1);
    await expect(card(page)).toContainText('Pinned: no max velocity sprinting');

    await toggle.click();
    await expect(card(page).getByTestId('coaching-note')).toHaveCount(4);
  });

  test('quick-add from the dashboard: organization, athlete, then the note', async ({ page }) => {
    await loginAsDefaultUser(page);
    const { org, athlete } = await createOrgAndAthlete(page);

    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByTestId('dashboard-add-note').click();
    await expect(dialog(page)).toBeVisible();

    // With a single organization there is nothing to pick: the dialog chooses it
    const orgCount = ((await (await page.request.get(`${BASE_URL}/api/organizations`)).json()) as unknown[]).length;
    if (orgCount > 1) {
      await dialog(page).getByTestId('note-org-select').click();
      await page.getByRole('option', { name: org.name, exact: true }).click();
    } else {
      await expect(dialog(page).getByTestId('note-org-select')).toHaveCount(0);
    }

    await dialog(page).getByTestId('note-athlete-selector').click();
    await dialog(page).getByTestId('note-athlete-selector-search-input').fill(athlete.lastName);
    await dialog(page).getByTestId('note-athlete-selector-dropdown').getByText(athlete.lastName).first().click();

    await dialog(page).getByLabel('Note').fill('Added from the dashboard during practice');
    await dialog(page).getByTestId('save-note').click();
    await expect(dialog(page)).toBeHidden();

    await page.goto(`${BASE_URL}/athletes/${athlete.id}`);
    await expect(card(page)).toContainText('Added from the dashboard during practice');
  });
});
