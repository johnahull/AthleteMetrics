/**
 * POST /api/events/:eventId/metrics/bulk: save a whole metric list in one request (AM-FEAT-019, new-event form).
 * Same authorization and mutation limiter as the single POST /api/events/:eventId/metrics, one limiter hit per request.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { auditLogs, eventMetrics, events, organizations, siteMetrics, userOrganizations, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// Count how often each limiter (by its message) runs; nothing is ever limited here.
const limiterHits = vi.hoisted(() => new Map<string, number>());
vi.mock('express-rate-limit', async (importOriginal) => {
  const factory = (options: { message?: { message?: string } | string }) => {
    const name = typeof options?.message === 'string' ? options.message : options?.message?.message ?? 'unnamed';
    return (_req: unknown, _res: unknown, next: () => void) => {
      limiterHits.set(name, (limiterHits.get(name) ?? 0) + 1);
      next();
    };
  };
  return { ...(await importOriginal<Record<string, unknown>>()), default: factory, rateLimit: factory };
});

import { registerRoutes } from '../../packages/api/routes';
import { bulkAddEventMetrics } from '../../packages/api/services/event-metrics-bulk';

const PASSWORD = 'BulkMetrics123!';
const PREFIX = `bulkmet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const SUFFIX = Math.random().toString(36).slice(2, 8).toUpperCase();
const MUTATION_LIMITER = 'Too many event metrics modification attempts, please try again later.';
const code = (n: number | string) => `ZZB_${SUFFIX}_${n}`;
const DERIVED = code('DERIVED');
const INACTIVE = code('INACTIVE');
const COLLEGE_ONLY = code('COLLEGE_ONLY');
const CLUB_ONLY = code('CLUB_ONLY');
const ANY_TYPE = code('ANY_TYPE');

type Who = 'coachA' | 'adminA' | 'athleteA' | 'coachB' | 'siteAdmin';

describe('POST /api/events/:eventId/metrics/bulk', () => {
  let app: Express;
  const u = {} as Record<Who, any>;
  const cookies = {} as Record<Who, string>;
  let orgA: string;
  let orgB: string;
  const createdCodes: string[] = [];

  const as = (who: Who) => ({
    post: (url: string) => request(app).post(url).set('Cookie', cookies[who]),
  });
  const newEvent = async (organizationId: string, extra: Record<string, unknown> = {}) =>
    (await db.insert(events).values({ organizationId, name: `${PREFIX}-ev-${Math.random().toString(36).slice(2, 7)}`, startDate: new Date('2026-03-01T10:00:00Z'), ...extra } as any).returning({ id: events.id }))[0].id;
  const codesOf = async (eventId: string) => (await db.select().from(eventMetrics).where(eq(eventMetrics.eventId, eventId))).map((r) => r.metricCode).sort();
  const item = (c: string, extra: Record<string, unknown> = {}) => ({ metricCode: c, ...extra });

  beforeAll(async () => {
    const app0 = express();
    app0.use(express.json());
    await registerRoutes(app0);
    app = app0;

    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    [{ id: orgA }, { id: orgB }] = await db.insert(organizations).values([{ name: `${PREFIX}-A` }, { name: `${PREFIX}-B` }] as any).returning({ id: organizations.id });
    const spec: Record<Who, Array<[string, string]>> = {
      coachA: [[orgA, 'coach']],
      adminA: [[orgA, 'org_admin']],
      athleteA: [[orgA, 'athlete']],
      coachB: [[orgB, 'coach']],
      siteAdmin: [],
    };
    for (const [who, memberships] of Object.entries(spec) as Array<[Who, Array<[string, string]>]>) {
      [u[who]] = await db
        .insert(users)
        .values({ username: `${PREFIX}-${who}`, emails: [`${PREFIX}-${who}@test.com`], password: hashed, firstName: 'Bulk', lastName: who, fullName: `Bulk ${who}`, ...(who === 'siteAdmin' ? { isSiteAdmin: true } : {}) } as any)
        .returning();
      for (const [organizationId, role] of memberships) {
        await db.insert(userOrganizations).values({ userId: u[who].id, organizationId, role } as any);
      }
      const login = await request(app).post('/api/auth/login').send({ username: u[who].username, password: PASSWORD });
      expect(login.status, `login ${who}`).toBe(200);
      cookies[who] = login.headers['set-cookie'][0];
    }

    // CI builds its DB with db:push and the default seed only: create every metric this file uses, and delete only those.
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => ({ code: code(i), isActive: true, isDerived: false })),
      { code: DERIVED, isActive: true, isDerived: true },
      { code: INACTIVE, isActive: false, isDerived: false },
      { code: COLLEGE_ONLY, isActive: true, isDerived: false, availableOrgTypes: ['college'] },
      { code: CLUB_ONLY, isActive: true, isDerived: false, availableOrgTypes: ['club'] },
      { code: ANY_TYPE, isActive: true, isDerived: false, availableOrgTypes: [] },
    ];
    for (const r of rows) {
      await db.insert(siteMetrics).values({ ...r, label: `Label ${r.code}`, category: 'speed', unit: 's', metricType: 'lower_is_better' } as any).onConflictDoNothing();
      createdCodes.push(r.code);
    }
  });

  afterAll(async () => {
    await purgeTestRows({ usernameLike: [`${PREFIX}-%`], orgNameLike: [`${PREFIX}-%`] });
    if (createdCodes.length) await db.delete(siteMetrics).where(inArray(siteMetrics.code, createdCodes));
  });

  it('adds many metrics in one request, with order, flags and labels', async () => {
    const ev = await newEvent(orgA);
    const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({
      metrics: [item(code(0), { isRequired: true, displayOrder: 0 }), item(code(1), { displayOrder: 1, customLabel: 'Sprint' }), item(code(2), { displayOrder: 2 })],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ added: [code(0), code(1), code(2)], alreadyPresent: [], skipped: [] });
    const rows = await db.select().from(eventMetrics).where(eq(eventMetrics.eventId, ev));
    const by = Object.fromEntries(rows.map((r) => [r.metricCode, r]));
    expect(by[code(0)]).toMatchObject({ isRequired: true, displayOrder: 0 });
    expect(by[code(1)]).toMatchObject({ isRequired: false, displayOrder: 1, customLabel: 'Sprint' });
  });

  it('adds 23 metrics with exactly one hit on the mutation limiter', async () => {
    const ev = await newEvent(orgA);
    limiterHits.clear();
    const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: Array.from({ length: 23 }, (_, i) => item(code(i), { displayOrder: i })) });
    expect(res.status).toBe(200);
    expect(res.body.added).toHaveLength(23);
    expect(limiterHits.get(MUTATION_LIMITER)).toBe(1);
    // No other event-metrics limiter ran, and the 23 metrics did not each count as a request
    const eventMetricsHits = [...limiterHits.entries()].filter(([name]) => /event metrics/i.test(name));
    expect(eventMetricsHits).toEqual([[MUTATION_LIMITER, 1]]);
  });

  it('is allowed for org_admin and site admin, and denied like the single POST route for an athlete and another org', async () => {
    const ev = await newEvent(orgA);
    expect((await as('adminA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(code(0))] })).status).toBe(200);
    expect((await as('siteAdmin').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(code(1))] })).status).toBe(200);

    for (const who of ['athleteA', 'coachB'] as const) {
      const single = await as(who).post(`/api/events/${ev}/metrics`).send({ metricCode: code(5) });
      const bulk = await as(who).post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(code(5))] });
      expect(bulk.status, who).toBe(single.status);
      expect(bulk.status, who).toBe(403);
    }
    expect(await codesOf(ev)).toEqual([code(0), code(1)]);
    expect((await request(app).post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(code(5))] })).status).toBe(401);
  });

  it('answers 404 for an unknown event', async () => {
    const res = await as('coachA').post(`/api/events/no-such-event/metrics/bulk`).send({ metrics: [item(code(0))] });
    expect(res.status).toBe(404);
  });

  it('answers 409 and adds nothing for a frozen event', async () => {
    const ev = await newEvent(orgA, { isFrozen: true });
    const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(code(0))] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/frozen/i);
    expect(await codesOf(ev)).toEqual([]);
  });

  it('answers 409 for a frozen event even when every code would be skipped', async () => {
    const ev = await newEvent(orgA, { isFrozen: true });
    const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(DERIVED)] });
    expect(res.status).toBe(409);
  });

  it('skips derived, inactive and unknown codes with a reason, and adds the rest', async () => {
    const ev = await newEvent(orgA);
    const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({
      metrics: [item(code(0)), item(DERIVED), item(INACTIVE), item(code('NOPE')), item(code(1))],
    });
    expect(res.status).toBe(200);
    expect(res.body.added).toEqual([code(0), code(1)]);
    expect(res.body.alreadyPresent).toEqual([]);
    expect(res.body.skipped).toEqual([
      { metricCode: DERIVED, reason: 'derived' },
      { metricCode: INACTIVE, reason: 'inactive' },
      { metricCode: code('NOPE'), reason: 'unknown' },
    ]);
    expect(await codesOf(ev)).toEqual([code(0), code(1)]);
  });

  it('is idempotent: a second call reports the codes as alreadyPresent and changes nothing', async () => {
    const ev = await newEvent(orgA);
    const body = { metrics: [item(code(0), { displayOrder: 0 }), item(code(1), { displayOrder: 1 })] };
    await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send(body);
    const again = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [...body.metrics, item(code(2), { displayOrder: 2 })] });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ added: [code(2)], alreadyPresent: [code(0), code(1)], skipped: [] });
    expect(await codesOf(ev)).toEqual([code(0), code(1), code(2)]);
  });

  it('treats a code repeated in the body as one metric', async () => {
    const ev = await newEvent(orgA);
    const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(code(0)), item(code(0))] });
    expect(res.status).toBe(200);
    expect(res.body.added).toEqual([code(0)]);
    expect(await codesOf(ev)).toEqual([code(0)]);
  });

  it('accepts an empty list (nothing to add) and exactly 100 items; more than 100 is a 400', async () => {
    const ev = await newEvent(orgA);
    const empty = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [] });
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ added: [], alreadyPresent: [], skipped: [] });

    const hundred = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: Array.from({ length: 100 }, (_, i) => item(code(`X${i}`))) });
    expect(hundred.status).toBe(200);
    expect(hundred.body.skipped).toHaveLength(100);

    const tooMany = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: Array.from({ length: 101 }, (_, i) => item(code(`X${i}`))) });
    expect(tooMany.status).toBe(400);
    expect(await codesOf(ev)).toEqual([]);
  });

  it('answers 400 for a malformed body and adds nothing', async () => {
    const ev = await newEvent(orgA);
    for (const body of [{}, { metrics: 'x' }, { metrics: [{}] }, { metrics: [{ metricCode: '' }] }, { metrics: [{ metricCode: code(0), displayOrder: -1 }] }, { metrics: [{ metricCode: code(0), isRequired: 'yes' }] }, { metrics: [item(code(0)), { metricCode: 5 }] }]) {
      const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await codesOf(ev)).toEqual([]);
  });

  it('strips unknown keys instead of writing them', async () => {
    const ev = await newEvent(orgA);
    const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ eventId: 'other', metrics: [{ metricCode: code(0), eventId: 'other', id: 'x', createdAt: '2000-01-01' }] });
    expect(res.status).toBe(200);
    const rows = await db.select().from(eventMetrics).where(eq(eventMetrics.eventId, ev));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe('x');
  });

  describe('atomic: all or nothing', () => {
    const auditRows = async (eventId: string) => db.select().from(auditLogs).where(eq(auditLogs.resourceId, eventId));

    it('saves nothing, and writes no audit row, when the audit insert fails after the metric insert', async () => {
      const ev = await newEvent(orgA);
      // an author that does not exist: the audit row violates its foreign key after the metrics were inserted
      await expect(bulkAddEventMetrics(ev, 'no-such-user', [item(code(0)), item(code(1))])).rejects.toThrow();
      expect(await codesOf(ev)).toEqual([]);
      expect(await auditRows(ev)).toEqual([]);
    });

    it('saves nothing when one item violates a column limit (service called with a label Zod would have refused)', async () => {
      const ev = await newEvent(orgA);
      await expect(bulkAddEventMetrics(ev, u.coachA.id, [item(code(0)), item(code(1), { customLabel: 'x'.repeat(101) })])).rejects.toThrow();
      expect(await codesOf(ev)).toEqual([]);
      expect(await auditRows(ev)).toEqual([]);
    });

    it('answers a plain 500 and leaves nothing behind when the write fails', async () => {
      const ev = await newEvent(orgA);
      const orig = db.transaction.bind(db);
      const spy = vi.spyOn(db, 'transaction').mockImplementationOnce(((fn: any) => orig(async (tx: any) => { await fn(tx); throw new Error('boom'); })) as any);
      const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(code(0))] });
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/failed/i);
      expect(await codesOf(ev)).toEqual([]);
      expect(await auditRows(ev)).toEqual([]);
    });

    it('two identical requests at once: no 500, no duplicates, each code added exactly once overall', async () => {
      const ev = await newEvent(orgA);
      const metrics = Array.from({ length: 10 }, (_, i) => item(code(i), { displayOrder: i }));
      const [r1, r2] = await Promise.all([
        as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics }),
        as('adminA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics }),
      ]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      const added = [...r1.body.added, ...r2.body.added].sort();
      expect(added).toEqual(metrics.map((m) => m.metricCode).sort());
      expect([...r1.body.alreadyPresent, ...r2.body.alreadyPresent].sort()).toEqual(added);
      expect(await codesOf(ev)).toEqual(added);
    });
  });

  describe('organization type availability', () => {
    it("skips a metric the org's type does not offer ('unavailable'); null and empty lists mean every type", async () => {
      const ev = await newEvent(orgA); // organizations default to type club
      const res = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(COLLEGE_ONLY), item(CLUB_ONLY), item(ANY_TYPE), item(code(0))] });
      expect(res.status).toBe(200);
      expect(res.body.added).toEqual([CLUB_ONLY, ANY_TYPE, code(0)]);
      expect(res.body.skipped).toEqual([{ metricCode: COLLEGE_ONLY, reason: 'unavailable' }]);
    });
  });

  describe('input hygiene', () => {
    it('rejects control characters in a label and badly formed metric codes with 400', async () => {
      const ev = await newEvent(orgA);
      for (const metrics of [[item(code(0), { customLabel: 'Line\nbreak' })], [item(code(0), { customLabel: 'Nul\u0000' })], [item('has space')], [item('semi;colon')], [item('dash-ed')]]) {
        expect((await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics })).status, JSON.stringify(metrics)).toBe(400);
      }
      expect(await codesOf(ev)).toEqual([]);
    });
  });

  describe('single POST /api/events/:eventId/metrics: same eligibility, rejected with 400', () => {
    const post = (ev: string, body: Record<string, unknown>, who: Who = 'coachA') => as(who).post(`/api/events/${ev}/metrics`).send(body);

    it('rejects derived, inactive and org-type-unavailable metrics with a plain message', async () => {
      const ev = await newEvent(orgA);
      const derived = await post(ev, { metricCode: DERIVED });
      expect(derived.status).toBe(400);
      expect(derived.body.error).toMatch(/calculated/i);
      const inactive = await post(ev, { metricCode: INACTIVE });
      expect(inactive.status).toBe(400);
      expect(inactive.body.error).toMatch(/not active/i);
      const unavailable = await post(ev, { metricCode: COLLEGE_ONLY });
      expect(unavailable.status).toBe(400);
      expect(unavailable.body.error).toMatch(/organization's type/i);
      expect(await codesOf(ev)).toEqual([]);
    });

    it('still adds an eligible metric (201) and answers 400 for an unknown one', async () => {
      const ev = await newEvent(orgA);
      expect((await post(ev, { metricCode: code(0), customLabel: 'Sprint' })).status).toBe(201);
      expect((await post(ev, { metricCode: code('NOPE') })).status).toBe(400);
      expect(await codesOf(ev)).toEqual([code(0)]);
    });

    it('validates customLabel: too long, control characters and non-strings are 400, not a DB 500', async () => {
      const ev = await newEvent(orgA);
      for (const customLabel of ['x'.repeat(101), 'a\nb', 5]) {
        expect((await post(ev, { metricCode: code(0), customLabel })).status, String(customLabel)).toBe(400);
      }
      expect(await codesOf(ev)).toEqual([]);
    });

    it('accepts customLabel: null on both the single and the bulk route (stored as no label)', async () => {
      const ev = await newEvent(orgA);
      expect((await post(ev, { metricCode: code(0), customLabel: null })).status).toBe(201);
      const bulk = await as('coachA').post(`/api/events/${ev}/metrics/bulk`).send({ metrics: [item(code(1), { customLabel: null })] });
      expect(bulk.status).toBe(200);
      expect(bulk.body.added).toEqual([code(1)]);
      const rows = await db.select().from(eventMetrics).where(eq(eventMetrics.eventId, ev));
      expect(rows.map((r) => r.customLabel)).toEqual([null, null]);
    });

    it('answers 400 (not 409 as the bulk route does) for a frozen event', async () => {
      const ev = await newEvent(orgA, { isFrozen: true });
      expect((await post(ev, { metricCode: code(0) })).status).toBe(400);
    });
  });
});
