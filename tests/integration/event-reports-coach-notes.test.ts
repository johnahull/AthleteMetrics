/** GET /api/events/:eventId/reports must not return coachNotes to anyone who is not a writer in the report's own organization. */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { registerEventReportRoutes } from '../../packages/api/routes/event-report-routes';
import { events, organizations, reports, userOrganizations, users } from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/services/email-service', () => ({ emailService: {}, EmailService: vi.fn().mockImplementation(() => ({})) }));

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SECRET = 'SECRET-EVENT-NOTE';
const u: Record<string, any> = {};
let orgA: string;
let orgB: string;
let orgEvent: string;
let publicEvent: string;
let app: Express;

describe('event reports list and coachNotes', () => {
  beforeAll(async () => {
    [{ id: orgA }] = await db.insert(organizations).values({ name: `EvtNotes A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `EvtNotes B ${suffix}` }).returning();
    for (const tag of ['coach', 'creator']) {
      [u[tag]] = await db.insert(users).values({
        username: `evtnotes-${tag}-${suffix}`, emails: [`evtnotes-${tag}-${suffix}@test.com`], password: 'x',
        firstName: 'E', lastName: tag, fullName: `E ${tag}`, birthDate: '1990-01-01',
      } as any).returning();
    }
    await db.insert(userOrganizations).values([
      { userId: u.coach.id, organizationId: orgA, role: 'coach' },
      { userId: u.creator.id, organizationId: orgB, role: 'athlete' }, // an athlete elsewhere
    ] as any);
    const mk = async (organizationId: string | null, name: string, createdBy: string) =>
      (await db.insert(events).values({ organizationId, name: `${name} ${suffix}`, startDate: new Date('2026-05-01T10:00:00Z'), createdBy, visibility: 'public' } as any).returning({ id: events.id }))[0].id;
    orgEvent = await mk(orgA, 'org event', u.coach.id);
    publicEvent = await mk(null, 'public event', u.creator.id);
    for (const eventId of [orgEvent, publicEvent]) {
      await db.insert(reports).values({
        organizationId: orgA, name: `EvtNotes ${suffix}`, reportType: 'individual', config: { athleteId: u.coach.id, eventId },
        coachNotes: { goals: SECRET },
      } as any);
    }
    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const user = Object.values(u).find((x: any) => x.id === req.get('x-test-user')) as any;
      req.session = { user: user ? { id: user.id, username: user.username, role: 'athlete', isSiteAdmin: false } : undefined };
      next();
    });
    registerEventReportRoutes(app);
  });

  afterAll(async () => {
    await db.delete(reports).where(eq(reports.name, `EvtNotes ${suffix}`));
    await db.delete(events).where(inArray(events.id, [orgEvent, publicEvent]));
    await purgeTestRows({ usernameLike: [`evtnotes-%-${suffix}`], userIds: Object.values(u).map((r: any) => r.id), orgIds: [orgA, orgB] });
  });

  it('a coach of the report org keeps the notes', async () => {
    const res = await request(app).get(`/api/events/${orgEvent}/reports`).set('x-test-user', u.coach.id);
    expect(res.status).toBe(200);
    expect(res.body[0].coachNotes).toEqual({ goals: SECRET });
  });

  it('the creator of an organization-less event never gets notes of another organization report', async () => {
    const res = await request(app).get(`/api/events/${publicEvent}/reports`).set('x-test-user', u.creator.id);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });
});

