/**
 * AM-FEAT-019 P3d: COPPA deletion and export cover saved eval reports.
 * Eval rows (reports.report_type = 'eval') carry the athlete only in config.athleteId (no FK), so the cascade
 * from users never reaches them. Rows are produced by the real P3a save route.
 * The COPPA services key everything on the athlete's user id and do not scope by organization, so eval rows
 * are handled the same way: every eval row for the athlete is deleted / exported, in any organization.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { registerEventReportRoutes } from '../../packages/api/routes/event-report-routes';
import { CoppaDeletionService } from '../../packages/api/services/coppa-deletion-service';
import { ProfileMergeService } from '../../packages/api/services/profile-merge-service';
import { CoppaExportService } from '../../packages/api/services/coppa-export-service';
import {
  coppaAuditLog, dataDeletionRequests, events, measurements, organizations, reportShares, reportSnapshots, reports,
  userOrganizations, users, wellnessResponses,
} from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {},
  EmailService: vi.fn().mockImplementation(() => ({
    sendDeletionRequestConfirmation: vi.fn().mockResolvedValue(true),
    sendDeletionCompletedNotification: vi.fn().mockResolvedValue(true),
  })),
}));

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const WELLNESS_KEY = /sleep|soreness|stress|energy|cycle|wellness|mood|readiness|pain/i;

const wellnessKeys = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach((v) => wellnessKeys(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (WELLNESS_KEY.test(k)) found.push(k);
      wellnessKeys(v, found);
    }
  }
  return found;
};

describe('COPPA deletion and export of eval reports', () => {
  let app: Express;
  let orgA: string;
  let orgB: string;
  let eventA: string;
  let eventB: string;
  const u: Record<string, any> = {};
  let ipCounter = 0;

  const mkUser = async (tag: string) => {
    const [row] = await db.insert(users).values({
      username: `coppaeval-${tag}-${suffix}`, emails: [`coppaeval-${tag}-${suffix}@test.com`], password: 'x',
      firstName: 'Coppa', lastName: tag, fullName: `Coppa ${tag}`, gender: 'Female', birthDate: '2016-03-01',
    } as any).returning();
    u[tag] = row;
  };

  const save = async (athleteKey: string, eventId: string) => {
    const res = await request(app).post(`/api/events/${eventId}/athletes/${u[athleteKey].id}/eval-report`)
      .set('x-test-user', u.coach.id).send({ coachNote: 'Nice work' });
    expect(res.status).toBe(201);
    return res.body.report.id as string;
  };

  const existing = async (ids: string[]) =>
    (await db.select({ id: reports.id }).from(reports).where(inArray(reports.id, ids))).map((r) => r.id);

  let xUnshared: string;
  let xShared: string;
  let xOrgB: string;
  let yEval: string;
  let xNonEval: string;
  let mEvalA: string;
  let mEvalB: string;

  beforeAll(async () => {
    [{ id: orgA }] = await db.insert(organizations).values({ name: `CoppaEval Org A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `CoppaEval Org B ${suffix}` }).returning();
    for (const tag of ['coach', 'admin', 'x', 'y', 'm1', 'm2']) await mkUser(tag);
    await db.insert(userOrganizations).values([
      { userId: u.coach.id, organizationId: orgA, role: 'coach' },
      { userId: u.coach.id, organizationId: orgB, role: 'coach' },
      { userId: u.x.id, organizationId: orgA, role: 'athlete' },
      { userId: u.x.id, organizationId: orgB, role: 'athlete' },
      { userId: u.y.id, organizationId: orgA, role: 'athlete' },
      { userId: u.admin.id, organizationId: orgA, role: 'org_admin' },
      { userId: u.m1.id, organizationId: orgA, role: 'athlete' },
      { userId: u.m1.id, organizationId: orgB, role: 'athlete' },
      { userId: u.m2.id, organizationId: orgA, role: 'athlete' },
    ] as any);
    const mkEvent = async (organizationId: string, name: string) =>
      (await db.insert(events).values({ organizationId, name: `${name} ${suffix}`, startDate: new Date('2026-05-01T10:00:00Z') } as any)
        .returning({ id: events.id }))[0].id;
    eventA = await mkEvent(orgA, 'CoppaEval A');
    eventB = await mkEvent(orgB, 'CoppaEval B');
    const measure = (userId: string, eventId: string, organizationId: string) =>
      db.insert(measurements).values({
        userId, submittedBy: u.coach.id, date: '2026-05-01', age: 9, metric: 'DASH_10YD', value: '2.0', units: 's',
        isVerified: true, eventId, organizationId,
      } as any);
    await measure(u.x.id, eventA, orgA);
    await measure(u.y.id, eventA, orgA);
    await measure(u.x.id, eventB, orgB);
    await measure(u.m1.id, eventA, orgA);
    await measure(u.m1.id, eventB, orgB);
    // Pre-test survey data exists for the athlete on the event date; it must never reach an eval row
    await db.insert(wellnessResponses).values({
      organizationId: orgA, templateId: `tpl-${suffix}`, userId: u.x.id, userFullName: 'Coppa x', submittedAt: new Date('2026-05-01T09:00:00Z'),
      date: '2026-05-01', responses: { sleep: 3, soreness: 4, stress: 2, energy: 5, mood: 4, readiness: 5, pain: 1 },
    } as any);

    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const user = Object.values(u).find((x: any) => x.id === req.get('x-test-user')) as any;
      req.session = { user: user ? { id: user.id, username: user.username, role: 'coach', isSiteAdmin: false } : undefined };
      Object.defineProperty(req, 'ip', { value: `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });
      next();
    });
    registerEventReportRoutes(app);

    xUnshared = await save('x', eventA); // downloaded only, never shared
    xShared = await save('x', eventA);
    xOrgB = await save('x', eventB);
    yEval = await save('y', eventA);
    mEvalA = await save('m1', eventA);
    mEvalB = await save('m1', eventB);
    await db.insert(reportShares).values({ reportId: xShared, athleteId: u.x.id, sharedBy: u.coach.id, organizationId: orgA } as any);
    await db.insert(reportSnapshots).values({
      reportId: xShared, publicToken: `coppaeval-${suffix}`, snapshotData: {}, expiresAt: new Date(Date.now() + 86400000),
    } as any);
    // A non-eval report that happens to name the athlete in its config must be left alone
    [{ id: xNonEval }] = await db.insert(reports).values({
      organizationId: orgA, name: `CoppaEval individual ${suffix}`, reportType: 'individual', config: { athleteId: u.x.id },
    } as any).returning({ id: reports.id });
  });

  afterAll(async () => {
    await db.delete(coppaAuditLog).where(eq(coppaAuditLog.athleteUserId, u.x.id));
    await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.athleteUserId, u.x.id));
    await db.delete(wellnessResponses).where(eq(wellnessResponses.templateId, `tpl-${suffix}`));
    await db.delete(measurements).where(inArray(measurements.eventId, [eventA, eventB]));
    await db.delete(events).where(inArray(events.id, [eventA, eventB]));
    await purgeTestRows({
      usernameLike: [`coppaeval-%-${suffix}`],
      userIds: Object.values(u).map((r: any) => r.id), // the COPPA deletion renames x, so the prefix no longer matches it
      orgIds: [orgA, orgB],
    });
  });

  it('saved eval rows and their export contain no wellness keys at any depth', async () => {
    const [row] = await db.select().from(reports).where(eq(reports.id, xUnshared));
    expect((row.config as any).model).toBeTruthy();
    expect(wellnessKeys(row.config)).toEqual([]);
    const bundle = await (new CoppaExportService() as any).buildExportBundle(u.x.id);
    expect(bundle.evalReports.length).toBeGreaterThan(0);
    expect(wellnessKeys(bundle.evalReports)).toEqual([]);
  });

  // Must land with P3c: the snapshot a shared eval creates is a second copy of the model
  it.todo('eval snapshot payload has no wellness keys');

  it('profile merge re-points the source eval rows of the merge org to the target, and nothing else', async () => {
    const cfgOf = async (id: string) => (await db.select().from(reports).where(eq(reports.id, id)))[0].config as any;
    const modelBefore = (await cfgOf(mEvalA)).model;
    await new ProfileMergeService().mergeProfiles(orgA, u.m1.id, u.m2.id, u.admin.id);

    const merged = await cfgOf(mEvalA);
    expect(merged.athleteId).toBe(u.m2.id);
    expect(merged.model).toEqual(modelBefore); // the frozen model is a historical snapshot
    expect((await cfgOf(mEvalB)).athleteId).toBe(u.m1.id); // other organization
    expect((await cfgOf(yEval)).athleteId).toBe(u.y.id); // other athlete

    const bundle = await (new CoppaExportService() as any).buildExportBundle(u.m2.id);
    expect(bundle.evalReports.map((r: any) => r.id)).toEqual([mEvalA]);

    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: u.m2.id, requestedByEmail: `parent-m2-${suffix}@test.local`, status: 'pending',
    } as any).returning({ id: dataDeletionRequests.id });
    const result = await new CoppaDeletionService().processDeletion(req.id, u.coach.id);
    expect(result.deletedCategories).toContain('eval_reports (1)');
    expect(await existing([mEvalA])).toEqual([]);
    await db.delete(coppaAuditLog).where(eq(coppaAuditLog.athleteUserId, u.m2.id));
    await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.athleteUserId, u.m2.id));
  });

  it('exports the athlete eval rows, with the frozen model, and none of another athlete', async () => {
    const bundle = await (new CoppaExportService() as any).buildExportBundle(u.x.id);
    const ids = bundle.evalReports.map((r: any) => r.id).sort();
    expect(ids).toEqual([xUnshared, xShared, xOrgB].sort());
    expect(ids).not.toContain(yEval);
    expect(ids).not.toContain(xNonEval);
    for (const r of bundle.evalReports) {
      expect(r.config.athleteId).toBe(u.x.id);
      expect(r.config.model).toBeTruthy();
    }
    const other = await (new CoppaExportService() as any).buildExportBundle(u.y.id);
    expect(other.evalReports.map((r: any) => r.id)).toEqual([yEval]);
  });

  it('deletion removes the athlete eval rows (shared and unshared), cascades, and records it in the audit log', async () => {
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: u.x.id, requestedByEmail: `parent-${suffix}@test.local`, status: 'pending',
    } as any).returning({ id: dataDeletionRequests.id });

    const result = await new CoppaDeletionService().processDeletion(req.id, u.coach.id);
    expect(result.success).toBe(true);
    expect(result.deletedCategories).toContain('eval_reports (3)');

    expect(await existing([xUnshared, xShared, xOrgB])).toEqual([]);
    expect(await db.select().from(reportShares).where(eq(reportShares.reportId, xShared))).toHaveLength(0);
    expect(await db.select().from(reportSnapshots).where(eq(reportSnapshots.reportId, xShared))).toHaveLength(0);
    // Another athlete's eval row and a non-eval report are untouched
    expect((await existing([yEval, xNonEval])).sort()).toEqual([yEval, xNonEval].sort());

    const audit = await db.select().from(coppaAuditLog).where(eq(coppaAuditLog.athleteUserId, u.x.id));
    expect(audit.some((a) => String(a.details).includes('eval_reports (3)'))).toBe(true);
  });
});
