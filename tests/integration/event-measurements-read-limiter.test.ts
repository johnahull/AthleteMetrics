/**
 * AM-FEAT-015: the event measurement READ limiter (GET .../measurements and
 * .../measurements/stats) is keyed per signed-in user, like the mutation limiter.
 * The MQ entry panel refetches both after every save, and a staff working an event
 * from one gym network shares an IP, so a per-IP read limit throttles the session.
 *
 * Only the event measurement routes are mounted (with a stub session), so this
 * isolates that limiter from the app-wide /api limiter.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { registerEventMeasurementsRoutes } from '../../packages/api/routes/event-measurements-routes';
import { events, organizations, userOrganizations, users } from '@shared/schema';

describe('event measurement read limiter', () => {
  let app: Express;
  let orgId: string;
  let eventId: string;
  const staff: any[] = [];

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    [{ id: orgId }] = await db.insert(organizations).values({ name: `Read Limit Org ${suffix}` }).returning();
    for (const tag of ['one', 'two']) {
      const [u] = await db
        .insert(users)
        .values({
          username: `rl-${tag}-${suffix}`,
          emails: [`rl-${tag}-${suffix}@test.com`],
          password: 'x',
          firstName: 'Rl',
          lastName: tag,
          fullName: `Rl ${tag}`,
        } as any)
        .returning();
      staff.push(u);
    }
    await db.insert(userOrganizations).values(staff.map((u) => ({ userId: u.id, organizationId: orgId, role: 'coach' })) as any);
    [{ id: eventId }] = await db
      .insert(events)
      .values({ organizationId: orgId, name: 'Read Limit Event', startDate: new Date('2026-05-01T10:00:00Z') } as any)
      .returning({ id: events.id });

    app = express();
    app.use(express.json());
    // Stub session: the signed-in user is chosen per request
    app.use((req: any, _res, next) => {
      const u = staff.find((s) => s.id === req.get('x-test-user'));
      req.session = { user: u ? { id: u.id, username: u.username, role: 'coach', isSiteAdmin: false } : undefined };
      next();
    });
    registerEventMeasurementsRoutes(app);
  });

  afterAll(async () => {
    await db.delete(events).where(eq(events.id, eventId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, staff.map((u) => u.id)));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('two staff on one IP, each with a 25-save session of refetches, are not rate limited', async () => {
    const statuses: number[] = [];
    for (const u of staff) {
      // page load + 25 saves, each followed by a refetch of measurements and stats
      for (let i = 0; i < 26; i++) {
        for (const path of [`/api/events/${eventId}/measurements`, `/api/events/${eventId}/measurements/stats`]) {
          statuses.push((await request(app).get(path).set('x-test-user', u.id)).status);
        }
      }
    }
    expect(statuses).toHaveLength(104);
    expect(statuses.filter((s) => s === 429)).toEqual([]);
    expect(statuses.every((s) => s === 200)).toBe(true);
  }, 60000);
});
