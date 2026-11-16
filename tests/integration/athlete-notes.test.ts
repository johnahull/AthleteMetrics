/**
 * Integration tests: athlete coaching notes (AM-FEAT-025, PR1 backend).
 *
 * Visibility and edits are decided by the caller's role in the NOTE's organization (getOrgRole), never the
 * session role. Notes are about a child: athletes never see them, deletion / export / merge of the athlete reach
 * them, and the LLM export never includes them.
 *
 * Run: npm run test:run -- tests/integration/athlete-notes.test.ts
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
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
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations } from '@shared/schema/tables/membership';
import { athleteNotes, events, coppaAuditLog, dataDeletionRequests } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { CoppaDeletionService } from '../../packages/api/services/coppa-deletion-service';
import { CoppaExportService } from '../../packages/api/services/coppa-export-service';
import { ProfileMergeService } from '../../packages/api/services/profile-merge-service';
import { buildAthleteLlmExport } from '../../packages/api/services/llm-export-service';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({ setupVite: vi.fn().mockResolvedValue(undefined), serveStatic: vi.fn() }));
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendInvitation: vi.fn().mockResolvedValue(true),
    sendWelcome: vi.fn().mockResolvedValue(true),
    sendPasswordReset: vi.fn().mockResolvedValue(true),
    sendDeletionRequestConfirmation: vi.fn().mockResolvedValue(true),
    sendDeletionCompletedNotification: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({
    sendDeletionRequestConfirmation: vi.fn().mockResolvedValue(true),
    sendDeletionCompletedNotification: vi.fn().mockResolvedValue(true),
  })),
}));

import { registerRoutes } from '../../packages/api/routes';

const PREFIX = 'ant_';
const PASSWORD = 'CoachPassword1!';
const SECRET = 'SECRET-ATHLETE-NOTE-BODY';
const uid = () => crypto.randomBytes(4).toString('hex');
const ts = Date.now();

let app: Express;
const orgIds: string[] = [];
const userIds: string[] = [];
const eventIds: string[] = [];
let orgA: string;
let orgB: string;
const u: Record<string, any> = {};
const cookies: Record<string, string> = {};

const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
  const id = uid();
  const [row] = await db.insert(users).values({
    birthDate: '1990-01-01', username: `${PREFIX}${tag}_${id}`, firstName: 'Test', lastName: tag, fullName: `Test ${tag}`,
    emails: [`${PREFIX}${tag}_${id}@example.com`], password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
    isEmailVerified: true, isSiteAdmin: false, ...extra,
  } as any).returning();
  userIds.push(row.id);
  return row;
};
const mkOrg = async (label: string) => {
  const [row] = await db.insert(organizations).values({ name: `${PREFIX}${label}_${ts}_${uid()}`, isActive: true } as any).returning({ id: organizations.id });
  orgIds.push(row.id);
  return row.id;
};
const join = (userId: string, organizationId: string, role: string) =>
  db.insert(userOrganizations).values({ userId, organizationId, role } as any);
const mkEvent = async (organizationId: string | null) => {
  const [row] = await db.insert(events).values({
    name: `${PREFIX}event_${uid()}`, organizationId, startDate: new Date('2026-10-01T00:00:00Z'), createdBy: u.coach.id,
  } as any).returning({ id: events.id });
  eventIds.push(row.id);
  return row.id;
};
const as = async (who: any) => {
  if (!cookies[who.id]) {
    const res = await request(app).post('/api/auth/login').send({ username: who.username, password: PASSWORD });
    if (res.status !== 200) throw new Error(`login failed (${res.status})`);
    cookies[who.id] = res.headers['set-cookie'][0] as string;
  }
  return cookies[who.id];
};
const get = async (who: any, athleteId: string) => request(app).get(`/api/athletes/${athleteId}/notes`).set('Cookie', await as(who));
const post = async (who: any, athleteId: string, body: unknown) =>
  request(app).post(`/api/athletes/${athleteId}/notes`).set('Cookie', await as(who)).send(body as any);
const patch = async (who: any, id: string, body: unknown) =>
  request(app).patch(`/api/athlete-notes/${id}`).set('Cookie', await as(who)).send(body as any);
const del = async (who: any, id: string) => request(app).delete(`/api/athlete-notes/${id}`).set('Cookie', await as(who));
const stored = async (id: string) => (await db.select().from(athleteNotes).where(eq(athleteNotes.id, id)))[0];
const mkNote = async (organizationId: string, athleteId: string, authorId: string | null, extra: Record<string, unknown> = {}) =>
  (await db.insert(athleteNotes).values({
    organizationId, athleteId, authorId, observedOn: '2026-11-01', body: `${PREFIX}note ${SECRET}`, ...extra,
  } as any).returning())[0];
const valid = (extra: Record<string, unknown> = {}) => ({ organizationId: orgB, body: `${PREFIX}${SECRET}`, observedOn: '2026-11-01', ...extra });

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run integration tests.');
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  // "a" sorts first: it is the session (primary) organization of mixed
  orgA = await mkOrg('a_org');
  orgB = await mkOrg('b_org');
  for (const tag of ['coach', 'coach2', 'orgadmin', 'athlete', 'otherCoach', 'mixed', 'demoted']) u[tag] = await mkUser(tag);
  u.siteadmin = await mkUser('siteadmin', { isSiteAdmin: true });
  await join(u.coach.id, orgB, 'coach');
  await join(u.coach2.id, orgB, 'coach');
  await join(u.orgadmin.id, orgB, 'org_admin');
  await join(u.athlete.id, orgB, 'athlete');
  await join(u.otherCoach.id, orgA, 'coach');
  await join(u.mixed.id, orgA, 'coach'); // coach in the primary org ...
  await join(u.mixed.id, orgB, 'athlete'); // ... but an athlete in the note's org
  await join(u.demoted.id, orgB, 'coach');
});

afterAll(async () => {
  await db.delete(events).where(inArray(events.id, eventIds)).catch(() => {});
  await purgeTestRows({ usernameLike: [`${PREFIX}%`], userIds, orgIds });
});

describe('POST /api/athletes/:athleteId/notes and GET', () => {
  it('a coach of the org creates, reads, edits and deletes a note', async () => {
    const eventId = await mkEvent(orgB);
    const created = await post(u.coach, u.athlete.id, valid({ category: 'injury', flagged: true, eventId }));
    expect(created.status).toBe(201);
    expect(created.body.note).toMatchObject({
      athleteId: u.athlete.id, organizationId: orgB, authorId: u.coach.id, category: 'injury', flagged: true, observedOn: '2026-11-01', eventId,
    });
    const id = created.body.note.id;

    const list = await get(u.coach, u.athlete.id);
    expect(list.status).toBe(200);
    const row = list.body.notes.find((n: any) => n.id === id);
    expect(row).toMatchObject({ organizationName: expect.stringContaining(PREFIX), authorName: 'Test coach', eventName: expect.stringContaining(`${PREFIX}event_`) });

    const edited = await patch(u.coach, id, { body: 'edited body', flagged: false, category: null });
    expect(edited.status).toBe(200);
    expect(await stored(id)).toMatchObject({ body: 'edited body', flagged: false, category: null });

    expect((await del(u.coach, id)).status).toBe(204);
    expect(await stored(id)).toBeUndefined();
  });

  it('rejects an invalid body: missing observedOn, empty body, unknown key', async () => {
    expect((await post(u.coach, u.athlete.id, { organizationId: orgB, body: 'x' })).status).toBe(400);
    expect((await post(u.coach, u.athlete.id, valid({ body: '  ' }))).status).toBe(400);
    expect((await post(u.coach, u.athlete.id, valid({ authorId: u.coach2.id }))).status).toBe(400);
    expect((await patch(u.coach, (await mkNote(orgB, u.athlete.id, u.coach.id)).id, {})).status).toBe(400);
  });

  it('accepts a note dated in the past', async () => {
    const res = await post(u.coach, u.athlete.id, valid({ observedOn: '2020-02-29' }));
    expect(res.status).toBe(201);
    expect(res.body.note.observedOn).toBe('2020-02-29');
  });

  it('the athlete, a coach of another org and a coach-here/athlete-there user all get 404 on GET and POST', async () => {
    await mkNote(orgB, u.athlete.id, u.coach.id);
    for (const who of [u.athlete, u.otherCoach, u.mixed]) {
      const res = await get(who, u.athlete.id);
      expect(res.status, who.username).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
      expect((await post(who, u.athlete.id, valid())).status, who.username).toBe(404);
    }
  });

  it('POST rejects an athlete who is not a member of the organization', async () => {
    expect((await post(u.otherCoach, u.athlete.id, valid({ organizationId: orgA }))).status).toBe(404);
  });

  it('GET returns only the notes of orgs where the viewer is a writer, and 401 without a session', async () => {
    const athlete = await mkUser('multi');
    await join(athlete.id, orgA, 'athlete');
    await join(athlete.id, orgB, 'athlete');
    const inA = await mkNote(orgA, athlete.id, u.otherCoach.id);
    const inB = await mkNote(orgB, athlete.id, u.coach.id);
    const ids = async (who: any) => (await get(who, athlete.id)).body.notes.map((n: any) => n.id);
    expect(await ids(u.coach)).toEqual([inB.id]);
    expect(await ids(u.otherCoach)).toEqual([inA.id]);
    expect((await ids(u.siteadmin)).sort()).toEqual([inA.id, inB.id].sort());
    expect((await request(app).get(`/api/athletes/${athlete.id}/notes`)).status).toBe(401);
  });

  it('orders flagged first, then observedOn desc, then created_at desc', async () => {
    const athlete = await mkUser('order');
    await join(athlete.id, orgB, 'athlete');
    const mk = (body: string, extra: Record<string, unknown>) => mkNote(orgB, athlete.id, u.coach.id, { body, ...extra });
    const old = await mk('old', { observedOn: '2026-01-01' });
    const newer = await mk('newer', { observedOn: '2026-03-01' });
    const flaggedOld = await mk('flagged-old', { observedOn: '2025-01-01', flagged: true });
    const sameDayFirst = await mk('same-day-first', { observedOn: '2026-02-01', createdAt: new Date('2026-02-01T10:00:00Z') });
    const sameDayLast = await mk('same-day-last', { observedOn: '2026-02-01', createdAt: new Date('2026-02-01T11:00:00Z') });
    const ids = (await get(u.coach, athlete.id)).body.notes.map((n: any) => n.id);
    expect(ids).toEqual([flaggedOld.id, newer.id, sameDayLast.id, sameDayFirst.id, old.id]);
  });

  it('GET lists writableOrganizations: the athlete\'s current organizations where the viewer is a writer, with names', async () => {
    const athlete = await mkUser('writable');
    await join(athlete.id, orgA, 'athlete');
    await join(athlete.id, orgB, 'athlete');
    const writable = async (who: any) => (await get(who, athlete.id)).body.writableOrganizations;
    const ids = (list: Array<{ id: string }>) => list.map((o) => o.id).sort();

    expect(ids(await writable(u.coach))).toEqual([orgB]);
    expect(ids(await writable(u.otherCoach))).toEqual([orgA]);
    expect(ids(await writable(u.siteadmin))).toEqual([orgA, orgB].sort());
    const [first] = await writable(u.coach);
    expect(first).toEqual({ id: orgB, name: expect.any(String) });
  });

  it('writableOrganizations leaves out an organization the athlete has left (history stays readable, but nothing can be added)', async () => {
    const athlete = await mkUser('writable-left');
    await join(athlete.id, orgB, 'athlete');
    await mkNote(orgB, athlete.id, u.coach.id);
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete.id));
    const res = await get(u.coach, athlete.id);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.writableOrganizations).toEqual([]);
  });

  it('a site admin asking about an athlete id that does not exist gets 404, not an empty list', async () => {
    const res = await get(u.siteadmin, '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect((await get(u.siteadmin, 'not-a-uuid')).status).toBe(404);
  });

  it('notes stay readable as history after the athlete leaves the organization', async () => {
    const athlete = await mkUser('left');
    await join(athlete.id, orgB, 'athlete');
    const note = await mkNote(orgB, athlete.id, u.coach.id);
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete.id));
    const res = await get(u.coach, athlete.id);
    expect(res.status).toBe(200);
    expect(res.body.notes.map((n: any) => n.id)).toEqual([note.id]);
  });
});

describe('event link', () => {
  it('rejects an event of another org or with no org on POST and PATCH; accepts one of the same org', async () => {
    const other = await mkEvent(orgA);
    const noOrg = await mkEvent(null);
    for (const eventId of [other, noOrg]) {
      expect((await post(u.coach, u.athlete.id, valid({ eventId }))).status).toBe(400);
      const note = await mkNote(orgB, u.athlete.id, u.coach.id);
      expect((await patch(u.coach, note.id, { eventId })).status).toBe(400);
      expect((await stored(note.id)).eventId).toBeNull();
    }
    const same = await mkEvent(orgB);
    const note = await mkNote(orgB, u.athlete.id, u.coach.id);
    expect((await patch(u.coach, note.id, { eventId: same })).status).toBe(200);
    expect((await stored(note.id)).eventId).toBe(same);
  });
});

describe('PATCH and DELETE /api/athlete-notes/:id', () => {
  it('a non-author coach: PATCH 403 and DELETE 403, note unchanged', async () => {
    const note = await mkNote(orgB, u.athlete.id, u.coach.id);
    expect((await patch(u.coach2, note.id, { body: 'hijack' })).status).toBe(403);
    expect((await del(u.coach2, note.id)).status).toBe(403);
    expect((await stored(note.id)).body).toBe(note.body);
  });

  it('a non-author org admin: PATCH 403, DELETE succeeds', async () => {
    const note = await mkNote(orgB, u.athlete.id, u.coach.id);
    expect((await patch(u.orgadmin, note.id, { body: 'x' })).status).toBe(403);
    expect((await del(u.orgadmin, note.id)).status).toBe(204);
    expect(await stored(note.id)).toBeUndefined();
  });

  it('a site admin deletes (but cannot edit someone else\'s note)', async () => {
    const note = await mkNote(orgB, u.athlete.id, u.coach.id);
    expect((await patch(u.siteadmin, note.id, { body: 'x' })).status).toBe(403);
    expect((await del(u.siteadmin, note.id)).status).toBe(204);
  });

  it('an author demoted to athlete can neither edit nor delete (404)', async () => {
    const note = await mkNote(orgB, u.athlete.id, u.demoted.id);
    await db.update(userOrganizations).set({ role: 'athlete' } as any)
      .where(eq(userOrganizations.userId, u.demoted.id));
    expect((await patch(u.demoted, note.id, { body: 'x' })).status).toBe(404);
    expect((await del(u.demoted, note.id)).status).toBe(404);
    expect(await stored(note.id)).toBeDefined();
    await db.update(userOrganizations).set({ role: 'coach' } as any).where(eq(userOrganizations.userId, u.demoted.id));
  });

  it('the athlete, another org\'s coach and an unknown id all get 404', async () => {
    const note = await mkNote(orgB, u.athlete.id, u.coach.id);
    for (const who of [u.athlete, u.otherCoach, u.mixed]) {
      expect((await patch(who, note.id, { body: 'x' })).status, who.username).toBe(404);
      expect((await del(who, note.id)).status, who.username).toBe(404);
    }
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await patch(u.coach, missing, { body: 'x' })).status).toBe(404);
    expect((await del(u.coach, missing)).status).toBe(404);
    expect((await del(u.coach, 'not-a-uuid')).status).toBe(404);
  });

  it('a note whose author is gone (null) can be deleted by an org admin, not edited by anyone', async () => {
    const note = await mkNote(orgB, u.athlete.id, null);
    expect((await patch(u.coach, note.id, { body: 'x' })).status).toBe(403);
    expect((await del(u.coach, note.id)).status).toBe(403);
    expect((await del(u.orgadmin, note.id)).status).toBe(204);
  });
});

describe('deleting people and organizations with notes present', () => {
  it('storage.deleteAthlete and storage.hardDeleteUser succeed and remove the notes', async () => {
    for (const fn of ['deleteAthlete', 'hardDeleteUser'] as const) {
      const athlete = await mkUser(`del${fn}`);
      await join(athlete.id, orgB, 'athlete');
      await mkNote(orgB, athlete.id, u.coach.id);
      await mkNote(orgA, athlete.id, u.otherCoach.id);
      await (storage as any)[fn](athlete.id);
      expect(await db.select().from(athleteNotes).where(eq(athleteNotes.athleteId, athlete.id))).toEqual([]);
    }
  });

  it('deleting the author keeps the note and nulls authorId', async () => {
    const author = await mkUser('author');
    const note = await mkNote(orgB, u.athlete.id, author.id);
    await (storage as any).hardDeleteUser(author.id);
    expect((await stored(note.id)).authorId).toBeNull();
  });

  it('storage.deleteOrganization succeeds and removes the notes', async () => {
    const org = await mkOrg('doomed');
    const athlete = await mkUser('doomedath');
    const note = await mkNote(org, athlete.id, u.coach.id);
    await storage.deleteOrganization(org);
    expect(await stored(note.id)).toBeUndefined();
  });
});

describe('child privacy: COPPA deletion, export, merge, LLM export', () => {
  const child = async (tag: string) => mkUser(tag, { birthDate: '2016-03-01' });

  it('COPPA export includes the athlete notes (every org) and none of another athlete', async () => {
    const x = await child('cx');
    const y = await child('cy');
    await join(x.id, orgA, 'athlete');
    await join(x.id, orgB, 'athlete');
    const n1 = await mkNote(orgA, x.id, u.otherCoach.id);
    const n2 = await mkNote(orgB, x.id, u.coach.id);
    const other = await mkNote(orgB, y.id, u.coach.id);
    const bundle = await (new CoppaExportService() as any).buildExportBundle(x.id);
    expect(bundle.athleteNotes.map((n: any) => n.id).sort()).toEqual([n1.id, n2.id].sort());
    expect(bundle.athleteNotes[0]).toMatchObject({ organizationId: expect.any(String), body: expect.any(String), observedOn: expect.any(String) });
    expect(bundle.athleteNotes.map((n: any) => n.id)).not.toContain(other.id);
  });

  it('COPPA deletion removes the notes in every org (the user row is only soft-deleted) and no one else\'s', async () => {
    const x = await child('dx');
    const y = await child('dy');
    await join(x.id, orgB, 'athlete');
    await mkNote(orgA, x.id, u.otherCoach.id);
    await mkNote(orgB, x.id, u.coach.id);
    const keep = await mkNote(orgB, y.id, u.coach.id);
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: x.id, requestedByEmail: `parent-${uid()}@test.local`, status: 'pending',
    } as any).returning({ id: dataDeletionRequests.id });
    const result = await new CoppaDeletionService().processDeletion(req.id, u.siteadmin.id);
    expect(result.success).toBe(true);
    expect(result.deletedCategories).toContain('athlete_notes (2)');
    expect(await db.select().from(athleteNotes).where(eq(athleteNotes.athleteId, x.id))).toEqual([]);
    expect(await stored(keep.id)).toBeDefined();
    await db.delete(coppaAuditLog).where(eq(coppaAuditLog.athleteUserId, x.id));
    await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.athleteUserId, x.id));
  });

  it('merge re-points the source athlete\'s notes in EVERY org to the target, and nothing else', async () => {
    const src = await mkUser('msrc');
    const dst = await mkUser('mdst');
    const bystander = await mkUser('mby');
    for (const a of [src, dst, bystander]) await join(a.id, orgA, 'athlete');
    await join(src.id, orgB, 'athlete');
    const inA = await mkNote(orgA, src.id, u.otherCoach.id);
    const inB = await mkNote(orgB, src.id, u.coach.id);
    const existing = await mkNote(orgA, dst.id, u.otherCoach.id);
    const by = await mkNote(orgA, bystander.id, u.otherCoach.id);
    const merge = await new ProfileMergeService().mergeProfiles(orgA, src.id, dst.id, u.siteadmin.id);
    expect(merge.summary.athleteNotesTransferred).toBe(2);
    for (const id of [inA.id, inB.id, existing.id]) expect((await stored(id)).athleteId).toBe(dst.id);
    expect((await stored(by.id)).athleteId).toBe(bystander.id);
    expect((await stored(inB.id)).organizationId).toBe(orgB);
  });

  it('the LLM export never includes athlete notes', async () => {
    const athlete = await mkUser('llm');
    await join(athlete.id, orgB, 'athlete');
    await mkNote(orgB, athlete.id, u.coach.id, { body: `LLM-LEAK-CHECK ${SECRET}` });
    for (const format of ['markdown', 'json'] as const) {
      const out = await buildAthleteLlmExport(athlete.id, format, { organizationId: orgB });
      expect(out.content).not.toContain('LLM-LEAK-CHECK');
      expect(out.content).not.toContain(SECRET);
    }
    const all = await buildAthleteLlmExport(athlete.id, 'json', { organizationId: null });
    expect(all.content).not.toContain(SECRET);
  });
});
