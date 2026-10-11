import { test, expect } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { loginWithCredentials } from './helpers/auth';
import { BASE_URL } from './config';

/**
 * Event data entry grid: arrow-key navigation and "add trial" (+).
 *
 * Seeds its own organization, coach, two checked-in athletes, two site metrics and an event straight
 * into the database (as mqi-capture.spec.ts does). Requires DATABASE_URL (or TESTING_DATABASE_URL) to
 * point at the DB the app under test uses; seeding only runs against a localhost app unless
 * GRID_E2E_DB_MATCHES_APP=true confirms the DB is the remote app's DB:
 *   DATABASE_URL=... npx playwright test tests/e2e/event-data-entry-grid.spec.ts
 */

const DB_URL = process.env.TESTING_DATABASE_URL || process.env.DATABASE_URL;
const PASSWORD = 'GridCoach123!x';
const EVENT_ISO = '2026-03-10T10:00:00.000Z';
const EVENT_DATE = '2026-03-10';
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SPRINT = `E2EGRID_S_${suffix}`.toUpperCase();
const JUMP = `E2EGRID_J_${suffix}`.toUpperCase();

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });
const APP_IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(BASE_URL);
test.skip(!DB_URL, 'DATABASE_URL (or TESTING_DATABASE_URL) is required to seed the event');
test.skip(
  !APP_IS_LOCAL && process.env.GRID_E2E_DB_MATCHES_APP !== 'true',
  'Seeds the database directly: only against a localhost app, or set GRID_E2E_DB_MATCHES_APP=true',
);

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
const ids: { org?: string; coach?: string; first?: string; second?: string; event?: string } = {};
const coachUsername = `grid_coach_${suffix}`;
const FIRST = `Avery Grid${suffix}`;
const SECOND = `Blake Grid${suffix}`;

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
      birthDate: '2008-01-01',
      hasCompletedOnboarding: true,
      isActive: true,
    } as any)
    .returning();
  return u;
}

test.beforeAll(async () => {
  sql = postgres(DB_URL!, { max: 2 });
  db = drizzle(sql, { schema });

  await db.insert(schema.siteMetrics).values([
    { code: SPRINT, label: 'Grid Sprint', unit: 's', category: 'speed', metricType: 'lower_is_better', isActive: true },
    { code: JUMP, label: 'Grid Jump', unit: 'in', category: 'power', metricType: 'higher_is_better', isActive: true },
  ] as any);
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: `Grid E2E Org ${suffix}`, isActive: true, eventsEnabled: true } as any)
    .returning();
  const coach = await mkUser(coachUsername, 'Grid', `Coach${suffix}`);
  const first = await mkUser(`grid_a_${suffix}`, 'Avery', `Grid${suffix}`);
  const second = await mkUser(`grid_b_${suffix}`, 'Blake', `Grid${suffix}`);
  await db.insert(schema.userOrganizations).values([
    { userId: coach.id, organizationId: org.id, role: 'coach' },
    { userId: first.id, organizationId: org.id, role: 'athlete' },
    { userId: second.id, organizationId: org.id, role: 'athlete' },
  ] as any);
  const [event] = await db
    .insert(schema.events)
    .values({ name: `Grid E2E Event ${suffix}`, organizationId: org.id, startDate: new Date(EVENT_ISO), status: 'published', createdBy: coach.id } as any)
    .returning();
  await db.insert(schema.eventMetrics).values([
    { eventId: event.id, metricCode: SPRINT, displayOrder: 1 },
    { eventId: event.id, metricCode: JUMP, displayOrder: 2 },
  ]);
  await db.insert(schema.eventRegistrations).values(
    [first, second].map((u) => ({
      eventId: event.id,
      userId: u.id,
      userFullNameSnapshot: u.fullName,
      organizationIdSnapshot: org.id,
      status: 'checked_in',
      checkedInAt: new Date(),
    })) as any,
  );
  // One saved sprint for the first athlete: its cell can get a second trial
  await db.insert(schema.measurements).values({
    userId: first.id,
    submittedBy: coach.id,
    metric: SPRINT,
    value: '1.65',
    units: 's',
    date: EVENT_DATE,
    age: 18,
    isVerified: true,
    eventId: event.id,
    organizationId: org.id,
  } as any);
  Object.assign(ids, { org: org.id, coach: coach.id, first: first.id, second: second.id, event: event.id });
});

test.afterAll(async () => {
  if (!sql) return;
  try {
    const userIds = [ids.coach, ids.first, ids.second].filter(Boolean) as string[];
    if (userIds.length) await db.delete(schema.measurements).where(inArray(schema.measurements.userId, userIds));
    if (ids.event) {
      await db.delete(schema.eventRegistrations).where(eq(schema.eventRegistrations.eventId, ids.event));
      await db.delete(schema.events).where(eq(schema.events.id, ids.event));
    }
    if (ids.org) await db.delete(schema.userOrganizations).where(eq(schema.userOrganizations.organizationId, ids.org));
    if (userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    if (ids.org) await db.delete(schema.organizations).where(eq(schema.organizations.id, ids.org));
    await db.delete(schema.siteMetrics).where(inArray(schema.siteMetrics.code, [SPRINT, JUMP]));
  } finally {
    await sql.end();
  }
});

test.describe('Event data entry grid', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithCredentials(page, coachUsername, PASSWORD);
    await page.goto(`${BASE_URL}/events/${ids.event}/data-entry`);
    await expect(page.getByRole('heading', { name: /Data Entry:/ })).toBeVisible({ timeout: 20000 });
  });

  test('arrow keys and Enter move between cells; Left / Right only at the caret edges', async ({ page }) => {
    const cell = (label: string, name: string) => page.getByRole('textbox', { name: `${label} for ${name}` });
    await cell('Grid Sprint', FIRST).click();
    await page.keyboard.press('ArrowDown');
    await expect(cell('Grid Sprint', SECOND)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(cell('Grid Sprint', FIRST)).toBeFocused();

    // Caret at the end of "1.65": Right moves to the next metric
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await expect(cell('Grid Jump', FIRST)).toBeFocused();
    // Typing digits and a dot still works; Left inside the text moves the caret, not the focus
    await page.keyboard.type('30.5');
    await page.keyboard.press('ArrowLeft');
    await expect(cell('Grid Jump', FIRST)).toBeFocused();
    await expect(cell('Grid Jump', FIRST)).toHaveValue('30.5');
    await page.keyboard.press('Enter');
    await expect(cell('Grid Jump', SECOND)).toBeFocused();
    await page.keyboard.press('Enter'); // last row: no-op
    await expect(cell('Grid Jump', SECOND)).toBeFocused();
  });

  test('+ saves a changed value as a second trial without replacing the first', async ({ page }) => {
    const sprint = page.getByRole('textbox', { name: `Grid Sprint for ${FIRST}` });
    await sprint.fill('1.60');
    await page.getByRole('button', { name: `Save 1.60 as a new Grid Sprint trial for ${FIRST}` }).click();
    await expect(page.getByText('2 saved trials')).toBeVisible({ timeout: 15000 });
    // The newest trial is shown (the DB may format it as 1.6 or 1.600)
    await expect.poll(async () => Number(await sprint.inputValue())).toBe(1.6);
    await expect(sprint).toBeFocused();

    const rows = await db
      .select()
      .from(schema.measurements)
      .where(and(eq(schema.measurements.userId, ids.first!), eq(schema.measurements.metric, SPRINT)));
    expect(rows.map((r) => Number(r.value)).sort()).toEqual([1.6, 1.65]);
  });
});
