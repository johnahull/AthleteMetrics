/**
 * Direct add of athletes to an event: POST /api/events/:eventId/registrations/bulk-add
 *
 * A manager (org admin / coach of the event's organization, or a site admin) adds organization
 * athletes straight onto the roster as checked in (or approved), without an invitation. Silent:
 * no email, no push. Capacity and waitlist are ignored.
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET =
  'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { and, eq, inArray, sql } from 'drizzle-orm';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// Known limiter ceiling so the test can read the remaining budget from the RateLimit header
vi.mock('../../packages/api/constants/rate-limits', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, RATE_LIMITS: { ...actual.RATE_LIMITS, MUTATION: 1000 } };
});

const notificationCalls = vi.hoisted(() => [] as string[]);
vi.mock('../../packages/api/services/measurement-notification-service', () => ({
  notifyNewMeasurement: vi.fn(async () => {
    notificationCalls.push('notifyNewMeasurement');
  }),
}));

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import { EmailService } from '../../packages/api/services/email-service';
import { EventRegistrationService, EventNotFoundError } from '../../packages/api/services/event-registration-service';
import { storage } from '../../packages/api/storage';
import { PushNotificationService } from '../../packages/api/services/push-notification-service';
import { organizations, users, userOrganizations, events, eventRegistrations, auditLogs } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

const PASSWORD = 'TestCoach123!';
const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const PREFIX = 'evadd';

let app: Express;
let orgA: any;
let orgB: any;
let orgAdminA: any;
let coachA: any;
let coachB: any;
let athleteCaller: any;
let siteAdmin: any;
const eventIds: string[] = [];
const cookies: Record<string, string> = {};

async function login(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

let counter = 0;
async function mkUser(tag: string, extra: Record<string, unknown> = {}) {
  counter += 1;
  const [u] = await db
    .insert(users)
    .values({
      username: `${PREFIX}_${tag}_${counter}_${suffix}`,
      emails: [`${PREFIX}_${tag}_${counter}_${suffix}@test.com`],
      password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
      firstName: tag,
      lastName: `Ath${counter}`,
      fullName: `${tag} Ath${counter}`,
      ...extra,
    } as any)
    .returning();
  return u;
}

async function mkAthlete(org: any, extra: Record<string, unknown> = {}) {
  const u = await mkUser('athlete', extra);
  await db.insert(userOrganizations).values({ userId: u.id, organizationId: org.id, role: 'athlete' } as any);
  return u;
}

async function mkEvent(opts: { org?: any | null; status?: string; max?: number | null; frozen?: boolean } = {}) {
  const org = opts.org === undefined ? orgA : opts.org;
  const [e] = await db
    .insert(events)
    .values({
      name: `${PREFIX} Event ${suffix} ${eventIds.length}`,
      organizationId: org ? org.id : null,
      startDate: new Date('2026-06-10T10:00:00Z'),
      status: opts.status ?? 'published',
      maxRegistrations: opts.max ?? null,
      isFrozen: opts.frozen ?? false,
      createdBy: coachA.id,
    } as any)
    .returning();
  eventIds.push(e.id);
  return e;
}

const bulkAdd = (eventId: string, body: unknown, cookie = cookies.coachA) =>
  request(app).post(`/api/events/${eventId}/registrations/bulk-add`).set('Cookie', cookie).send(body as any);

const regFor = async (eventId: string, userId: string) =>
  (await db.select().from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId))))[0];

const spies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  [orgA] = await db.insert(organizations).values({ name: `${PREFIX} Org A ${suffix}`, isActive: true }).returning();
  [orgB] = await db.insert(organizations).values({ name: `${PREFIX} Org B ${suffix}`, isActive: true }).returning();
  orgAdminA = await mkUser('orgadmin');
  coachA = await mkUser('coachA');
  coachB = await mkUser('coachB');
  athleteCaller = await mkUser('callerathlete');
  siteAdmin = await mkUser('siteadmin', { isSiteAdmin: true });
  await db.insert(userOrganizations).values([
    { userId: orgAdminA.id, organizationId: orgA.id, role: 'org_admin' },
    { userId: coachA.id, organizationId: orgA.id, role: 'coach' },
    { userId: coachB.id, organizationId: orgB.id, role: 'coach' },
    { userId: athleteCaller.id, organizationId: orgA.id, role: 'athlete' },
  ] as any);
  cookies.orgAdminA = await login(orgAdminA.username);
  cookies.coachA = await login(coachA.username);
  cookies.coachB = await login(coachB.username);
  cookies.athlete = await login(athleteCaller.username);
  cookies.siteAdmin = await login(siteAdmin.username);

  // Any email or push call during a direct add is a failure
  for (const proto of [EmailService.prototype, PushNotificationService.prototype]) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || typeof (proto as any)[name] !== 'function') continue;
      spies.push(
        vi.spyOn(proto as any, name).mockImplementation((async () => {
          notificationCalls.push(`${proto.constructor.name}.${name}`);
          return undefined;
        }) as any),
      );
    }
  }
});

afterEach(() => {
  notificationCalls.length = 0;
});

afterAll(async () => {
  spies.forEach((s) => s.mockRestore());
  if (eventIds.length) await db.delete(auditLogs).where(inArray(auditLogs.resourceId, eventIds));
  if (eventIds.length) await db.delete(events).where(inArray(events.id, eventIds));
  await purgeTestRows({ usernameLike: [`${PREFIX}_%_${suffix}`], orgNameLike: [`${PREFIX} Org %${suffix}`] });
});

describe('POST /api/events/:eventId/registrations/bulk-add', () => {
  it('lets a coach of the event organization add athletes as checked_in with snapshots', async () => {
    const ev = await mkEvent();
    const a1 = await mkAthlete(orgA);
    const a2 = await mkAthlete(orgA);
    const res = await bulkAdd(ev.id, { userIds: [a1.id, a2.id] });
    expect(res.status).toBe(200);
    expect(res.body.added.sort()).toEqual([a1.id, a2.id].sort());
    expect(res.body.updated).toEqual([]);
    expect(res.body.alreadyOnEvent).toEqual([]);
    expect(res.body.rejected).toEqual([]);
    expect(res.body.overCapacity).toBeUndefined();

    const r1 = await regFor(ev.id, a1.id);
    expect(r1.status).toBe('checked_in');
    expect(r1.userFullNameSnapshot).toBe(a1.fullName);
    expect(r1.organizationIdSnapshot).toBe(orgA.id);
    expect(r1.organizationNameSnapshot).toBe(orgA.name);
    expect(r1.registrationNumber).toBeGreaterThan(0);
    expect(r1.approvedBy).toBe(coachA.id);
    expect(r1.approvedAt).toBeTruthy();
    expect(r1.checkedInBy).toBe(coachA.id);
    expect(r1.checkedInAt).toBeTruthy();
    expect(r1.adminNotes).toContain('Added directly by');
    const r2 = await regFor(ev.id, a2.id);
    expect(r2.registrationNumber).not.toBe(r1.registrationNumber);
  });

  it('lets an org admin add athletes', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const res = await bulkAdd(ev.id, { userIds: [a.id] }, cookies.orgAdminA);
    expect(res.status).toBe(200);
    expect(res.body.added).toEqual([a.id]);
    expect((await regFor(ev.id, a.id)).checkedInBy).toBe(orgAdminA.id);
  });

  it('checkIn:false creates approved registrations without check-in fields', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const res = await bulkAdd(ev.id, { userIds: [a.id], checkIn: false });
    expect(res.status).toBe(200);
    const r = await regFor(ev.id, a.id);
    expect(r.status).toBe('approved');
    expect(r.approvedBy).toBe(coachA.id);
    expect(r.checkedInAt).toBeNull();
    expect(r.checkedInBy).toBeNull();
  });

  it('denies an athlete-role caller and a coach of another organization, creating nothing', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const asAthlete = await bulkAdd(ev.id, { userIds: [a.id] }, cookies.athlete);
    expect(asAthlete.status).toBe(403);
    const asOtherCoach = await bulkAdd(ev.id, { userIds: [a.id] }, cookies.coachB);
    expect(asOtherCoach.status).toBe(403);
    expect(await regFor(ev.id, a.id)).toBeUndefined();
  });

  it('requires authentication', async () => {
    const ev = await mkEvent();
    const res = await request(app).post(`/api/events/${ev.id}/registrations/bulk-add`).send({ userIds: [athleteCaller.id] });
    expect(res.status).toBe(401);
  });

  it('answers 404 for an unknown event and 403 for a coach on an event without an organization', async () => {
    const missing = await bulkAdd('00000000-0000-4000-8000-000000000000', { userIds: [athleteCaller.id] });
    expect(missing.status).toBe(404);
    const ev = await mkEvent({ org: null });
    const res = await bulkAdd(ev.id, { userIds: [athleteCaller.id] });
    expect(res.status).toBe(403);
  });

  it('lets a site admin add to a normal event but answers 409 with a clear message for an event without an organization', async () => {
    const a = await mkAthlete(orgA);
    const ev = await mkEvent();
    const ok = await bulkAdd(ev.id, { userIds: [a.id] }, cookies.siteAdmin);
    expect(ok.status).toBe(200);
    expect(ok.body.added).toEqual([a.id]);

    const orgless = await mkEvent({ org: null });
    const res = await bulkAdd(orgless.id, { userIds: [a.id] }, cookies.siteAdmin);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/organization/i);
    expect(await regFor(orgless.id, a.id)).toBeUndefined();
  });

  it('refuses a frozen event with 409 and creates nothing', async () => {
    const a = await mkAthlete(orgA);
    const ev = await mkEvent({ frozen: true });
    const res = await bulkAdd(ev.id, { userIds: [a.id] });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/frozen/i);
    expect(await regFor(ev.id, a.id)).toBeUndefined();
  });

  it('does not overwrite approval history or admin notes of an existing approved registration', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const approvedAt = new Date('2026-02-02T00:00:00Z');
    await db.insert(eventRegistrations).values({
      eventId: ev.id, userId: a.id, userFullNameSnapshot: a.fullName, status: 'approved', registrationNumber: 1,
      approvedAt, approvedBy: orgAdminA.id, adminNotes: 'VIP, keep',
    } as any);
    const res = await bulkAdd(ev.id, { userIds: [a.id] });
    expect(res.body.updated).toEqual([a.id]);
    const r = await regFor(ev.id, a.id);
    expect(r.status).toBe('checked_in');
    expect(r.approvedBy).toBe(orgAdminA.id);
    expect(r.approvedAt?.getTime()).toBe(approvedAt.getTime());
    expect(r.adminNotes).toBe('VIP, keep');
    expect(r.checkedInBy).toBe(coachA.id);
  });

  it('checkIn:false repeat is idempotent: alreadyOnEvent, no rewrite, no extra audit row', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const first = await bulkAdd(ev.id, { userIds: [a.id], checkIn: false });
    expect(first.body.added).toEqual([a.id]);
    const before = await regFor(ev.id, a.id);
    const second = await bulkAdd(ev.id, { userIds: [a.id], checkIn: false }, cookies.orgAdminA);
    expect(second.status).toBe(200);
    expect(second.body.updated).toEqual([]);
    expect(second.body.alreadyOnEvent).toEqual([a.id]);
    const after = await regFor(ev.id, a.id);
    expect(after.updatedAt?.getTime()).toBe(before.updatedAt?.getTime());
    expect(after.approvedBy).toBe(coachA.id);
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, ev.id));
    expect(audits).toHaveLength(1);
  });

  it('survives a concurrent self-registration for the same athlete (no 500, no constraint text)', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const other = await mkAthlete(orgA);
    // A competing registration commits between the service's read and its insert
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION evadd_race_${suffix}() RETURNS trigger AS $f$
      BEGIN
        IF pg_trigger_depth() = 1 AND NEW.user_id = '${a.id}' THEN
          INSERT INTO event_registrations (event_id, user_id, user_full_name_snapshot, status, registration_number)
          VALUES (NEW.event_id, NEW.user_id, 'racer', 'pending', 9999);
        END IF;
        RETURN NEW;
      END $f$ LANGUAGE plpgsql;
      CREATE TRIGGER evadd_race_${suffix} BEFORE INSERT ON event_registrations
        FOR EACH ROW EXECUTE FUNCTION evadd_race_${suffix}();
    `));
    try {
      const res = await bulkAdd(ev.id, { userIds: [a.id, other.id] });
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/constraint|duplicate key/i);
      expect(res.body.added).toEqual([other.id]);
      expect(res.body.updated).toEqual([a.id]);
      expect((await regFor(ev.id, a.id)).status).toBe('checked_in');
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS evadd_race_${suffix} ON event_registrations; DROP FUNCTION IF EXISTS evadd_race_${suffix}();`));
    }
  });

  it('does not count waitlisted registrations towards overCapacity', async () => {
    const ev = await mkEvent({ max: 1 });
    const a = await mkAthlete(orgA);
    const w = await mkAthlete(orgA);
    await db.insert(eventRegistrations).values({
      eventId: ev.id, userId: w.id, userFullNameSnapshot: w.fullName, status: 'waitlisted', registrationNumber: 1, waitlistPosition: 1,
    } as any);
    const res = await bulkAdd(ev.id, { userIds: [a.id] });
    expect(res.body.added).toEqual([a.id]);
    expect(res.body.overCapacity).toBeUndefined();
  });

  it('rejects athletes of another organization while adding the valid ones in the same batch', async () => {
    const ev = await mkEvent();
    const ok = await mkAthlete(orgA);
    const foreign = await mkAthlete(orgB);
    const stranger = await mkUser('stranger');
    const res = await bulkAdd(ev.id, { userIds: [ok.id, foreign.id, stranger.id, coachA.id] });
    expect(res.status).toBe(200);
    expect(res.body.added).toEqual([ok.id]);
    expect(res.body.rejected).toEqual(
      expect.arrayContaining([
        { userId: foreign.id, reason: 'not_in_organization' },
        { userId: stranger.id, reason: 'not_in_organization' },
        { userId: coachA.id, reason: 'not_in_organization' },
      ]),
    );
    expect(res.body.rejected).toHaveLength(3);
    expect(await regFor(ev.id, foreign.id)).toBeUndefined();
    expect(await regFor(ev.id, coachA.id)).toBeUndefined();
  });

  it('adds athletes whose account is not activated and rejects soft-deleted ones', async () => {
    const ev = await mkEvent();
    const inactive = await mkAthlete(orgA, { isActive: false });
    const deleted = await mkAthlete(orgA, { deletedAt: new Date() });
    const res = await bulkAdd(ev.id, { userIds: [inactive.id, deleted.id] });
    expect(res.status).toBe(200);
    expect(res.body.added).toEqual([inactive.id]);
    expect(res.body.rejected).toEqual([{ userId: deleted.id, reason: 'not_in_organization' }]);
    expect(await regFor(ev.id, inactive.id)).toBeDefined();
    expect(await regFor(ev.id, deleted.id)).toBeUndefined();
  });

  it('handles duplicate ids in userIds', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const res = await bulkAdd(ev.id, { userIds: [a.id, a.id, a.id] });
    expect(res.status).toBe(200);
    expect(res.body.added).toEqual([a.id]);
    const rows = await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, ev.id));
    expect(rows).toHaveLength(1);
  });

  it('moves pending, waitlisted, declined, cancelled and approved registrations to checked_in and counts them as updated', async () => {
    const ev = await mkEvent();
    const statuses = ['pending', 'waitlisted', 'declined', 'cancelled', 'approved'] as const;
    const athletes: any[] = [];
    let n = 100;
    for (const status of statuses) {
      const a = await mkAthlete(orgA);
      athletes.push(a);
      n += 1;
      await db.insert(eventRegistrations).values({
        eventId: ev.id,
        userId: a.id,
        userFullNameSnapshot: a.fullName,
        status,
        registrationNumber: n,
        waitlistPosition: status === 'waitlisted' ? 1 : null,
        declinedAt: status === 'declined' ? new Date() : null,
        declinedBy: status === 'declined' ? orgAdminA.id : null,
        declineReason: status === 'declined' ? 'nope' : null,
      } as any);
    }
    const res = await bulkAdd(ev.id, { userIds: athletes.map((a) => a.id) });
    expect(res.status).toBe(200);
    expect(res.body.added).toEqual([]);
    expect(res.body.updated.sort()).toEqual(athletes.map((a) => a.id).sort());
    for (const a of athletes) {
      const r = await regFor(ev.id, a.id);
      expect(r.status).toBe('checked_in');
      expect(r.checkedInBy).toBe(coachA.id);
      expect(r.approvedBy).toBe(coachA.id);
      expect(r.declinedAt).toBeNull();
      expect(r.declineReason).toBeNull();
      expect(r.waitlistPosition).toBeNull();
    }
  });

  it('moves existing registrations to approved when checkIn is false', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    await db.insert(eventRegistrations).values({
      eventId: ev.id, userId: a.id, userFullNameSnapshot: a.fullName, status: 'pending', registrationNumber: 1,
    } as any);
    const res = await bulkAdd(ev.id, { userIds: [a.id], checkIn: false });
    expect(res.body.updated).toEqual([a.id]);
    expect((await regFor(ev.id, a.id)).status).toBe('approved');
  });

  it('leaves checked_in and completed registrations alone', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const b = await mkAthlete(orgA);
    const when = new Date('2026-01-01T00:00:00Z');
    await db.insert(eventRegistrations).values([
      { eventId: ev.id, userId: a.id, userFullNameSnapshot: a.fullName, status: 'checked_in', registrationNumber: 1, checkedInAt: when, checkedInBy: orgAdminA.id, adminNotes: 'orig' },
      { eventId: ev.id, userId: b.id, userFullNameSnapshot: b.fullName, status: 'completed', registrationNumber: 2, adminNotes: 'orig' },
    ] as any);
    const res = await bulkAdd(ev.id, { userIds: [a.id, b.id] });
    expect(res.status).toBe(200);
    expect(res.body.alreadyOnEvent.sort()).toEqual([a.id, b.id].sort());
    expect(res.body.added).toEqual([]);
    expect(res.body.updated).toEqual([]);
    const ra = await regFor(ev.id, a.id);
    expect(ra.checkedInBy).toBe(orgAdminA.id);
    expect(ra.checkedInAt?.getTime()).toBe(when.getTime());
    expect(ra.adminNotes).toBe('orig');
    expect((await regFor(ev.id, b.id)).status).toBe('completed');
  });

  it('is idempotent: a second identical call reports alreadyOnEvent', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const first = await bulkAdd(ev.id, { userIds: [a.id] });
    expect(first.body.added).toEqual([a.id]);
    const second = await bulkAdd(ev.id, { userIds: [a.id] });
    expect(second.status).toBe(200);
    expect(second.body.added).toEqual([]);
    expect(second.body.alreadyOnEvent).toEqual([a.id]);
    const rows = await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, ev.id));
    expect(rows).toHaveLength(1);
  });

  it('rejects a cancelled event with 409 and allows draft, published and completed events', async () => {
    const a = await mkAthlete(orgA);
    const cancelled = await mkEvent({ status: 'cancelled' });
    const res = await bulkAdd(cancelled.id, { userIds: [a.id] });
    expect(res.status).toBe(409);
    expect(typeof res.body.message).toBe('string');
    expect(await regFor(cancelled.id, a.id)).toBeUndefined();
    for (const status of ['draft', 'published', 'completed']) {
      const ev = await mkEvent({ status });
      const ok = await bulkAdd(ev.id, { userIds: [a.id] });
      expect(ok.status, status).toBe(200);
      expect(ok.body.added).toEqual([a.id]);
    }
  });

  it('ignores capacity but flags overCapacity', async () => {
    const ev = await mkEvent({ max: 1 });
    const a = await mkAthlete(orgA);
    const b = await mkAthlete(orgA);
    const res = await bulkAdd(ev.id, { userIds: [a.id, b.id] });
    expect(res.status).toBe(200);
    expect(res.body.added.sort()).toEqual([a.id, b.id].sort());
    expect(res.body.overCapacity).toBe(true);
    expect((await regFor(ev.id, b.id)).status).toBe('checked_in');

    const roomy = await mkEvent({ max: 5 });
    const ok = await bulkAdd(roomy.id, { userIds: [a.id] });
    expect(ok.body.overCapacity).toBeUndefined();
  });

  it('judges capacity by the limit read under the lock, not the one read before the transaction', async () => {
    const ev = await mkEvent({ max: 1 });
    const a = await mkAthlete(orgA);
    const b = await mkAthlete(orgA);
    const real = await storage.getEvent(ev.id);
    const stale = vi.spyOn(storage, 'getEvent').mockResolvedValueOnce({ ...real!, maxRegistrations: null } as any);
    const result = await new EventRegistrationService(storage as any).addAthletesDirectly(ev.id, [a.id, b.id], { id: a.id, name: 'Coach' });
    stale.mockRestore();
    expect(result.overCapacity).toBe(true);
  });

  it('throws EventNotFoundError (answered 404) for an event that does not exist', async () => {
    await expect(
      new EventRegistrationService(storage as any).addAthletesDirectly('00000000-0000-4000-8000-000000000000', [], { id: 'x', name: 'Coach' })
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it('validates the body: more than 200 ids, empty, malformed, non-uuid, bad checkIn', async () => {
    const ev = await mkEvent();
    const many = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect((await bulkAdd(ev.id, { userIds: many })).status).toBe(400);
    expect((await bulkAdd(ev.id, { userIds: [] })).status).toBe(400);
    expect((await bulkAdd(ev.id, {})).status).toBe(400);
    expect((await bulkAdd(ev.id, { userIds: 'abc' })).status).toBe(400);
    expect((await bulkAdd(ev.id, { userIds: ['not-a-uuid'] })).status).toBe(400);
    expect((await bulkAdd(ev.id, { userIds: [athleteCaller.id], checkIn: 'yes' })).status).toBe(400);
    const rows = await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, ev.id));
    expect(rows).toHaveLength(0);
  });

  it('writes one audit log entry for the batch using an action the audit_logs constraint allows', async () => {
    const ev = await mkEvent();
    const athletes = [await mkAthlete(orgA), await mkAthlete(orgA)];
    await bulkAdd(ev.id, { userIds: athletes.map((a) => a.id) });
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, ev.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('event_registration_created');
    expect(rows[0].userId).toBe(coachA.id);
    expect(JSON.parse(rows[0].details!).added.sort()).toEqual(athletes.map((a) => a.id).sort());
  });

  it('sends no email, push or measurement notification', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    const res = await bulkAdd(ev.id, { userIds: [a.id] });
    expect(res.status).toBe(200);
    expect(spies.length).toBeGreaterThan(5);
    expect(notificationCalls).toEqual([]);
  });

  it('counts a whole batch as a single limiter hit', async () => {
    const ev = await mkEvent();
    const athletes = await Promise.all([mkAthlete(orgA), mkAthlete(orgA), mkAthlete(orgA)]);
    const remaining = (res: request.Response) => {
      const m = /remaining=(\d+)/.exec(String(res.headers['ratelimit']));
      expect(m, `RateLimit header: ${res.headers['ratelimit']}`).not.toBeNull();
      return Number(m![1]);
    };
    const first = await bulkAdd(ev.id, { userIds: [athletes[0].id] });
    const second = await bulkAdd(ev.id, { userIds: athletes.map((a) => a.id) });
    expect(second.status).toBe(200);
    expect(remaining(first) - remaining(second)).toBe(1);
  });

  it('shows the added athletes on the roster and in their own my-registrations / my-registration', async () => {
    const ev = await mkEvent();
    const a = await mkAthlete(orgA);
    await bulkAdd(ev.id, { userIds: [a.id] });

    const roster = await request(app).get(`/api/events/${ev.id}/registrations`).set('Cookie', cookies.coachA);
    expect(roster.status).toBe(200);
    expect(roster.body.find((r: any) => r.userId === a.id)?.status).toBe('checked_in');

    const athleteCookie = await login(a.username);
    const mine = await request(app).get('/api/events/my-registrations').set('Cookie', athleteCookie);
    expect(mine.status).toBe(200);
    expect(mine.body.some((r: any) => r.eventId === ev.id && r.status === 'checked_in')).toBe(true);
    const one = await request(app).get(`/api/events/${ev.id}/my-registration`).set('Cookie', athleteCookie);
    expect(one.status).toBe(200);
    expect(one.body.status).toBe('checked_in');
  });
});
