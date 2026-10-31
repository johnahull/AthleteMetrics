/**
 * Org-benchmark mutations (enable, disable, custom create/update/delete) are limited to the managing roles of the
 * benchmark's own organization (org_admin and coach, matching the org benchmarks settings page) and site admins.
 * Plain members (athlete, guest), non-members and org admins of a different organization are rejected. Runs
 * against a mocked storage, so no database is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BenchmarkService } from '../benchmark-service';
import { storage } from '../../storage';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const BENCH = '123e4567-e89b-12d3-a456-426614174000';

type Actor = 'athlete' | 'guest' | 'nonMember' | 'otherOrgAdmin' | 'coach' | 'orgAdmin' | 'siteAdmin';

const memberships: Record<Actor, any[]> = {
  athlete: [{ organizationId: ORG, role: 'athlete' }],
  guest: [{ organizationId: ORG, role: 'guest' }],
  nonMember: [],
  otherOrgAdmin: [{ organizationId: OTHER_ORG, role: 'org_admin' }],
  coach: [{ organizationId: ORG, role: 'coach' }],
  orgAdmin: [{ organizationId: ORG, role: 'org_admin' }],
  siteAdmin: [],
};

const operations: Record<string, (s: BenchmarkService, userId: string) => Promise<unknown>> = {
  enable: (s, u) => s.enableBenchmarkForOrg(ORG, BENCH, 'site', u),
  disable: (s, u) => s.disableBenchmarkForOrg(ORG, BENCH, 'site', u),
  'create custom': (s, u) =>
    s.createCustomBenchmark({ organizationId: ORG, metricCode: 'FLY10_TIME', name: 'X', benchmarkValue: 1.1 } as any, u),
  'update custom': (s, u) => s.updateCustomBenchmark(ORG, BENCH, { name: 'Y' } as any, u),
  'delete custom': (s, u) => s.deleteCustomBenchmark(ORG, BENCH, u),
};

/** Runs the operation and returns the thrown error message ('' when it succeeded). */
async function outcome(op: string, actor: Actor): Promise<string> {
  try {
    await operations[op](new BenchmarkService(), actor);
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe('BenchmarkService org benchmark mutation permissions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(storage, 'getUser').mockImplementation(
      async (id: string) => ({ id, isSiteAdmin: id === 'siteAdmin' }) as any
    );
    vi.spyOn(storage, 'getUserOrganizations').mockImplementation(
      async (id: string) => (memberships[id as Actor] ?? []) as any
    );
    vi.spyOn(storage, 'createAuditLog').mockResolvedValue(undefined as any);
    vi.spyOn(storage, 'getOrganization').mockResolvedValue(
      { id: ORG, name: 'Org', benchmarksEnabled: true, allowCustomBenchmarks: true } as any
    );
    vi.spyOn(storage, 'getSiteMetric').mockResolvedValue({ code: 'FLY10_TIME' } as any);
    vi.spyOn(storage, 'enableBenchmarkForOrg').mockResolvedValue({ id: 'ob-1' } as any);
    vi.spyOn(storage, 'disableBenchmarkForOrg').mockResolvedValue({ id: 'ob-1' } as any);
    vi.spyOn(storage, 'createCustomBenchmark').mockResolvedValue({ id: BENCH } as any);
    vi.spyOn(storage, 'updateCustomBenchmark').mockResolvedValue({ id: BENCH } as any);
    vi.spyOn(storage, 'deleteCustomBenchmark').mockResolvedValue(undefined as any);
    vi.spyOn(storage, 'getCustomBenchmarksForOrg').mockResolvedValue([{ id: BENCH, name: 'X' }] as any);
  });

  describe.each(Object.keys(operations))('%s', (op) => {
    it.each(['athlete', 'guest', 'nonMember', 'otherOrgAdmin'] as Actor[])('rejects %s with Unauthorized', async (actor) => {
      expect(await outcome(op, actor)).toContain('Unauthorized');
    });

    it.each(['orgAdmin', 'coach', 'siteAdmin'] as Actor[])('allows %s', async (actor) => {
      expect(await outcome(op, actor)).toBe('');
    });
  });

  describe('membership lookups', () => {
    it('looks up memberships once for a non-site-admin', async () => {
      await outcome('enable', 'orgAdmin');
      expect(storage.getUserOrganizations).toHaveBeenCalledTimes(1);
    });

    it('keeps the site admin override audit log and skips the membership lookup', async () => {
      await outcome('enable', 'siteAdmin');
      expect(storage.getUserOrganizations).not.toHaveBeenCalled();
      expect(storage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'site_admin_organization_access', resourceId: ORG })
      );
    });
  });
});
