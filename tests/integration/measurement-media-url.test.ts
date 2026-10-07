/**
 * Integration tests: measurements.media_url (AM-FEAT-015 Phase 2)
 *
 * Covers:
 *  - POST/PUT/GET round-trip (create, update, clear) on /api/measurements
 *  - batch create, event create + bulk (/api/events/:eventId/measurements[/bulk])
 *  - validation (http / private host rejected) on every write path
 *  - Decision 12: mediaUrl never appears in report snapshots, CSV export,
 *    LLM export or COPPA export payloads
 *  - Decision 12: mediaUrl never appears in parent or unified (cross-org) views,
 *    and createSnapshot strips it even if a generator leaks it
 *  - tenant isolation: another org's coach cannot read/write mediaUrl
 *  - event writes keep their event_id (storage eventContext fallback)
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET =
  'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { eq, inArray } from 'drizzle-orm';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  userOrganizations,
  teams,
  userTeams,
  measurements,
  reports,
  events,
  globalAthletes,
  userGlobalAthleteLinks,
} from '@shared/schema';
import { dataExportRequests, parentAthleteLinks } from '@shared/schema/tables/coppa';
import { ReportService } from '../../packages/api/services/report-service';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

const PASSWORD = 'TestCoach123!';
const CLIP = 'https://clips.example.com/video/abc123?t=42';
const CLIP2 = 'https://clips.example.com/video/zzz999';
// Distinctive sentinel so a leak is unambiguous in serialized payloads.
const LEAK = 'https://leakcheck.example.com/secret-clip-SENTINEL';
// Unique per-test URLs, so a DB lookup by URL can only match the row that test wrote.
const BATCH_CLIP = `https://clips.example.com/batch-only/${Date.now()}`;
const CROSS_ORG_CLIP = `https://clips.example.com/cross-org/${Date.now()}`;
const CROSS_ORG_EVENT_CLIP = `https://clips.example.com/cross-org-event/${Date.now()}`;

let app: Express;
const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let orgA: any;
let orgB: any;
let teamA: any;
let coachA: any;
let coachB: any;
let athlete: any;
let eventA: any;
let coachACookie: string;
let coachBCookie: string;
const createdReportIds: string[] = [];
const createdExportUserIds: string[] = [];
const createdGlobalAthleteIds: string[] = [];

async function login(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

async function mkUser(tag: string, extra: Record<string, unknown> = {}) {
  const [u] = await db
    .insert(users)
    .values({
      username: `mmu_${tag}_${suffix}`,
      emails: [`mmu_${tag}_${suffix}@test.com`],
      password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
      firstName: tag,
      lastName: 'Test',
      fullName: `${tag} Test`,
      ...extra,
    })
    .returning();
  return u;
}

const base = () => ({
  userId: athlete.id,
  date: '2026-01-15',
  metric: 'VERTICAL_JUMP',
  value: 30,
  teamId: teamA.id,
});

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  [orgA] = await db.insert(organizations).values({ name: `MMU Org A ${suffix}`, isActive: true }).returning();
  [orgB] = await db.insert(organizations).values({ name: `MMU Org B ${suffix}`, isActive: true }).returning();
  [teamA] = await db.insert(teams).values({ name: `MMU Team ${suffix}`, organizationId: orgA.id }).returning();

  coachA = await mkUser('coachA');
  coachB = await mkUser('coachB');
  athlete = await mkUser('athlete');

  await db.insert(userOrganizations).values([
    { userId: coachA.id, organizationId: orgA.id, role: 'coach' },
    { userId: coachB.id, organizationId: orgB.id, role: 'coach' },
    { userId: athlete.id, organizationId: orgA.id, role: 'athlete' },
  ]);
  await db.insert(userTeams).values({ userId: athlete.id, teamId: teamA.id, isActive: true });

  [eventA] = await db
    .insert(events)
    .values({
      name: `MMU Event ${suffix}`,
      organizationId: orgA.id,
      startDate: new Date('2026-01-15T10:00:00Z'),
      createdBy: coachA.id,
    } as any)
    .returning();

  coachACookie = await login(coachA.username);
  coachBCookie = await login(coachB.username);
});

afterAll(async () => {
  for (const id of createdReportIds) await db.delete(reports).where(eq(reports.id, id));
  if (createdGlobalAthleteIds.length) await db.delete(globalAthletes).where(inArray(globalAthletes.id, createdGlobalAthleteIds));
  if (athlete) await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.athleteUserId, athlete.id));
  const uids = [coachA?.id, coachB?.id, athlete?.id, ...createdExportUserIds].filter(Boolean);
  if (uids.length) {
    await db.delete(dataExportRequests).where(inArray(dataExportRequests.athleteUserId, uids));
    await db.delete(measurements).where(inArray(measurements.userId, uids));
    await db.delete(userTeams).where(inArray(userTeams.userId, uids));
    await db.delete(userOrganizations).where(inArray(userOrganizations.userId, uids));
  }
  if (eventA) await db.delete(events).where(eq(events.id, eventA.id));
  if (teamA) await db.delete(teams).where(eq(teams.id, teamA.id));
  if (uids.length) await db.delete(users).where(inArray(users.id, uids));
  for (const o of [orgA, orgB].filter(Boolean)) await db.delete(organizations).where(eq(organizations.id, o.id));
});

describe('POST/PUT/GET /api/measurements - mediaUrl round-trip', () => {
  let id: string;

  it('create returns mediaUrl and GET by id + list return it', async () => {
    const res = await request(app)
      .post('/api/measurements')
      .set('Cookie', coachACookie)
      .send({ ...base(), mediaUrl: CLIP });
    expect(res.status).toBe(201);
    expect(res.body.mediaUrl).toBe(CLIP);
    id = res.body.id;

    const one = await request(app).get(`/api/measurements/${id}`).set('Cookie', coachACookie);
    expect(one.status).toBe(200);
    expect(one.body.mediaUrl).toBe(CLIP);

    const list = await request(app)
      .get(`/api/measurements?userId=${athlete.id}&organizationId=${orgA.id}&includeUnverified=true`)
      .set('Cookie', coachACookie);
    expect(list.status).toBe(200);
    const row = list.body.find((m: any) => m.id === id);
    expect(row).toBeDefined();
    expect(row.mediaUrl).toBe(CLIP);
  });

  it('measurement created without mediaUrl has null mediaUrl', async () => {
    const res = await request(app).post('/api/measurements').set('Cookie', coachACookie).send(base());
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('mediaUrl', null);
  });

  it('PUT updates mediaUrl', async () => {
    const res = await request(app).put(`/api/measurements/${id}`).set('Cookie', coachACookie).send({ mediaUrl: CLIP2 });
    expect(res.status).toBe(200);
    expect(res.body.mediaUrl).toBe(CLIP2);
    const [row] = await db.select().from(measurements).where(eq(measurements.id, id));
    expect(row.mediaUrl).toBe(CLIP2);
  });

  it('PUT with unrelated field leaves mediaUrl untouched', async () => {
    const res = await request(app).put(`/api/measurements/${id}`).set('Cookie', coachACookie).send({ notes: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.mediaUrl).toBe(CLIP2);
  });

  it('PUT with empty string clears mediaUrl', async () => {
    const res = await request(app).put(`/api/measurements/${id}`).set('Cookie', coachACookie).send({ mediaUrl: '' });
    expect(res.status).toBe(200);
    expect(res.body.mediaUrl).toBeNull();
    const [row] = await db.select().from(measurements).where(eq(measurements.id, id));
    expect(row.mediaUrl).toBeNull();
  });

  it('PUT with null clears mediaUrl', async () => {
    await request(app).put(`/api/measurements/${id}`).set('Cookie', coachACookie).send({ mediaUrl: CLIP });
    const res = await request(app).put(`/api/measurements/${id}`).set('Cookie', coachACookie).send({ mediaUrl: null });
    expect(res.status).toBe(200);
    expect(res.body.mediaUrl).toBeNull();
  });

  it.each([
    ['http', 'http://clips.example.com/x'],
    ['javascript:', 'javascript:alert(1)'],
    ['localhost', 'https://localhost/x'],
    ['private IP', 'https://10.0.0.8/x'],
  ])('POST rejects %s mediaUrl with 400', async (_l, url) => {
    const res = await request(app).post('/api/measurements').set('Cookie', coachACookie).send({ ...base(), mediaUrl: url });
    expect(res.status).toBe(400);
  });

  it('PUT rejects unsafe mediaUrl with 400 and does not change it', async () => {
    await request(app).put(`/api/measurements/${id}`).set('Cookie', coachACookie).send({ mediaUrl: CLIP });
    const res = await request(app)
      .put(`/api/measurements/${id}`)
      .set('Cookie', coachACookie)
      .send({ mediaUrl: 'http://evil.example.com/x' });
    expect(res.status).toBe(400);
    const [row] = await db.select().from(measurements).where(eq(measurements.id, id));
    expect(row.mediaUrl).toBe(CLIP);
  });

  it('POST /api/measurements/batch persists mediaUrl and rejects unsafe', async () => {
    const ok = await request(app)
      .post('/api/measurements/batch')
      .set('Cookie', coachACookie)
      .send({ measurements: [{ ...base(), mediaUrl: BATCH_CLIP }, { ...base(), metric: 'T_TEST', value: 9 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.created).toBe(2);
    const rows = await db.select().from(measurements).where(eq(measurements.mediaUrl, BATCH_CLIP));
    expect(rows).toHaveLength(1);
    expect(rows[0].metric).toBe('VERTICAL_JUMP');
    expect(rows[0].userId).toBe(athlete.id);

    const bad = await request(app)
      .post('/api/measurements/batch')
      .set('Cookie', coachACookie)
      .send({ measurements: [{ ...base(), mediaUrl: 'http://x.example.com/a' }] });
    expect(bad.status).toBe(400);
  });
});

describe('event measurement routes - mediaUrl', () => {
  it('a standard POST /api/measurements cannot inject event context through the body', async () => {
    const res = await request(app)
      .post('/api/measurements')
      .set('Cookie', coachACookie)
      .send({ ...base(), eventId: eventA.id, eventNameSnapshot: 'Forged', eventDateSnapshot: '2020-01-01' });
    expect(res.status).toBe(201);
    const [stored] = await db.select().from(measurements).where(eq(measurements.id, res.body.id));
    expect(stored.eventId).toBeNull();
    expect(stored.eventNameSnapshot).toBeNull();
    expect(stored.eventDateSnapshot).toBeNull();
  });

  it('POST /api/events/:id/measurements stores mediaUrl; GET returns it', async () => {
    const res = await request(app)
      .post(`/api/events/${eventA.id}/measurements`)
      .set('Cookie', coachACookie)
      .send({ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 31, date: '2026-01-15', mediaUrl: CLIP });
    expect(res.status).toBe(201);
    expect(res.body.mediaUrl).toBe(CLIP);

    // The event context must be persisted on the row (storage eventContext fallback)
    const [stored] = await db.select().from(measurements).where(eq(measurements.id, res.body.id));
    expect(stored.eventId).toBe(eventA.id);
    expect(stored.eventNameSnapshot).toBe(eventA.name);
    expect(stored.eventDateSnapshot).toBe('2026-01-15');

    const list = await request(app).get(`/api/events/${eventA.id}/measurements`).set('Cookie', coachACookie);
    expect(list.status).toBe(200);
    const row = list.body.find((m: any) => m.id === res.body.id);
    expect(row).toBeDefined();
    expect(row.mediaUrl).toBe(CLIP);
  });

  it('POST rejects unsafe mediaUrl with 400', async () => {
    const res = await request(app)
      .post(`/api/events/${eventA.id}/measurements`)
      .set('Cookie', coachACookie)
      .send({ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 31, date: '2026-01-15', mediaUrl: 'http://x.example.com/a' });
    expect(res.status).toBe(400);
  });

  it('bulk stores mediaUrl per item and rejects the batch on an unsafe item', async () => {
    const ok = await request(app)
      .post(`/api/events/${eventA.id}/measurements/bulk`)
      .set('Cookie', coachACookie)
      .send({
        measurements: [
          { userId: athlete.id, metric: 'T_TEST', value: 10, date: '2026-01-15', mediaUrl: CLIP2 },
          { userId: athlete.id, metric: 'DASH_40YD', value: 5, date: '2026-01-15' },
        ],
      });
    expect(ok.status).toBe(201);
    const withUrl = ok.body.created.find((m: any) => m.metric === 'T_TEST');
    const without = ok.body.created.find((m: any) => m.metric === 'DASH_40YD');
    expect(withUrl.mediaUrl).toBe(CLIP2);
    expect(without).toHaveProperty('mediaUrl', null);

    const bad = await request(app)
      .post(`/api/events/${eventA.id}/measurements/bulk`)
      .set('Cookie', coachACookie)
      .send({ measurements: [{ userId: athlete.id, metric: 'T_TEST', value: 10, date: '2026-01-15', mediaUrl: 'https://192.168.0.1/x' }] });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('mediaUrl');
  });
});

describe('tenant isolation - other org coach', () => {
  let id: string;

  it('setup: org A measurement with clip', async () => {
    const [m] = await db
      .insert(measurements)
      .values({
        userId: athlete.id,
        submittedBy: coachA.id,
        date: '2026-01-16',
        age: 20,
        metric: 'VERTICAL_JUMP',
        value: '30',
        units: 'in',
        organizationId: orgA.id,
        teamId: teamA.id,
        isVerified: true,
        mediaUrl: CLIP,
      })
      .returning();
    id = m.id;
  });

  it('cannot read mediaUrl (GET by id 403, not in body)', async () => {
    const res = await request(app).get(`/api/measurements/${id}`).set('Cookie', coachBCookie);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(CLIP);
  });

  it('cannot write mediaUrl (PUT 403, value unchanged)', async () => {
    const res = await request(app).put(`/api/measurements/${id}`).set('Cookie', coachBCookie).send({ mediaUrl: CLIP2 });
    expect(res.status).toBe(403);
    const [row] = await db.select().from(measurements).where(eq(measurements.id, id));
    expect(row.mediaUrl).toBe(CLIP);
  });

  it('cannot create a measurement with mediaUrl for org A athlete', async () => {
    const res = await request(app)
      .post('/api/measurements')
      .set('Cookie', coachBCookie)
      .send({ ...base(), mediaUrl: CROSS_ORG_CLIP });
    expect([403, 404]).toContain(res.status);
    const written = await db.select().from(measurements).where(eq(measurements.mediaUrl, CROSS_ORG_CLIP));
    expect(written).toHaveLength(0);
  });

  it('cannot create event measurement with mediaUrl in org A event', async () => {
    const res = await request(app)
      .post(`/api/events/${eventA.id}/measurements`)
      .set('Cookie', coachBCookie)
      .send({ userId: athlete.id, metric: 'VERTICAL_JUMP', value: 31, date: '2026-01-15', mediaUrl: CROSS_ORG_EVENT_CLIP });
    expect(res.status).toBe(403);
    const written = await db.select().from(measurements).where(eq(measurements.mediaUrl, CROSS_ORG_EVENT_CLIP));
    expect(written).toHaveLength(0);
  });

  it('cannot read mediaUrl through the event measurements list', async () => {
    const res = await request(app).get(`/api/events/${eventA.id}/measurements`).set('Cookie', coachBCookie);
    expect(res.status).toBe(403);
  });
});

describe('Decision 12 - mediaUrl excluded from public/export payloads', () => {
  let leakMeasurementId: string;

  it('setup: org A measurement carrying a sentinel mediaUrl', async () => {
    const [m] = await db
      .insert(measurements)
      .values({
        userId: athlete.id,
        submittedBy: coachA.id,
        date: '2026-01-20',
        age: 20,
        metric: 'VERTICAL_JUMP',
        value: '35',
        units: 'in',
        organizationId: orgA.id,
        teamId: teamA.id,
        isVerified: true,
        mediaUrl: LEAK,
        notes: 'leak check',
      })
      .returning();
    leakMeasurementId = m.id;
    const [row] = await db.select().from(measurements).where(eq(measurements.id, leakMeasurementId));
    expect(row.mediaUrl).toBe(LEAK);
  });

  it('public team report snapshot omits mediaUrl', async () => {
    const [report] = await db
      .insert(reports)
      .values({
        name: 'MMU team report',
        organizationId: orgA.id,
        reportType: 'team',
        config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['VERTICAL_JUMP'] },
        createdBy: coachA.id,
      })
      .returning();
    createdReportIds.push(report.id);

    const snap = await request(app).post(`/api/reports/${report.id}/snapshots`).set('Cookie', coachACookie).send({});
    expect(snap.status).toBe(201);
    // sanity: the report actually included this athlete's data
    expect(JSON.stringify(snap.body)).toContain(athlete.id);
    expect(JSON.stringify(snap.body)).not.toContain('mediaUrl');
    expect(JSON.stringify(snap.body)).not.toContain('SENTINEL');

    const pub = await request(app).get(`/api/public/reports/${snap.body.publicToken}`);
    expect(pub.status).toBe(200);
    expect(JSON.stringify(pub.body)).not.toContain('mediaUrl');
    expect(JSON.stringify(pub.body)).not.toContain('SENTINEL');

    const [stored] = await db.select().from(measurements).where(eq(measurements.id, leakMeasurementId));
    expect(stored.mediaUrl).toBe(LEAK); // still stored, just not serialized
  });

  it('public individual report snapshot omits mediaUrl (with trends)', async () => {
    const [report] = await db
      .insert(reports)
      .values({
        name: 'MMU individual report',
        organizationId: orgA.id,
        reportType: 'individual',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['VERTICAL_JUMP'],
          athleteId: athlete.id,
        },
        createdBy: coachA.id,
      })
      .returning();
    createdReportIds.push(report.id);

    const snap = await request(app).post(`/api/reports/${report.id}/snapshots`).set('Cookie', coachACookie).send({});
    expect(snap.status).toBe(201);
    expect(JSON.stringify(snap.body)).toContain('VERTICAL_JUMP');
    expect(JSON.stringify(snap.body)).not.toContain('mediaUrl');
    expect(JSON.stringify(snap.body)).not.toContain('SENTINEL');
  });

  it('CSV measurement export omits mediaUrl', async () => {
    const res = await request(app)
      .get(`/api/export/measurements?organizationId=${orgA.id}&playerId=${athlete.id}`)
      .set('Cookie', coachACookie);
    expect(res.status).toBe(200);
    expect(res.text).toContain('VERTICAL_JUMP'); // rows are present
    expect(res.text).toContain('leak check');
    expect(res.text).not.toContain('SENTINEL');
    expect(res.text.toLowerCase()).not.toContain('mediaurl');
    expect(res.text.toLowerCase()).not.toContain('media_url');
  });

  it('LLM export (json and markdown) omits mediaUrl', async () => {
    const json = await request(app).get(`/api/athletes/${athlete.id}/llm-export?format=json`).set('Cookie', coachACookie);
    expect(json.status).toBe(200);
    expect(JSON.stringify(json.body)).toContain('VERTICAL_JUMP');
    expect(JSON.stringify(json.body)).not.toContain('SENTINEL');
    expect(JSON.stringify(json.body)).not.toContain('mediaUrl');

    const md = await request(app).get(`/api/athletes/${athlete.id}/llm-export`).set('Cookie', coachACookie);
    expect(md.status).toBe(200);
    expect(md.text).not.toContain('SENTINEL');
    expect(md.text).not.toContain('mediaUrl');
  });

  it('COPPA data export bundle omits mediaUrl', async () => {
    const [minor] = await db
      .insert(users)
      .values({
        username: `mmu_minor_${suffix}`,
        emails: [`mmu_minor_${suffix}@test.com`],
        password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
        firstName: 'Minor',
        lastName: 'Test',
        fullName: 'Minor Test',
        isMinor: true,
        coppaStatus: 'consented',
      } as any)
      .returning();
    createdExportUserIds.push(minor.id);
    await db.insert(measurements).values({
      userId: minor.id,
      submittedBy: coachA.id,
      date: '2026-01-20',
      age: 15,
      metric: 'VERTICAL_JUMP',
      value: '25',
      units: 'in',
      organizationId: orgA.id,
      isVerified: true,
      mediaUrl: LEAK,
    });

    const raw = crypto.randomBytes(32).toString('hex');
    await db.insert(dataExportRequests).values({
      athleteUserId: minor.id,
      requestedByEmail: `parent_${suffix}@test.com`,
      status: 'ready',
      downloadToken: crypto.createHash('sha256').update(raw).digest('hex'),
      downloadExpiresAt: new Date(Date.now() + 86400000),
      processedAt: new Date(),
    } as any);

    const res = await request(app).get(`/api/coppa/data-export/download/${raw}`);
    expect(res.status).toBe(200);
    expect(res.body.measurements.length).toBe(1);
    expect(res.body.measurements[0].metric).toBe('VERTICAL_JUMP');
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL');
    expect(JSON.stringify(res.body)).not.toContain('mediaUrl');
  });
  it('parent view of a linked child omits mediaUrl', async () => {
    const parent = await mkUser('parent', { role: 'parent', isEmailVerified: true });
    createdExportUserIds.push(parent.id);
    await db.insert(parentAthleteLinks).values({
      parentEmail: parent.emails[0],
      parentUserId: parent.id,
      athleteUserId: athlete.id,
      isActive: true,
    } as any);
    const cookie = await login(parent.username);

    const res = await request(app).get(`/api/parent/children/${athlete.id}/measurements`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(leakMeasurementId); // the row is present
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL');
    expect(JSON.stringify(res.body)).not.toContain('mediaUrl');
  });

  it('unified cross-org measurements and dashboard omit mediaUrl', async () => {
    const [ga] = await db
      .insert(globalAthletes)
      .values({ canonicalFirstName: 'athlete', canonicalLastName: 'Test', canonicalFullName: 'athlete Test' } as any)
      .returning();
    createdGlobalAthleteIds.push(ga.id);
    await db.insert(userGlobalAthleteLinks).values({
      userId: athlete.id,
      globalAthleteId: ga.id,
      linkStatus: 'confirmed',
      linkType: 'admin_forced',
      shareMeasurements: true,
    } as any);
    const cookie = await login(athlete.username);

    const unified = await request(app).get('/api/my/unified-measurements').set('Cookie', cookie);
    expect(unified.status).toBe(200);
    expect(unified.body.measurements.some((m: any) => m.id === leakMeasurementId)).toBe(true);
    expect(JSON.stringify(unified.body)).not.toContain('SENTINEL');
    expect(JSON.stringify(unified.body)).not.toContain('mediaUrl');

    const dashboard = await request(app).get('/api/my/unified-dashboard').set('Cookie', cookie);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.hasGlobalAthlete).not.toBe(false);
    expect(JSON.stringify(dashboard.body)).not.toContain('SENTINEL');
  });

  it('createSnapshot strips a mediaUrl leaked by a report generator at any depth', async () => {
    const [report] = await db
      .insert(reports)
      .values({
        name: 'MMU stubbed report',
        organizationId: orgA.id,
        reportType: 'team',
        config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['VERTICAL_JUMP'] },
        createdBy: coachA.id,
      })
      .returning();
    createdReportIds.push(report.id);

    const service = new ReportService();
    const generator = vi.spyOn(ReportService.prototype, 'generateTeamReport').mockResolvedValue({
      athleteRankings: [{ userId: athlete.id, raw: [{ metric: 'VERTICAL_JUMP', mediaUrl: LEAK }] }],
      nested: { deeper: { mediaUrl: LEAK } },
    } as any);
    try {
      const snapshot = await service.createSnapshot(report.id, coachA.id);
      const serialized = JSON.stringify(snapshot.snapshotData);
      expect(generator).toHaveBeenCalled();
      expect(serialized).toContain(athlete.id);
      expect(serialized).not.toContain('SENTINEL');
      expect(serialized).not.toContain('mediaUrl');
    } finally {
      generator.mockRestore();
    }
  });
});
