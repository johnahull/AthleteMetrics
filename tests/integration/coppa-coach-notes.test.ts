/**
 * COPPA handling of coach notes on individual reports. The athlete is named only in config.athleteId (no FK).
 * Deletion clears notes and AI insights on EVERY individual report of the athlete (shared or not), export
 * includes the notes (coach-authored data about the child), merge re-points noted reports to the target.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { CoppaDeletionService } from '../../packages/api/services/coppa-deletion-service';
import { ProfileMergeService } from '../../packages/api/services/profile-merge-service';
import { CoppaExportService } from '../../packages/api/services/coppa-export-service';
import {
  coppaAuditLog, dataDeletionRequests, organizations, reportShares, reports, userOrganizations, users,
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
const u: Record<string, any> = {};
let orgA: string;
let orgB: string;
const notes = (g: string) => ({ goals: g, seasonPhase: 'pre' });

describe('COPPA and coach notes', () => {
  const mkUser = async (tag: string) => {
    const [row] = await db.insert(users).values({
      username: `coppanotes-${tag}-${suffix}`, emails: [`coppanotes-${tag}-${suffix}@test.com`], password: 'x',
      firstName: 'Coppa', lastName: tag, fullName: `Coppa ${tag}`, gender: 'Female', birthDate: '2016-03-01',
    } as any).returning();
    u[tag] = row;
  };
  const mkReport = async (organizationId: string, athleteId: string, coachNotes: unknown, extra: Record<string, unknown> = {}) =>
    (await db.insert(reports).values({
      organizationId, name: `CoppaNotes ${suffix}`, reportType: 'individual', config: { athleteId }, coachNotes,
      coachingInsights: 'AI text about the athlete', coachingInsightsModel: 'm', ...extra,
    } as any).returning({ id: reports.id }))[0].id;
  const row = async (id: string) => (await db.select().from(reports).where(eq(reports.id, id)))[0];

  let xShared: string;
  let xUnshared: string;
  let xOrgB: string;
  let yReport: string;
  let mNoted: string;
  let mOrgB: string;
  let mPlain: string;

  beforeAll(async () => {
    [{ id: orgA }] = await db.insert(organizations).values({ name: `CoppaNotes A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `CoppaNotes B ${suffix}` }).returning();
    for (const tag of ['coach', 'admin', 'x', 'y', 'm1', 'm2']) await mkUser(tag);
    await db.insert(userOrganizations).values([
      { userId: u.coach.id, organizationId: orgA, role: 'coach' },
      { userId: u.admin.id, organizationId: orgA, role: 'org_admin' },
      { userId: u.x.id, organizationId: orgA, role: 'athlete' },
      { userId: u.y.id, organizationId: orgA, role: 'athlete' },
      { userId: u.m1.id, organizationId: orgA, role: 'athlete' },
      { userId: u.m1.id, organizationId: orgB, role: 'athlete' },
      { userId: u.m2.id, organizationId: orgA, role: 'athlete' },
    ] as any);
    xShared = await mkReport(orgA, u.x.id, notes('x shared'));
    xUnshared = await mkReport(orgA, u.x.id, notes('x unshared'));
    xOrgB = await mkReport(orgB, u.x.id, notes('x orgB'));
    yReport = await mkReport(orgA, u.y.id, notes('y'));
    await db.insert(reportShares).values({ reportId: xShared, athleteId: u.x.id, sharedBy: u.coach.id, organizationId: orgA } as any);
    mNoted = await mkReport(orgA, u.m1.id, notes('m noted'));
    mOrgB = await mkReport(orgB, u.m1.id, notes('m orgB'));
    mPlain = await mkReport(orgA, u.m1.id, null);
  });

  afterAll(async () => {
    for (const t of ['x', 'm2']) {
      await db.delete(coppaAuditLog).where(eq(coppaAuditLog.athleteUserId, u[t].id));
      await db.delete(dataDeletionRequests).where(eq(dataDeletionRequests.athleteUserId, u[t].id));
    }
    await purgeTestRows({
      usernameLike: [`coppanotes-%-${suffix}`], userIds: Object.values(u).map((r: any) => r.id), orgIds: [orgA, orgB],
    });
  });

  it('export includes the athlete individual-report coach notes and none of another athlete', async () => {
    const bundle = await (new CoppaExportService() as any).buildExportBundle(u.x.id);
    const byId = Object.fromEntries(bundle.coachNotes.map((r: any) => [r.reportId, r.coachNotes]));
    expect(Object.keys(byId).sort()).toEqual([xShared, xUnshared, xOrgB].sort());
    expect(byId[xShared]).toEqual(notes('x shared'));
    const other = await (new CoppaExportService() as any).buildExportBundle(u.y.id);
    expect(other.coachNotes.map((r: any) => r.reportId)).toEqual([yReport]);
  });

  it('merge re-points every individual report of the source (any org, noted or not) to the target, and nothing else', async () => {
    const merge = await new ProfileMergeService().mergeProfiles(orgA, u.m1.id, u.m2.id, u.admin.id);
    expect(merge.summary.individualReportsTransferred).toBe(3);
    for (const id of [mNoted, mOrgB, mPlain]) expect(((await row(id)).config as any).athleteId).toBe(u.m2.id);
    expect((await row(mOrgB)).coachNotes).toEqual(notes('m orgB')); // notes carried as saved
    expect(((await row(yReport)).config as any).athleteId).toBe(u.y.id); // other athlete
    const bundle = await (new CoppaExportService() as any).buildExportBundle(u.m2.id);
    expect(bundle.coachNotes.map((r: any) => r.reportId).sort()).toEqual([mNoted, mOrgB].sort());

    // and deletion of the surviving athlete now reaches the carried notes, including the second org
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: u.m2.id, requestedByEmail: `parent-m2-${suffix}@test.local`, status: 'pending',
    } as any).returning({ id: dataDeletionRequests.id });
    await new CoppaDeletionService().processDeletion(req.id, u.coach.id);
    expect((await row(mNoted)).coachNotes).toBeNull();
    expect((await row(mOrgB)).coachNotes).toBeNull();
    expect((await row(mOrgB)).coachingInsights).toBeNull();
  });

  it('deletion clears notes and insights on every individual report of the athlete, shared or not, and no one else', async () => {
    const [req] = await db.insert(dataDeletionRequests).values({
      athleteUserId: u.x.id, requestedByEmail: `parent-${suffix}@test.local`, status: 'pending',
    } as any).returning({ id: dataDeletionRequests.id });
    const result = await new CoppaDeletionService().processDeletion(req.id, u.coach.id);
    expect(result.success).toBe(true);
    expect(result.deletedCategories).toContain('coach_notes_cleared (3 reports)');

    for (const id of [xShared, xUnshared, xOrgB]) {
      const r = await row(id);
      expect(r.coachNotes).toBeNull();
      expect(r.coachingInsights).toBeNull();
      expect(r.coachingInsightsModel).toBeNull();
    }
    const y = await row(yReport);
    expect(y.coachNotes).toEqual(notes('y'));
    expect(y.coachingInsights).toBe('AI text about the athlete');
    expect((await db.select({ id: reports.id }).from(reports).where(inArray(reports.id, [xUnshared]))).length).toBe(1);
  });
});
