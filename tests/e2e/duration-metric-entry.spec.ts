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
 * Time (mm:ss) metrics: a site admin creates one with the "Time (mm:ss)" toggle, a coach types 6:42.5 in the
 * event grid and uploads a recording sheet with 7:15; the database holds seconds (402.5, 435).
 *
 * Seeds its own users, organization, metric and event straight into the database (as
 * event-data-entry-grid.spec.ts does). Requires DATABASE_URL (or TESTING_DATABASE_URL) to point at the DB the
 * app under test uses; seeding only runs against a localhost app unless GRID_E2E_DB_MATCHES_APP=true:
 *   DATABASE_URL=... npx playwright test tests/e2e/duration-metric-entry.spec.ts
 */

const DB_URL = process.env.TESTING_DATABASE_URL || process.env.DATABASE_URL;
const PASSWORD = 'DurationE2E123!x';
const EVENT_ISO = '2026-03-10T10:00:00.000Z';
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const MILE = `E2EDUR_MILE_${suffix}`.toUpperCase();
const ADMIN_CREATED = `E2EDUR_ROW_${suffix}`.toUpperCase();

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
const ids: { org?: string; admin?: string; coach?: string; athlete?: string; event?: string } = {};
const adminUsername = `dur_admin_${suffix}`;
const coachUsername = `dur_coach_${suffix}`;
const ATHLETE = `Avery Dur${suffix}`;

async function mkUser(username: string, first: string, last: string, extra: Record<string, unknown> = {}) {
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
      ...extra,
    } as any)
    .returning();
  return u;
}

const savedValues = async (metric: string) =>
  (
    await db
      .select()
      .from(schema.measurements)
      .where(and(eq(schema.measurements.userId, ids.athlete!), eq(schema.measurements.metric, metric)))
  ).map((r) => Number(r.value));

test.beforeAll(async () => {
  sql = postgres(DB_URL!, { max: 2 });
  db = drizzle(sql, { schema });

  await db.insert(schema.siteMetrics).values({
    code: MILE, label: 'Dur Mile', unit: 's', category: 'endurance', metricType: 'lower_is_better',
    isActive: true, displayFormat: 'duration', decimalPrecision: 1,
  } as any);
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: `Duration E2E Org ${suffix}`, isActive: true, eventsEnabled: true } as any)
    .returning();
  const admin = await mkUser(adminUsername, 'Dur', `Admin${suffix}`, { isSiteAdmin: true });
  const coach = await mkUser(coachUsername, 'Dur', `Coach${suffix}`);
  const athlete = await mkUser(`dur_a_${suffix}`, 'Avery', `Dur${suffix}`);
  await db.insert(schema.userOrganizations).values([
    { userId: coach.id, organizationId: org.id, role: 'coach' },
    { userId: athlete.id, organizationId: org.id, role: 'athlete' },
  ] as any);
  const [event] = await db
    .insert(schema.events)
    .values({ name: `Duration E2E Event ${suffix}`, organizationId: org.id, startDate: new Date(EVENT_ISO), status: 'published', createdBy: coach.id } as any)
    .returning();
  await db.insert(schema.eventMetrics).values({ eventId: event.id, metricCode: MILE, displayOrder: 1 });
  await db.insert(schema.eventRegistrations).values({
    eventId: event.id,
    userId: athlete.id,
    userFullNameSnapshot: athlete.fullName,
    organizationIdSnapshot: org.id,
    status: 'checked_in',
    checkedInAt: new Date(),
  } as any);
  Object.assign(ids, { org: org.id, admin: admin.id, coach: coach.id, athlete: athlete.id, event: event.id });
});

test.afterAll(async () => {
  if (!sql) return;
  try {
    const userIds = [ids.admin, ids.coach, ids.athlete].filter(Boolean) as string[];
    if (userIds.length) await db.delete(schema.measurements).where(inArray(schema.measurements.userId, userIds));
    if (ids.event) {
      await db.delete(schema.eventRegistrations).where(eq(schema.eventRegistrations.eventId, ids.event));
      await db.delete(schema.events).where(eq(schema.events.id, ids.event));
    }
    if (ids.org) await db.delete(schema.userOrganizations).where(eq(schema.userOrganizations.organizationId, ids.org));
    if (userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    if (ids.org) await db.delete(schema.organizations).where(eq(schema.organizations.id, ids.org));
    await db.delete(schema.siteMetrics).where(inArray(schema.siteMetrics.code, [MILE, ADMIN_CREATED]));
  } finally {
    await sql.end();
  }
});

test('a site admin creates a time (mm:ss) metric: unit s, 1 decimal place', async ({ page }) => {
  await loginWithCredentials(page, adminUsername, PASSWORD);
  await page.goto(`${BASE_URL}/metrics`);
  await page.getByTestId('add-metric-button').click();
  await page.getByTestId('metric-code-input').fill(ADMIN_CREATED);
  await page.getByTestId('metric-label-input').fill(`Dur Row ${suffix}`);
  await page.getByTestId('metric-duration-switch').click();
  await expect(page.getByTestId('metric-unit-input')).toHaveValue('s');
  await page.getByTestId('save-metric-button').click();

  await expect
    .poll(async () => (await db.select().from(schema.siteMetrics).where(eq(schema.siteMetrics.code, ADMIN_CREATED)))[0])
    .toMatchObject({ unit: 's', displayFormat: 'duration', decimalPrecision: 1 });
});

test.describe('coach entry', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithCredentials(page, coachUsername, PASSWORD);
    await page.goto(`${BASE_URL}/events/${ids.event}/data-entry`);
    await expect(page.getByRole('heading', { name: /Data Entry:/ })).toBeVisible({ timeout: 20000 });
  });

  test('6:42.5 typed in the event grid is saved as 402.5 seconds', async ({ page }) => {
    await page.getByRole('textbox', { name: `Dur Mile for ${ATHLETE}` }).fill('6:42.5');
    await page.getByRole('button', { name: /^save( \(\d+\))?$/i }).click();
    await expect.poll(() => savedValues(MILE)).toEqual([402.5]);
  });

  test('a recording sheet with 7:15 is loaded and saved as 435 seconds', async ({ page }) => {
    const csv = [
      'Event,Duration E2E Event',
      `Event ID,${ids.event}`,
      `Athlete ID (do not edit),Athlete,Dur Mile (mm:ss) [${MILE}]`,
      `${ids.athlete},${ATHLETE},7:15`,
    ].join('\n');
    await page.getByLabel('Recording sheet file').setInputFiles({ name: 'sheet.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    // The saved 402.5 differs from the file: keep the file value
    await page.getByRole('button', { name: new RegExp(`Conflict for Dur Mile for ${ATHLETE}`) }).click();
    await page.getByRole('button', { name: 'Use file value' }).click();
    await page.getByRole('button', { name: /^save( \(\d+\))?$/i }).click();
    await expect.poll(async () => (await savedValues(MILE)).sort()).toEqual([435]);
  });
});
