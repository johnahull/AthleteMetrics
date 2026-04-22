/**
 * Seed a local dev-only athlete for UI screenshot verification.
 *
 * Idempotent: re-running updates the password and refreshes measurements
 * instead of creating duplicates. Intended for local dev only — prints
 * the credentials so the dev can log in via the browser.
 *
 * Usage:
 *   npx dotenv -e .env.local -- tsx scripts/seed-screenshot-athlete.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import {
  users,
  organizations,
  userOrganizations,
  measurements,
} from '../packages/shared/schema';
import { BCRYPT_SALT_ROUNDS } from '../packages/shared/constants';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL env var required');
  process.exit(1);
}

const USERNAME = 'screenshot_athlete';
const PASSWORD = 'ScreenshotPass123!';
const EMAIL = 'screenshot.athlete@test.local';
const ORG_NAME = 'Screenshot Seed Org';

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function upsertOrg(): Promise<string> {
  const existing = await db.select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, ORG_NAME))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const [row] = await db.insert(organizations).values({
    name: ORG_NAME,
    description: 'Local dev-only org for screenshot verification',
    orgType: 'club',
    isActive: true,
  }).returning({ id: organizations.id });
  return row.id;
}

async function upsertUser(): Promise<string> {
  const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);

  const existing = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.username, USERNAME))
    .limit(1);

  if (existing.length > 0) {
    await db.update(users)
      .set({ password: hashed, isActive: true })
      .where(eq(users.id, existing[0].id));
    return existing[0].id;
  }

  const [row] = await db.insert(users).values({
    username: USERNAME,
    emails: [EMAIL],
    password: hashed,
    firstName: 'Screenshot',
    lastName: 'Athlete',
    fullName: 'Screenshot Athlete',
    birthYear: 2008,
    sports: ['Soccer'],
    positions: ['F'],
    gender: 'Male',
    isSiteAdmin: false,
    isActive: true,
    isEmailVerified: true,
    coppaStatus: 'not_applicable',
    isMinor: false,
    hasCompletedOnboarding: true,
  }).returning({ id: users.id });

  return row.id;
}

async function linkUserToOrg(userId: string, orgId: string): Promise<void> {
  const existing = await db.select({ id: userOrganizations.id })
    .from(userOrganizations)
    .where(and(
      eq(userOrganizations.userId, userId),
      eq(userOrganizations.organizationId, orgId),
    ))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(userOrganizations).values({
    userId,
    organizationId: orgId,
    role: 'athlete',
  });
}

async function wipeMeasurements(userId: string): Promise<void> {
  await db.delete(measurements).where(eq(measurements.userId, userId));
}

interface Sample { metric: string; units: string; values: number[] }

const SAMPLES: Sample[] = [
  { metric: 'FLY10_TIME', units: 's', values: [1.42, 1.39, 1.37, 1.35, 1.33] },
  { metric: 'VERTICAL_JUMP', units: 'in', values: [24.5, 25.0, 25.5, 26.0, 26.5] },
  { metric: 'AGILITY_505', units: 's', values: [2.55, 2.52, 2.50, 2.48, 2.46] },
  { metric: 'DASH_40YD', units: 's', values: [5.10, 5.05, 4.98, 4.92, 4.88] },
];

async function insertMeasurements(userId: string, orgId: string): Promise<number> {
  const today = new Date();
  const rows: typeof measurements.$inferInsert[] = [];

  for (const sample of SAMPLES) {
    sample.values.forEach((v, idx) => {
      const daysAgo = (sample.values.length - 1 - idx) * 7;
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      const dateStr = d.toISOString().slice(0, 10);
      rows.push({
        userId,
        submittedBy: userId,
        verifiedBy: userId,
        isVerified: true,
        date: dateStr,
        age: 17,
        metric: sample.metric,
        value: v.toString(),
        units: sample.units,
        organizationId: orgId,
        teamContextAuto: false,
      });
    });
  }

  if (rows.length > 0) {
    await db.insert(measurements).values(rows);
  }
  return rows.length;
}

async function main(): Promise<void> {
  console.log('Seeding screenshot athlete...');
  const orgId = await upsertOrg();
  console.log(`  org id: ${orgId}`);
  const userId = await upsertUser();
  console.log(`  user id: ${userId}`);
  await linkUserToOrg(userId, orgId);
  await wipeMeasurements(userId);
  const count = await insertMeasurements(userId, orgId);
  console.log(`  measurements inserted: ${count}`);
  console.log('\nCredentials:');
  console.log(`  username: ${USERNAME}`);
  console.log(`  password: ${PASSWORD}`);
  await client.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  client.end();
  process.exit(1);
});
