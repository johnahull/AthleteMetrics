/**
 * Unit Tests: requireTrainingEnabled middleware + checkTrainingEnabled utility
 *
 * RED-phase tests written BEFORE the middleware is implemented.
 * Mocks all DB calls — no real DB connection needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';

// Mock the DB module before any imports
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
  },
}));

// Mock drizzle-orm eq
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

// Mock schema imports
vi.mock('@shared/schema', () => ({
  siteSettings: { trainingModuleEnabled: 'training_module_enabled' },
  organizations: { id: 'id', trainingEnabled: 'training_enabled' },
  userOrganizations: { userId: 'user_id', organizationId: 'organization_id' },
}));

import { requireTrainingEnabled, checkTrainingEnabled } from './require-training-enabled';
import { db } from '../db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: any = {}): any {
  return {
    params: {},
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      isSiteAdmin: false,
      ...overrides.user,
    },
    session: {
      user: {
        id: 'user-1',
        organizationId: 'org-1',
        isSiteAdmin: false,
        ...overrides.sessionUser,
      },
    },
    ...overrides,
  };
}

function makeRes(): { status: any; json: any; statusCode: number | null; body: any } {
  const res: any = {
    statusCode: null,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

function makeNext(): NextFunction & { called: boolean } {
  const next: any = vi.fn(() => { next.called = true; });
  next.called = false;
  return next;
}

// Setup drizzle chain mock helper
function mockDbSelect(results: any[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(results),
  };
  (db.select as any).mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// requireTrainingEnabled middleware tests
// ---------------------------------------------------------------------------

describe('requireTrainingEnabled middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when both site and org flags are true', async () => {
    // First call: siteSettings (training enabled)
    // Second call: userOrganizations lookup
    // Third call: organizations (trainingEnabled)
    let callCount = 0;
    (db.select as any).mockImplementation(() => {
      callCount++;
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          if (callCount === 1) {
            return Promise.resolve([{ trainingModuleEnabled: true }]);
          }
          if (callCount === 2) {
            // userOrganizations lookup
            return Promise.resolve([{ organizationId: 'org-1' }]);
          }
          // organizations lookup
          return Promise.resolve([{ trainingEnabled: true }]);
        }),
      };
      return chain;
    });

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await requireTrainingEnabled(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it('returns 403 with disabledBy="site_admin" when site flag is false', async () => {
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ trainingModuleEnabled: false }]),
    });

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await requireTrainingEnabled(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      featureDisabled: true,
      disabledBy: 'site_admin',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 with disabledBy="org_admin" when site=true but org flag is false', async () => {
    let callCount = 0;
    (db.select as any).mockImplementation(() => {
      callCount++;
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          if (callCount === 1) {
            return Promise.resolve([{ trainingModuleEnabled: true }]);
          }
          if (callCount === 2) {
            return Promise.resolve([{ organizationId: 'org-1' }]);
          }
          return Promise.resolve([{ trainingEnabled: false }]);
        }),
      };
      return chain;
    });

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await requireTrainingEnabled(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      featureDisabled: true,
      disabledBy: 'org_admin',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when DB lookup for siteSettings fails', async () => {
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('DB connection error')),
    });

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await requireTrainingEnabled(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses req.session.user.organizationId to look up org when not in params', async () => {
    let callCount = 0;
    const capturedWhereCalls: any[] = [];

    (db.select as any).mockImplementation(() => {
      callCount++;
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation((cond: any) => {
          capturedWhereCalls.push(cond);
          return chain;
        }),
        limit: vi.fn().mockImplementation(() => {
          if (callCount === 1) return Promise.resolve([{ trainingModuleEnabled: true }]);
          if (callCount === 2) return Promise.resolve([{ organizationId: 'session-org-id' }]);
          return Promise.resolve([{ trainingEnabled: true }]);
        }),
      };
      return chain;
    });

    const req = makeReq({
      params: {}, // No organizationId in params
      sessionUser: { id: 'user-1', organizationId: 'session-org-id' },
    });
    const res = makeRes();
    const next = makeNext();

    await requireTrainingEnabled(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkTrainingEnabled utility tests
// ---------------------------------------------------------------------------

describe('checkTrainingEnabled utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns {enabled:true} when both flags are true', async () => {
    let callCount = 0;
    (db.select as any).mockImplementation(() => {
      callCount++;
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          if (callCount === 1) return Promise.resolve([{ trainingModuleEnabled: true }]);
          return Promise.resolve([{ trainingEnabled: true }]);
        }),
      };
      return chain;
    });

    const result = await checkTrainingEnabled('org-1');

    expect(result).toMatchObject({ enabled: true });
  });

  it('returns {enabled:false, disabledBy:"site_admin"} when site flag is false', async () => {
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ trainingModuleEnabled: false }]),
    });

    const result = await checkTrainingEnabled('org-1');

    expect(result).toMatchObject({ enabled: false, disabledBy: 'site_admin' });
  });

  it('returns {enabled:false, disabledBy:"org_admin"} when org flag is false', async () => {
    let callCount = 0;
    (db.select as any).mockImplementation(() => {
      callCount++;
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          if (callCount === 1) return Promise.resolve([{ trainingModuleEnabled: true }]);
          return Promise.resolve([{ trainingEnabled: false }]);
        }),
      };
      return chain;
    });

    const result = await checkTrainingEnabled('org-1');

    expect(result).toMatchObject({ enabled: false, disabledBy: 'org_admin' });
  });
});
