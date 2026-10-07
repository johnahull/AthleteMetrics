/**
 * Photo (OCR) import: athlete lookup and creation are scoped to the
 * organization the import is for.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { storage } from '../../packages/api/storage';
import { db } from '../../packages/api/db';
import { users, measurements, userOrganizations } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import type { Organization, User } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { ocrService } from '../../packages/api/ocr/ocr-service';

const PASSWORD = 'TestPass123!';

function ocrRows(rows: Array<{ firstName: string; lastName: string; value?: string }>) {
  return {
    text: 'mock',
    confidence: 95,
    warnings: [],
    extractedData: rows.map((r) => ({
      firstName: r.firstName,
      lastName: r.lastName,
      metric: 'VERTICAL_JUMP',
      value: r.value ?? '30',
      date: '2025-01-15',
      confidence: 95,
      rawText: `${r.firstName} ${r.lastName} ${r.value ?? '30'}`,
    })),
  };
}

describe('Photo import organization scoping', () => {
  let app: express.Express;
  let orgA: Organization;
  let orgB: Organization;
  let coachA: User;
  let siteAdmin: User;
  let athleteA: User;
  let athleteB: User;
  let similarB: User;
  let agentCoachA: ReturnType<typeof request.agent>;
  let agentSiteAdmin: ReturnType<typeof request.agent>;
  const createdUserIds: string[] = [];
  const ts = Date.now();
  const sameFirst = `Pat${ts}`;
  const sameLast = 'Scoped';

  const mkUser = async (username: string, first: string, last: string, extra: Partial<User> = {}) => {
    const u = await storage.createUser({
      username,
      password: PASSWORD,
      emails: [`${username}@test.com`],
      firstName: first,
      lastName: last,
      ...extra,
    } as any);
    createdUserIds.push(u.id);
    return u;
  };

  const postPhoto = (agent: ReturnType<typeof request.agent>, options: Record<string, unknown>) =>
    agent
      .post('/api/import/photo')
      .field('options', JSON.stringify(options))
      .attach('file', Buffer.from('fake'), { filename: 'sheet.png', contentType: 'image/png' });

  const measurementCount = async (userId: string) =>
    (await storage.getMeasurements({ userId })).length;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    orgA = await storage.createOrganization({ name: `Photo Scope A ${ts}`, description: 'a' });
    orgB = await storage.createOrganization({ name: `Photo Scope B ${ts}`, description: 'b' });

    coachA = await mkUser(`photocoacha${ts}`, 'Coach', 'A');
    await storage.addUserToOrganization(coachA.id, orgA.id, 'coach');

    siteAdmin = await mkUser(`photosadmin${ts}`, 'Site', 'Admin', { isSiteAdmin: true });

    athleteA = await mkUser(`photoathletea${ts}`, sameFirst, sameLast, { role: 'athlete' });
    await storage.addUserToOrganization(athleteA.id, orgA.id, 'athlete');
    athleteB = await mkUser(`photoathleteb${ts}`, sameFirst, sameLast, { role: 'athlete' });
    await storage.addUserToOrganization(athleteB.id, orgB.id, 'athlete');

    similarB = await mkUser(`photosimilarb${ts}`, `Sam${ts}`, 'Smithson', { role: 'athlete' });
    await storage.addUserToOrganization(similarB.id, orgB.id, 'athlete');

    agentCoachA = request.agent(app);
    await agentCoachA.post('/api/auth/login').send({ username: coachA.username, password: PASSWORD }).expect(200);
    agentSiteAdmin = request.agent(app);
    await agentSiteAdmin.post('/api/auth/login').send({ username: siteAdmin.username, password: PASSWORD }).expect(200);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    // deleteUser / deleteOrganization refuse while measurements or memberships exist and the
    // failures are swallowed below; a leftover org keeps its organization_metrics rows and
    // breaks migration 0145's "with no organizations" test, so remove these first.
    try { await db.delete(measurements).where(inArray(measurements.userId, createdUserIds)); } catch { /* ignore */ }
    try { await db.delete(userOrganizations).where(inArray(userOrganizations.organizationId, [orgA.id, orgB.id])); } catch { /* ignore */ }
    for (const id of createdUserIds) {
      try { await storage.deleteUser(id); } catch { /* ignore */ }
    }
    try { await storage.deleteOrganization(orgA.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(orgB.id); } catch { /* ignore */ }
  });

  it('writes the reading only to the same-named athlete in the selected organization', async () => {
    vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue(
      ocrRows([{ firstName: sameFirst, lastName: sameLast }]) as any,
    );
    const beforeA = await measurementCount(athleteA.id);
    const beforeB = await measurementCount(athleteB.id);

    const res = await postPhoto(agentCoachA, { organizationId: orgA.id, measurementMode: 'match_only' });

    expect(res.status).toBe(200);
    expect(res.body.results.successful).toBe(1);
    expect(await measurementCount(athleteA.id)).toBe(beforeA + 1);
    expect(await measurementCount(athleteB.id)).toBe(beforeB);
  });

  it('uses the caller\'s own organization when no organization is specified', async () => {
    vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue(
      ocrRows([{ firstName: sameFirst, lastName: sameLast }]) as any,
    );
    const beforeA = await measurementCount(athleteA.id);
    const beforeB = await measurementCount(athleteB.id);

    const res = await postPhoto(agentCoachA, { measurementMode: 'match_only' });

    expect(res.status).toBe(200);
    expect(await measurementCount(athleteA.id)).toBe(beforeA + 1);
    expect(await measurementCount(athleteB.id)).toBe(beforeB);
  });

  it('does not select a partially matching athlete from another organization', async () => {
    vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue(
      ocrRows([{ firstName: `Sam${ts}`, lastName: 'Smith' }]) as any,
    );
    const before = await measurementCount(similarB.id);

    const res = await postPhoto(agentCoachA, { organizationId: orgA.id, measurementMode: 'match_only' });

    expect(res.status).toBe(200);
    expect(res.body.results.successful).toBe(0);
    expect(res.body.results.failed).toBe(1);
    expect(await measurementCount(similarB.id)).toBe(before);
  });

  it('creates new athletes inside the selected organization and matches them on a repeat import', async () => {
    const first = `Newbie${ts}`;
    vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue(
      ocrRows([{ firstName: first, lastName: 'Created' }]) as any,
    );

    const res1 = await postPhoto(agentCoachA, { organizationId: orgA.id, measurementMode: 'create_athletes' });
    expect(res1.status).toBe(200);
    expect(res1.body.results.createdAthletes).toHaveLength(1);
    const newId = res1.body.results.createdAthletes[0].id as string;
    createdUserIds.push(newId);

    const orgAAthletes = await storage.getAthletes({ organizationId: orgA.id });
    expect(orgAAthletes.some((a) => a.id === newId)).toBe(true);
    const orgBAthletes = await storage.getAthletes({ organizationId: orgB.id });
    expect(orgBAthletes.some((a) => a.id === newId)).toBe(false);

    const res2 = await postPhoto(agentCoachA, { organizationId: orgA.id, measurementMode: 'create_athletes' });
    expect(res2.status).toBe(200);
    expect(res2.body.results.createdAthletes ?? []).toHaveLength(0);
    expect(res2.body.results.successful).toBe(1);

    const matches = await db.select().from(users).where(eq(users.firstName, first));
    expect(matches).toHaveLength(1);
    expect(await measurementCount(newId)).toBe(2);
  });

  it('rejects an import into an organization the coach does not belong to', async () => {
    const spy = vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue(
      ocrRows([{ firstName: sameFirst, lastName: sameLast }]) as any,
    );
    const beforeB = await measurementCount(athleteB.id);

    const res = await postPhoto(agentCoachA, { organizationId: orgB.id, measurementMode: 'match_only' });

    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    expect(await measurementCount(athleteB.id)).toBe(beforeB);
  });

  it('lets a site admin import into a specified organization, scoped to that organization', async () => {
    vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue(
      ocrRows([{ firstName: sameFirst, lastName: sameLast }]) as any,
    );
    const beforeA = await measurementCount(athleteA.id);
    const beforeB = await measurementCount(athleteB.id);

    const res = await postPhoto(agentSiteAdmin, { organizationId: orgB.id, measurementMode: 'match_only' });

    expect(res.status).toBe(200);
    expect(await measurementCount(athleteB.id)).toBe(beforeB + 1);
    expect(await measurementCount(athleteA.id)).toBe(beforeA);
  });

  it('requires an organization when the caller has none to default to', async () => {
    const spy = vi.spyOn(ocrService, 'extractTextFromImage').mockResolvedValue(
      ocrRows([{ firstName: sameFirst, lastName: sameLast }]) as any,
    );
    const beforeA = await measurementCount(athleteA.id);
    const beforeB = await measurementCount(athleteB.id);

    const res = await postPhoto(agentSiteAdmin, { measurementMode: 'match_only' });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect(await measurementCount(athleteA.id)).toBe(beforeA);
    expect(await measurementCount(athleteB.id)).toBe(beforeB);
  });
});
