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
import { organizations, users, wellnessRequests, wellnessResponses, wellnessTemplates } from '@shared/schema';
import { ProfileMergeService } from '../../packages/api/services/profile-merge-service';
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
