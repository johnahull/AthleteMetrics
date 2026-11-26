/**
 * Profile merge and standing wellness requests (AM-FEAT-027): after the source's responses move to the target,
 * each (request, date) keeps one live row, the newest by submittedAt; the others are superseded, never deleted.
 */
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { organizations, users, wellnessRequests, wellnessResponses, wellnessSchedules, wellnessTemplates } from '@shared/schema';
import { ProfileMergeService } from '../../packages/api/services/profile-merge-service';
import { wellnessRepository } from '../../packages/api/repositories/wellness-repository';
import { purgeTestRows } from '../helpers/purge-test-rows';

const PREFIX = 'pmw_';
const ts = Date.now();

describe('ProfileMergeService.mergeProfiles - wellness responses', () => {
  let orgId: string;
  let admin: any;
  let src: any;
  let dst: any;
  let templateId: string;
  let requestId: string;

  const mkUser = async (name: string, isSiteAdmin = false) => {
    const [u] = await db.insert(users).values({
      username: `${PREFIX}${name}_${ts}_${crypto.randomBytes(3).toString('hex')}`,
      emails: [`${PREFIX}${name}_${ts}@test.com`],
      password: 'hashed_password_here',
      firstName: name,
      lastName: 'Merge',
      fullName: `${name} Merge`,
      isSiteAdmin,
    }).returning();
    return u;
  };

  const row = (userId: string, date: string, submittedAt: string, withRequest = true) => ({
    organizationId: orgId,
    templateId,
    requestId: withRequest ? requestId : null,
    userId,
    userFullName: 'Merge Athlete',
    date,
    submittedAt: new Date(submittedAt),
    responses: { q1: { value: 5, label: 'Energy' } },
  });

  beforeAll(async () => {
    const [org] = await db.insert(organizations).values({ name: `${PREFIX}Org ${ts}`, orgType: 'club' }).returning();
    orgId = org.id;
    admin = await mkUser('admin', true);
    src = await mkUser('src');
    dst = await mkUser('dst');
    await storage.addUserToOrganization(src.id, orgId, 'athlete');
    await storage.addUserToOrganization(dst.id, orgId, 'athlete');

    const template = await storage.createWellnessTemplate({
      organizationId: orgId,
      name: 'Merge Template',
      config: { questions: [{ id: 'q1', type: 'scale', label: 'Energy', scaleMin: 1, scaleMax: 10, required: true }] },
      createdBy: admin.id,
    } as any);
    templateId = template.id;
    const request = await storage.createWellnessRequest({
      organizationId: orgId,
      templateId,
      requestedBy: admin.id,
      distributionMethod: 'athlete_account',
      targetAthleteIds: [src.id, dst.id],
      status: 'active',
      isStanding: true,
    } as any);
    requestId = request.id;
  });

  afterAll(async () => {
    if (orgId) {
      await db.delete(wellnessResponses).where(eq(wellnessResponses.organizationId, orgId));
      await db.delete(wellnessRequests).where(eq(wellnessRequests.organizationId, orgId));
      await db.delete(wellnessTemplates).where(eq(wellnessTemplates.organizationId, orgId));
    }
    await purgeTestRows({ userIds: [admin?.id, src?.id, dst?.id], orgIds: [orgId] });
  });

  it('leaves one live row per (request, date): the newest; rows without a request are untouched', async () => {
    const [dstOlder, srcNewer, dstOtherDay, srcNoRequest, dstNoRequest] = await db.insert(wellnessResponses).values([
      row(dst.id, '2026-11-20', '2026-11-20T08:00:00Z'),
      row(src.id, '2026-11-20', '2026-11-20T09:00:00Z'),
      row(dst.id, '2026-11-21', '2026-11-21T08:00:00Z'),
      row(src.id, '2026-11-20', '2026-11-20T10:00:00Z', false),
      row(dst.id, '2026-11-20', '2026-11-20T07:00:00Z', false),
    ]).returning();

    await new ProfileMergeService().mergeProfiles(orgId, src.id, dst.id, admin.id);

    const rows = await db.select().from(wellnessResponses).where(eq(wellnessResponses.organizationId, orgId));
    expect(rows).toHaveLength(5);
    expect(rows.every(r => r.userId === dst.id)).toBe(true);
    const live = new Set(rows.filter(r => r.supersededAt === null).map(r => r.id));
    expect(live).toEqual(new Set([srcNewer.id, dstOtherDay.id, srcNoRequest.id, dstNoRequest.id]));
    expect(live.has(dstOlder.id)).toBe(false);
  });
});

describe('ProfileMergeService.mergeProfiles - wellness request and schedule targets', () => {
  const T = `${PREFIX}t_`;
  let orgId: string;
  let otherOrgId: string;
  let admin: any;
  let src: any;
  let dst: any;
  let bystander: any;
  const ids: Record<string, string> = {};

  const mkUser = async (name: string, isSiteAdmin = false) => {
    const [u] = await db.insert(users).values({
      username: `${T}${name}_${ts}_${crypto.randomBytes(3).toString('hex')}`,
      emails: [`${T}${name}_${ts}@test.com`],
      password: 'hashed_password_here',
      firstName: name,
      lastName: 'Targets',
      fullName: `${name} Targets`,
      isSiteAdmin,
    }).returning();
    return u;
  };

  const mkTemplate = (organizationId: string) => storage.createWellnessTemplate({
    organizationId,
    name: 'Targets Template',
    config: { questions: [{ id: 'q1', type: 'scale', label: 'Energy', scaleMin: 1, scaleMax: 10, required: true }] },
    createdBy: admin.id,
  } as any);

  const mkRequest = async (organizationId: string, templateId: string, targetAthleteIds: string[], status = 'active') =>
    (await storage.createWellnessRequest({
      organizationId,
      templateId,
      requestedBy: admin.id,
      distributionMethod: 'athlete_account',
      targetAthleteIds,
      status,
    } as any)).id;

  const mkSchedule = async (organizationId: string, templateId: string, targetAthleteIds: string[], status = 'active') =>
    (await db.insert(wellnessSchedules).values({
      organizationId,
      templateId,
      createdBy: admin.id,
      distributionMethod: 'athlete_account',
      targetAthleteIds,
      recurrenceType: 'daily',
      scheduledTime: '08:00',
      timezone: 'UTC',
      nextRunAt: new Date(Date.now() - 60_000),
      status,
    } as any).returning())[0].id;

  const requestTargets = async (id: string) =>
    (await db.select().from(wellnessRequests).where(eq(wellnessRequests.id, id)))[0].targetAthleteIds;
  const scheduleTargets = async (id: string) =>
    (await db.select().from(wellnessSchedules).where(eq(wellnessSchedules.id, id)))[0].targetAthleteIds;

  beforeAll(async () => {
    const [org] = await db.insert(organizations).values({ name: `${T}Org ${ts}`, orgType: 'club' }).returning();
    const [other] = await db.insert(organizations).values({ name: `${T}Other ${ts}`, orgType: 'club' }).returning();
    orgId = org.id;
    otherOrgId = other.id;
    admin = await mkUser('admin', true);
    src = await mkUser('src');
    dst = await mkUser('dst');
    bystander = await mkUser('by');
    for (const u of [src, dst, bystander]) await storage.addUserToOrganization(u.id, orgId, 'athlete');
    await storage.addUserToOrganization(src.id, otherOrgId, 'athlete');

    const template = await mkTemplate(orgId);
    const otherTemplate = await mkTemplate(otherOrgId);
    ids.srcOnly = await mkRequest(orgId, template.id, [src.id, bystander.id]);
    ids.both = await mkRequest(orgId, template.id, [src.id, dst.id]);
    ids.cancelled = await mkRequest(orgId, template.id, [src.id], 'cancelled');
    ids.otherOrg = await mkRequest(otherOrgId, otherTemplate.id, [src.id]);
    ids.untouched = await mkRequest(orgId, template.id, [bystander.id]);
    ids.schedule = await mkSchedule(orgId, template.id, [bystander.id, src.id]);
    ids.scheduleBoth = await mkSchedule(orgId, template.id, [dst.id, src.id], 'paused');
    ids.scheduleOtherOrg = await mkSchedule(otherOrgId, otherTemplate.id, [src.id]);

    // The source answered the src-only request; after the merge that answer belongs to the target
    await db.insert(wellnessResponses).values({
      organizationId: orgId,
      templateId: template.id,
      requestId: ids.srcOnly,
      userId: src.id,
      userFullName: 'src Targets',
      date: '2026-11-20',
      submittedAt: new Date('2026-11-20T08:00:00Z'),
      responses: { q1: { value: 5, label: 'Energy' } },
    });

    await new ProfileMergeService().mergeProfiles(orgId, src.id, dst.id, admin.id);
  });

  afterAll(async () => {
    for (const o of [orgId, otherOrgId].filter(Boolean)) {
      await db.delete(wellnessResponses).where(eq(wellnessResponses.organizationId, o));
      await db.delete(wellnessSchedules).where(eq(wellnessSchedules.organizationId, o));
      await db.delete(wellnessRequests).where(eq(wellnessRequests.organizationId, o));
      await db.delete(wellnessTemplates).where(eq(wellnessTemplates.organizationId, o));
    }
    await purgeTestRows({ userIds: [admin?.id, src?.id, dst?.id, bystander?.id], orgIds: [orgId, otherOrgId] });
  });

  it('re-points the source to the target in a request, keeping the other targets and their order', async () => {
    expect(await requestTargets(ids.srcOnly)).toEqual([dst.id, bystander.id]);
  });

  it('drops the source when the target is already targeted (no duplicate)', async () => {
    expect(await requestTargets(ids.both)).toEqual([dst.id]);
  });

  it('re-points cancelled requests and requests of other organizations', async () => {
    expect(await requestTargets(ids.cancelled)).toEqual([dst.id]);
    expect(await requestTargets(ids.otherOrg)).toEqual([dst.id]);
  });

  it('leaves requests that never targeted the source unchanged', async () => {
    expect(await requestTargets(ids.untouched)).toEqual([bystander.id]);
  });

  it('re-points schedules in every organization and status, without duplicates', async () => {
    expect(await scheduleTargets(ids.schedule)).toEqual([bystander.id, dst.id]);
    expect(await scheduleTargets(ids.scheduleBoth)).toEqual([dst.id]);
    expect(await scheduleTargets(ids.scheduleOtherOrg)).toEqual([dst.id]);
  });

  it('counts the merged answer toward the completion rate', async () => {
    expect(await storage.getRequestCompletionRate(orgId, ids.srcOnly)).toMatchObject({ completed: 1, total: 2, percentage: 50 });
  });

  it('a due schedule read by the scheduled job targets the surviving user', async () => {
    const due = (await wellnessRepository.getSchedulesDueNow()).find(s => s.id === ids.schedule);
    expect(due?.targetAthleteIds).toContain(dst.id);
    expect(due?.targetAthleteIds).not.toContain(src.id);
  });
});
