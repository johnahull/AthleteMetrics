/**
 * AM-FEAT-019 P4: under-13 guard on share-to-athlete.
 *
 * POST /api/reports/:id/share           -> 403 UNDER_13_SHARE_BLOCKED for under-13 or unknown DOB
 * POST /api/reports/:id/share-bulk      -> skips those athletes, reports blockedUnder13
 * POST /api/reports/bulk-distribute     -> same
 * POST /api/reports/:id/snapshots       -> parent share link is NOT share-to-athlete and stays allowed
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, reports, reportShares, reportSnapshots } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { emailService } from '../../packages/api/services/email-service';
import { getPushNotificationService } from '../../packages/api/services/push-notification-service';

const PREFIX = 'shareu13';

function dobYearsAgo(years: number, extraDays = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + extraDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let app: Express;
let testOrg: any;
let testCoach: any;
let cookie: string;
let createdReportIds: string[] = [];
let createdUserIds: string[] = [];
let emailSpy: ReturnType<typeof vi.spyOn>;
let pushSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

beforeEach(async () => {
  emailSpy = vi.spyOn(emailService, 'sendReportSharedNotification').mockResolvedValue(true as any);
  pushSpy = vi.spyOn(getPushNotificationService(db), 'sendToUser').mockResolvedValue({ successful: 1 } as any);

  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  [testOrg] = await db.insert(organizations).values({
    name: `${PREFIX}-org-${stamp}`,
    isActive: true,
  }).returning();

  [testCoach] = await db.insert(users).values({
    username: `${PREFIX}_coach_${stamp}`,
    emails: [`${PREFIX}_coach_${stamp}@test.com`],
    password: await bcrypt.hash('TestCoach123!', BCRYPT_SALT_ROUNDS),
    firstName: 'Share',
    lastName: 'Coach',
    fullName: 'Share Coach',
  }).returning();
  createdUserIds.push(testCoach.id);
  await db.insert(userOrganizations).values({ userId: testCoach.id, organizationId: testOrg.id, role: 'coach' });

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: testCoach.username, password: 'TestCoach123!' });
  cookie = login.headers['set-cookie'][0];
});

afterEach(async () => {
  if (createdReportIds.length) {
    // report_shares / report_snapshots cascade on report delete
    await db.delete(reports).where(inArray(reports.id, createdReportIds));
  }
  createdReportIds = [];
  await purgeTestRows({ userIds: createdUserIds, orgIds: testOrg ? [testOrg.id] : [] });
  createdUserIds = [];
  vi.restoreAllMocks();
});

async function seedAthlete(birthDate: string | null, label = 'a') {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const [athlete] = await db.insert(users).values({
    username: `${PREFIX}_${label}_${stamp}`,
    emails: [`${PREFIX}_${label}_${stamp}@test.com`],
    password: await bcrypt.hash('AthletePass123!', BCRYPT_SALT_ROUNDS),
    firstName: 'Share',
    lastName: `Athlete${label}`,
    fullName: `Share Athlete${label}`,
    birthDate,
  }).returning();
  createdUserIds.push(athlete.id);
  await db.insert(userOrganizations).values({ userId: athlete.id, organizationId: testOrg.id, role: 'athlete' });
  return athlete;
}

async function createReport(type: 'team' | 'individual', athleteId?: string) {
  const [report] = await db.insert(reports).values({
    name: `${PREFIX} report`,
    organizationId: testOrg.id,
    reportType: type,
    config: {
      timeframe: { type: 'preset', preset: 'all_time' },
      metrics: ['VERTICAL_JUMP'],
      ...(athleteId ? { athleteId } : {}),
    },
    createdBy: testCoach.id,
  }).returning();
  createdReportIds.push(report.id);
  return report;
}

const sharesFor = (reportId: string) => db.select().from(reportShares).where(eq(reportShares.reportId, reportId));
const flush = () => new Promise((r) => setTimeout(r, 200)); // bulk notifications are fire-and-forget

describe('POST /api/reports/:id/share', () => {
  it('blocks an under-13 athlete: 403, no share row, no email, no push', async () => {
    const athlete = await seedAthlete(dobYearsAgo(12));
    const report = await createReport('team');

    const res = await request(app).post(`/api/reports/${report.id}/share`).set('Cookie', cookie).send({ athleteId: athlete.id });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('UNDER_13_SHARE_BLOCKED');
    expect(await sharesFor(report.id)).toHaveLength(0);
    expect(emailSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('blocks an athlete one day short of 13', async () => {
    const athlete = await seedAthlete(dobYearsAgo(13, 1));
    const report = await createReport('team');
    const res = await request(app).post(`/api/reports/${report.id}/share`).set('Cookie', cookie).send({ athleteId: athlete.id });
    expect(res.status).toBe(403);
  });

  it('blocks an athlete with no date of birth (fail closed)', async () => {
    const athlete = await seedAthlete(null);
    const report = await createReport('individual', athlete.id);
    const res = await request(app).post(`/api/reports/${report.id}/share`).set('Cookie', cookie).send({ athleteId: athlete.id });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('UNDER_13_SHARE_BLOCKED');
    expect(await sharesFor(report.id)).toHaveLength(0);
    expect(emailSpy).not.toHaveBeenCalled();
  });

  it('allows an athlete who turns 13 today', async () => {
    const athlete = await seedAthlete(dobYearsAgo(13));
    const report = await createReport('team');
    const res = await request(app).post(`/api/reports/${report.id}/share`).set('Cookie', cookie).send({ athleteId: athlete.id });
    expect(res.status).toBe(201);
    expect(await sharesFor(report.id)).toHaveLength(1);
  });

  it('allows a 16 year old, creates the share row and notifies', async () => {
    const athlete = await seedAthlete(dobYearsAgo(16));
    const report = await createReport('team');
    const res = await request(app).post(`/api/reports/${report.id}/share`).set('Cookie', cookie).send({ athleteId: athlete.id });

    expect(res.status).toBe(201);
    expect(await sharesFor(report.id)).toHaveLength(1);
    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/reports/:id/share-bulk', () => {
  it('skips under-13 and unknown-DOB athletes, shares with the rest, reports blockedUnder13', async () => {
    const young = await seedAthlete(dobYearsAgo(11), 'young');
    const unknown = await seedAthlete(null, 'unk');
    const teen = await seedAthlete(dobYearsAgo(15), 'teen');
    const report = await createReport('team');

    const res = await request(app)
      .post(`/api/reports/${report.id}/share-bulk`)
      .set('Cookie', cookie)
      .send({ athleteIds: [young.id, unknown.id, teen.id] });
    await flush();

    expect(res.status).toBe(200);
    expect(res.body.shared).toBe(1);
    expect(res.body.blockedUnder13).toBe(2);
    expect(res.body.results.filter((r: any) => r.status === 'blocked_under_13').map((r: any) => r.athleteId).sort())
      .toEqual([young.id, unknown.id].sort());
    expect(res.body.blockedUnder13AthleteIds).toBeUndefined();
    const rows = await sharesFor(report.id);
    expect(rows.map((r) => r.athleteId)).toEqual([teen.id]);
    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(emailSpy.mock.calls[0][0]).toBe(teen.emails![0]);
  });

  it('with no athleteIds (whole org) still skips under-13 and does not fail the batch', async () => {
    await seedAthlete(dobYearsAgo(9), 'young');
    const adult = await seedAthlete(dobYearsAgo(20), 'adult');
    const report = await createReport('team');

    const res = await request(app).post(`/api/reports/${report.id}/share-bulk`).set('Cookie', cookie).send({});
    await flush();

    expect(res.status).toBe(200);
    expect(res.body.blockedUnder13).toBe(1);
    expect((await sharesFor(report.id)).map((r) => r.athleteId)).toEqual([adult.id]);
  });

  it('returns blockedUnder13 0 when everyone is 13 or older', async () => {
    const a = await seedAthlete(dobYearsAgo(14));
    const report = await createReport('team');
    const res = await request(app).post(`/api/reports/${report.id}/share-bulk`).set('Cookie', cookie).send({ athleteIds: [a.id] });
    expect(res.status).toBe(200);
    expect(res.body.blockedUnder13).toBe(0);
    expect(res.body.shared).toBe(1);
  });
});

describe('already-shared under-13 athletes', () => {
  it('share-bulk reports already_shared and sends nothing new', async () => {
    const young = await seedAthlete(dobYearsAgo(11));
    const report = await createReport('team');
    await db.insert(reportShares).values({ reportId: report.id, athleteId: young.id, sharedBy: testCoach.id, organizationId: testOrg.id });

    const res = await request(app).post(`/api/reports/${report.id}/share-bulk`).set('Cookie', cookie).send({ athleteIds: [young.id] });
    await flush();

    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('already_shared');
    expect(res.body.blockedUnder13).toBe(0);
    expect(await sharesFor(report.id)).toHaveLength(1);
    expect(emailSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('bulk-distribute reports already_sent and sends nothing new', async () => {
    const young = await seedAthlete(dobYearsAgo(11));
    const report = await createReport('individual', young.id);
    await db.insert(reportShares).values({ reportId: report.id, athleteId: young.id, sharedBy: testCoach.id, organizationId: testOrg.id });

    const res = await request(app).post('/api/reports/bulk-distribute').set('Cookie', cookie).send({ reportIds: [report.id] });
    await flush();

    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('already_sent');
    expect(res.body.summary.blockedUnder13).toBe(0);
    expect(await sharesFor(report.id)).toHaveLength(1);
    expect(emailSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/reports/bulk-distribute', () => {
  it('skips the under-13 athlete report, distributes the rest, reports blockedUnder13', async () => {
    const young = await seedAthlete(dobYearsAgo(10), 'young');
    const unknown = await seedAthlete(null, 'unk');
    const teen = await seedAthlete(dobYearsAgo(17), 'teen');
    const rYoung = await createReport('individual', young.id);
    const rUnknown = await createReport('individual', unknown.id);
    const rTeen = await createReport('individual', teen.id);

    const res = await request(app)
      .post('/api/reports/bulk-distribute')
      .set('Cookie', cookie)
      .send({ reportIds: [rYoung.id, rUnknown.id, rTeen.id] });
    await flush();

    expect(res.status).toBe(200);
    expect(res.body.summary.sent).toBe(1);
    expect(res.body.summary.blockedUnder13).toBe(2);
    expect(await sharesFor(rYoung.id)).toHaveLength(0);
    expect(await sharesFor(rUnknown.id)).toHaveLength(0);
    expect(await sharesFor(rTeen.id)).toHaveLength(1);
    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(emailSpy.mock.calls[0][0]).toBe(teen.emails![0]);
  });

  it('does not return 400 when every report is blocked', async () => {
    const young = await seedAthlete(dobYearsAgo(8));
    const r = await createReport('individual', young.id);
    const res = await request(app).post('/api/reports/bulk-distribute').set('Cookie', cookie).send({ reportIds: [r.id] });
    expect(res.status).toBe(200);
    expect(res.body.summary.sent).toBe(0);
    expect(res.body.summary.blockedUnder13).toBe(1);
  });
});

describe('parent share link', () => {
  it('still creates a public share link for an under-13 athlete report', async () => {
    const young = await seedAthlete(dobYearsAgo(10));
    const report = await createReport('individual', young.id);

    const res = await request(app).post(`/api/reports/${report.id}/snapshots`).set('Cookie', cookie).send({});

    expect(res.status).toBe(201);
    expect(emailSpy).not.toHaveBeenCalled();

    // The derived flag is for the coach UI only; it must not be frozen into the public snapshot
    const [snap] = await db.select().from(reportSnapshots).where(eq(reportSnapshots.reportId, report.id));
    const data = snap.snapshotData as any;
    expect(data.athlete).toBeDefined();
    expect(data.athlete.shareBlockedUnder13).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('shareBlockedUnder13');
  });

  // Restricted-link behaviour for no-DOB / under-13 athletes (containsMinorData) lands in P3c.
  it.todo('marks the snapshot publicAccessRestricted for under-13 and no-DOB athletes (P3c)');
});
