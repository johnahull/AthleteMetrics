/**
 * GET /api/organizations/public is unauthenticated: it may return only what the directory UI shows.
 * Everything else on the organization row (join code, AI settings, branding, ...) must stay private.
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
import { eq } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { organizations } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const stamp = Date.now();
const SECRET_JOIN = `PUB${String(stamp).slice(-8)}`;
const SECRET_CONTEXT = `private-context-${stamp}`;
let app: Express;
let orgId: string;

// The fields the join-organization page reads, plus nothing else
const PUBLIC_FIELDS = ['description', 'id', 'location', 'memberCount', 'name', 'orgType'];

beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(app);
  const [org] = await db.insert(organizations).values({
    name: `PublicDir Org ${stamp}`,
    description: 'A public club',
    location: 'Springfield',
    orgType: 'club',
    isActive: true,
    isPublicDirectory: true,
    joinCode: SECRET_JOIN,
    aiPromptContext: SECRET_CONTEXT,
  } as any).returning();
  orgId = org.id;
});

afterAll(async () => {
  if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe('GET /api/organizations/public', () => {
  it('returns the directory fields only, never the join code or AI settings', async () => {
    const res = await request(app).get('/api/organizations/public').query({ search: `PublicDir Org ${stamp}` });
    expect(res.status).toBe(200);
    const mine = res.body.organizations.find((o: any) => o.id === orgId);
    expect(mine).toBeDefined();
    expect(Object.keys(mine).sort()).toEqual(PUBLIC_FIELDS);
    expect(mine).toMatchObject({ name: `PublicDir Org ${stamp}`, description: 'A public club', location: 'Springfield', orgType: 'club', memberCount: 0 });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(SECRET_JOIN);
    expect(body).not.toContain(SECRET_CONTEXT);
  });
});
