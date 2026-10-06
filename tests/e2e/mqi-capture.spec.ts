import { test, expect, type Page } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { MQI_PATTERNS, MQI_TRANSITIONS } from '@shared/mqi-entry-schema';
import { loginWithCredentials } from './helpers/auth';
import { BASE_URL } from './config';

/**
 * AM-FEAT-015: Movement Quality (MQI) capture on event data entry.
 *
 * A coach scores 8 movement patterns for an athlete on an existing event, sees the
 * MQI total, edits one score (total updates), attaches a clip link. A coach from
 * another organization is denied.
 *
 * Test data is seeded straight into the database (like global-setup.ts) because event
 * registration/check-in cannot be performed by an admin through the API alone. Requires
 * DATABASE_URL (or TESTING_DATABASE_URL) to point at the DB the app under test uses,
 * and migrations 0146+0148 applied. Seeding only runs against a local app (BASE_URL on
 * localhost) unless MQI_E2E_DB_MATCHES_APP=true confirms the DB is the remote app's DB:
 *   DATABASE_URL=... npx playwright test tests/e2e/mqi-capture.spec.ts
 */

const DB_URL = process.env.TESTING_DATABASE_URL || process.env.DATABASE_URL;
const PASSWORD = 'MqiCoach123!x';
const CLIP = 'https://clips.example.com/mqi/jump-01';
const EVENT_ISO = '2026-03-10T10:00:00.000Z';
const EVENT_DATE = '2026-03-10';
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });
const APP_IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(BASE_URL);
test.skip(!DB_URL, 'DATABASE_URL (or TESTING_DATABASE_URL) is required to seed the MQI event');
test.skip(
  !APP_IS_LOCAL && process.env.MQI_E2E_DB_MATCHES_APP !== 'true',
  'Seeds the database directly: only against a localhost app, or set MQI_E2E_DB_MATCHES_APP=true',
);

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
const ids: { orgA?: string; orgB?: string; coachA?: string; coachB?: string; athlete?: string; event?: string } = {};
const usernames = { coachA: `mqi_coachA_${suffix}`, coachB: `mqi_coachB_${suffix}` };
const ATHLETE_NAME = `Mqi Athlete${suffix}`;

async function mkUser(username: string, first: string, last: string) {
  const [u] = await db
    .insert(schema.users)
    .values({
      username,
      password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`,
      emails: [`${username}@test.local`],
      hasCompletedOnboarding: true,
      isActive: true,
    } as any)
    .returning();
  return u;
}

test.beforeAll(async () => {
  sql = postgres(DB_URL!, { max: 2 });
  db = drizzle(sql, { schema });

  const [orgA] = await db
    .insert(schema.organizations)
    .values({ name: `MQI E2E Org A ${suffix}`, isActive: true, eventsEnabled: true } as any)
    .returning();
  const [orgB] = await db
    .insert(schema.organizations)
    .values({ name: `MQI E2E Org B ${suffix}`, isActive: true, eventsEnabled: true } as any)
    .returning();
  const coachA = await mkUser(usernames.coachA, 'Mqi', `CoachA${suffix}`);
  const coachB = await mkUser(usernames.coachB, 'Mqi', `CoachB${suffix}`);
  const athlete = await mkUser(`mqi_athlete_${suffix}`, 'Mqi', `Athlete${suffix}`);
  await db.insert(schema.userOrganizations).values([
    { userId: coachA.id, organizationId: orgA.id, role: 'coach' },
    { userId: coachB.id, organizationId: orgB.id, role: 'coach' },
    { userId: athlete.id, organizationId: orgA.id, role: 'athlete' },
  ] as any);

  const [event] = await db
    .insert(schema.events)
    .values({
      name: `MQI E2E Event ${suffix}`,
      organizationId: orgA.id,
      startDate: new Date(EVENT_ISO),
      status: 'published',
      createdBy: coachA.id,
    } as any)
    .returning();
  const metricCodes = [...MQI_PATTERNS, ...MQI_TRANSITIONS].map((m) => m.code);
  await db.insert(schema.eventMetrics).values(
    metricCodes.map((metricCode, i) => ({ eventId: event.id, metricCode, displayOrder: i })),
  );
  await db.insert(schema.eventRegistrations).values({
    eventId: event.id,
    userId: athlete.id,
    userFullNameSnapshot: athlete.fullName,
    organizationIdSnapshot: orgA.id,
    status: 'checked_in',
    checkedInAt: new Date(),
  } as any);

  Object.assign(ids, {
    orgA: orgA.id,
    orgB: orgB.id,
    coachA: coachA.id,
    coachB: coachB.id,
    athlete: athlete.id,
    event: event.id,
  });
});

test.afterAll(async () => {
  if (!sql) return;
  try {
    const userIds = [ids.coachA, ids.coachB, ids.athlete].filter(Boolean) as string[];
    if (userIds.length) {
      await db.delete(schema.measurements).where(inArray(schema.measurements.userId, userIds));
      await db.delete(schema.eventRegistrations).where(eq(schema.eventRegistrations.eventId, ids.event!));
    }
    if (ids.event) await db.delete(schema.events).where(eq(schema.events.id, ids.event));
    const orgIds = [ids.orgA, ids.orgB].filter(Boolean) as string[];
    if (orgIds.length) {
      await db.delete(schema.userOrganizations).where(inArray(schema.userOrganizations.organizationId, orgIds));
    }
    if (userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    if (orgIds.length) await db.delete(schema.organizations).where(inArray(schema.organizations.id, orgIds));
  } finally {
    await sql.end();
  }
});

const mqiTotalRows = () =>
  db
    .select()
    .from(schema.measurements)
    .where(and(eq(schema.measurements.userId, ids.athlete!), eq(schema.measurements.metric, 'MQI_TOTAL')));

async function openPanel(page: Page) {
  await page.goto(`${BASE_URL}/events/${ids.event}/data-entry`);
  await expect(page.getByRole('heading', { name: /Data Entry:/ })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: new RegExp(`Movement Quality for .*${ATHLETE_NAME}`) }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

const pick = (page: Page, label: string, score: number) =>
  page
    .getByRole('group', { name: `${label} score (0 to 3)` })
    .getByRole('radio', { name: new RegExp(`^${score}\\b`) })
    .click();

test.describe('MQI capture on event data entry', () => {
  test('coach scores 8 patterns, sees the total, edits one, and attaches a clip link', async ({ page }) => {
    await loginWithCredentials(page, usernames.coachA, PASSWORD);
    await openPanel(page);

    // Preview is "incomplete" until all 8 are scored
    await expect(page.getByTestId('mqi-total')).toContainText(/incomplete/i);
    for (const [i, p] of MQI_PATTERNS.entries()) {
      await pick(page, p.label, i % 4); // 0,1,2,3,0,1,2,3 = 12 (includes 0)
    }
    await expect(page.getByTestId('mqi-total')).toContainText('12');
    await expect(page.getByTestId('mqi-total')).toContainText('/ 24');

    await page.getByRole('button', { name: /save scores/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 });

    // Server derived total on the event date
    await expect
      .poll(async () => {
        const rows = await mqiTotalRows();
        return rows.length === 1 ? `${Number(rows[0].value)}|${rows[0].date}|${rows[0].units}` : 'none';
      })
      .toBe(`12|${EVENT_DATE}|score`);
    await expect(page.getByRole('button', { name: /Movement Quality for/ })).toContainText('12 / 24');

    // Edit one score (Linear Acceleration 0 -> 3): total 15
    await openPanel(page);
    await pick(page, 'Linear Acceleration', 3);
    await expect(page.getByTestId('mqi-total')).toContainText('15');
    await page.getByRole('button', { name: /save scores/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 });
    await expect
      .poll(async () => {
        const rows = await mqiTotalRows();
        return rows.length === 1 ? Number(rows[0].value) : -1;
      })
      .toBe(15);

    // No duplicate score rows were created by the edit
    const accel = await db
      .select()
      .from(schema.measurements)
      .where(and(eq(schema.measurements.userId, ids.athlete!), eq(schema.measurements.metric, 'MQ_LIN_ACCEL')));
    expect(accel).toHaveLength(1);

    // Attach a clip link + note to Jump, then confirm it persists after reopening
    await openPanel(page);
    await page.getByLabel('Jump clip link').fill(CLIP);
    await page.getByLabel('Jump notes').fill('late left hip');
    await page.getByRole('button', { name: /save scores/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 });
    await openPanel(page);
    await expect(page.getByLabel('Jump clip link')).toHaveValue(CLIP);
    await expect(page.getByLabel('Jump notes')).toHaveValue('late left hip');
  });

  test('rejects a non-https clip link in the panel', async ({ page }) => {
    await loginWithCredentials(page, usernames.coachA, PASSWORD);
    await openPanel(page);
    // Self-contained: score the row here rather than relying on the previous test's data
    await pick(page, 'Jump', 2);
    await page.getByLabel('Jump clip link').fill('http://clips.example.com/insecure');
    await page.getByRole('button', { name: /save scores/i }).click();
    await expect(page.getByText(/public HTTPS URL/i)).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('clearing a saved score removes it and the total', async ({ page }) => {
    await loginWithCredentials(page, usernames.coachA, PASSWORD);
    await openPanel(page);
    // Make sure all 8 patterns are saved so a total exists (clicking a selected score
    // toggles it off, so only click scores that are not already selected)
    for (const p of MQI_PATTERNS) {
      const radio = page
        .getByRole('group', { name: `${p.label} score (0 to 3)` })
        .getByRole('radio', { name: /^2\b/ });
      if ((await radio.getAttribute('aria-checked')) !== 'true') await radio.click();
    }
    await page.getByRole('button', { name: /save scores/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 });
    await expect.poll(async () => (await mqiTotalRows()).length).toBe(1);

    await openPanel(page);
    await page.getByRole('button', { name: 'Clear Jump' }).click();
    await expect(page.getByTestId('mqi-total')).toContainText(/incomplete/i);
    await page.getByRole('button', { name: /save scores/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 });

    const jumpRows = () =>
      db
        .select()
        .from(schema.measurements)
        .where(and(eq(schema.measurements.userId, ids.athlete!), eq(schema.measurements.metric, 'MQ_JUMP')));
    await expect.poll(async () => (await jumpRows()).length).toBe(0);
    await expect.poll(async () => (await mqiTotalRows()).length).toBe(0);
    await expect(page.getByRole('button', { name: /Movement Quality for/ })).toContainText('7 of 8 scored');
  });

  test("a coach from another organization is denied", async ({ page }) => {
    await loginWithCredentials(page, usernames.coachB, PASSWORD);
    const res = await page.request.post(`${BASE_URL}/api/events/${ids.event}/measurements`, {
      data: { userId: ids.athlete, metric: 'MQ_JUMP', value: 1, date: EVENT_ISO },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/access denied/i);

    await page.goto(`${BASE_URL}/events/${ids.event}/data-entry`);
    // Wait for a positive "denied" state before asserting that nothing is offered
    await expect(page.getByRole('heading', { name: 'Event Not Found' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /Movement Quality for/ })).toHaveCount(0);
  });
});
