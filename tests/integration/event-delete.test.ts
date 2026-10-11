/**
 * Integration tests for DELETE /api/events/:eventId, through HTTP with a real session
 *
 * Covers:
 *   - Org admin of the event's organization deletes it (204) and an audit log is written
 *   - Coach of the event's organization is refused (403)
 *   - Org admin of another organization is refused (403)
 *   - Event without an organization: non-site-admin refused (403), site admin deletes it (204)
 *   - Frozen event is refused (409)
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, events, auditLogs } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

let app: Express;
let orgA: any;
let orgB: any;
const createdUserIds: string[] = [];
const createdEventIds: string[] = [];
const cookies: Record<'orgAdmin' | 'coach' | 'otherOrgAdmin' | 'siteAdmin', string> = {} as any;

// Unique source IP per request so the event mutation limiter (20 per 15 minutes) never trips
let nextIp = 1;
const uniqueIp = () => `10.0.1.${nextIp++}`;

async function createUser(key: string, ts: number, hashed: string, opts: { isSiteAdmin?: boolean; orgId?: string; role?: string }) {
  const [user] = await db.insert(users).values({
    username: `evdel_${key}_${ts}`,
    emails: [`evdel_${key}_${ts}@test.com`],
    password: hashed,
    firstName: 'Event',
    lastName: key,
    fullName: `Event ${key}`,
    isSiteAdmin: opts.isSiteAdmin ?? false,
  }).returning();
  createdUserIds.push(user.id);
  if (opts.orgId && opts.role) {
    await db.insert(userOrganizations).values({ userId: user.id, organizationId: opts.orgId, role: opts.role });
  }
  return user;
}

async function login(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', uniqueIp())
    .send({ username, password: 'TestPass123!' });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

async function createEvent(organizationId: string | null, isFrozen = false) {
  const [event] = await db.insert(events).values({
    organizationId,
    name: `Delete Me ${Date.now()}`,
    startDate: new Date('2026-05-01T00:00:00Z'),
    isFrozen,
  }).returning();
  createdEventIds.push(event.id);
  return event;
}

const del = (eventId: string, cookie: string) =>
  request(app).delete(`/api/events/${eventId}`).set('Cookie', cookie).set('X-Forwarded-For', uniqueIp());

const eventExists = async (eventId: string) =>
  (await db.select({ id: events.id }).from(events).where(eq(events.id, eventId))).length === 1;

beforeAll(async () => {
  app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const ts = Date.now();
  [orgA] = await db.insert(organizations).values({ name: `Event Delete Org A ${ts}`, isActive: true }).returning();
  [orgB] = await db.insert(organizations).values({ name: `Event Delete Org B ${ts}`, isActive: true }).returning();

  const hashed = await bcrypt.hash('TestPass123!', BCRYPT_SALT_ROUNDS);
  const orgAdmin = await createUser('orgadmin', ts, hashed, { orgId: orgA.id, role: 'org_admin' });
  const coach = await createUser('coach', ts, hashed, { orgId: orgA.id, role: 'coach' });
  const otherOrgAdmin = await createUser('otheradmin', ts, hashed, { orgId: orgB.id, role: 'org_admin' });
  const siteAdmin = await createUser('siteadmin', ts, hashed, { isSiteAdmin: true });

  cookies.orgAdmin = await login(orgAdmin.username);
  cookies.coach = await login(coach.username);
  cookies.otherOrgAdmin = await login(otherOrgAdmin.username);
  cookies.siteAdmin = await login(siteAdmin.username);
});

afterEach(async () => {
  if (createdEventIds.length) {
    await db.delete(auditLogs).where(and(eq(auditLogs.resourceType, 'event'), inArray(auditLogs.resourceId, createdEventIds)));
    await db.delete(events).where(inArray(events.id, createdEventIds));
    createdEventIds.length = 0;
  }
});

afterAll(async () => {
  if (createdUserIds.length) {
    await db.delete(userOrganizations).where(inArray(userOrganizations.userId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await db.delete(organizations).where(inArray(organizations.id, [orgA?.id, orgB?.id].filter(Boolean)));
});

describe('DELETE /api/events/:eventId', () => {
  it("lets an org admin of the event's organization delete it and writes an audit log", async () => {
    const event = await createEvent(orgA.id);

    const res = await del(event.id, cookies.orgAdmin);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await eventExists(event.id)).toBe(false);
    const logs = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.action, 'event_deleted'), eq(auditLogs.resourceId, event.id)));
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0].details!)).toMatchObject({ eventName: event.name });
  });

  it("refuses a coach of the event's organization", async () => {
    const event = await createEvent(orgA.id);
    const res = await del(event.id, cookies.coach);
    expect(res.status).toBe(403);
    expect(await eventExists(event.id)).toBe(true);
  });

  it('refuses an org admin of another organization', async () => {
    const event = await createEvent(orgA.id);
    const res = await del(event.id, cookies.otherOrgAdmin);
    expect(res.status).toBe(403);
    expect(await eventExists(event.id)).toBe(true);
  });

  it('refuses a non-site-admin for an event without an organization', async () => {
    const event = await createEvent(null);
    const res = await del(event.id, cookies.orgAdmin);
    expect(res.status).toBe(403);
    expect(await eventExists(event.id)).toBe(true);
  });

  it('lets a site admin delete an event without an organization', async () => {
    const event = await createEvent(null);
    const res = await del(event.id, cookies.siteAdmin);
    expect(res.status).toBe(204);
    expect(await eventExists(event.id)).toBe(false);
  });

  it('refuses a frozen event with 409 and the reason', async () => {
    const event = await createEvent(orgA.id, true);
    const res = await del(event.id, cookies.orgAdmin);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/frozen/i);
    expect(await eventExists(event.id)).toBe(true);
  });
});
