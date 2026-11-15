/**
 * Integration tests for organizations.ai_style_example
 *
 * PATCH /api/organizations/:id/org-settings: validation, de-identification, authorization.
 * Every organization read route: only org admins and site admins may receive the text.
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
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

const MARKER = 'STYLE-EXAMPLE-MARKER-zq81';
const EXAMPLE = `## Snapshot\nSolid block. ${MARKER}\n\n## What to work on\n- Acceleration`;
const ts = Date.now();
const PASSWORD = 'Passw0rd!Style1';

let app: Express;
let org: any;
let otherOrg: any;
const created: any[] = [];
const cookies: Record<string, string> = {};

async function makeUser(key: string, firstName: string, lastName: string, orgId: string | null, role?: string, extra: Record<string, unknown> = {}) {
  const [u] = await db.insert(users).values({
    birthDate: '1990-01-01',
    username: `style-${key}-${ts}`,
    emails: [`style-${key}-${ts}@test.com`],
    password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    isActive: true,
    ...extra,
  }).returning();
  created.push(u);
  if (orgId && role) await db.insert(userOrganizations).values({ userId: u.id, organizationId: orgId, role: role as any });
  const login = await request(app).post('/api/auth/login').send({ username: u.username, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login ${key} failed ${login.status} ${JSON.stringify(login.body)}`);
  cookies[key] = login.headers['set-cookie'][0];
  return { user: u, login };
}

const patch = (key: string, body: unknown, orgId = () => org.id) =>
  request(app).patch(`/api/organizations/${orgId()}/org-settings`).set('Cookie', cookies[key]).send(body as object);
const dbExample = async () => (await db.select().from(organizations).where(eq(organizations.id, org.id)))[0].aiStyleExample;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  [org] = await db.insert(organizations).values({
    name: `Style Org ${ts}`, isActive: true, aiEnabledBySiteAdmin: true, aiEnabled: true, isPublicDirectory: true,
  }).returning();
  [otherOrg] = await db.insert(organizations).values({
    name: `Style Other Org ${ts}`, isActive: true, aiEnabledBySiteAdmin: true, aiEnabled: true,
  }).returning();

  await makeUser('admin', 'Adminella', 'Boss', org.id, 'org_admin');
  await makeUser('coach', 'Corwin', 'Whistle', org.id, 'coach');
  await makeUser('athlete', 'Zephyrine', 'Quickfoot', org.id, 'athlete');
  await makeUser('will', 'Will', 'Long', org.id, 'athlete');
  await makeUser('otheradmin', 'Otto', 'Admin', otherOrg.id, 'org_admin');
  await makeUser('outsider', 'Outsider', 'Elsewhere', otherOrg.id, 'athlete');
  await makeUser('siteadmin', 'Site', 'Operator', null, undefined, { isSiteAdmin: true });
  await db.update(organizations).set({ aiStyleExample: EXAMPLE }).where(eq(organizations.id, org.id));
});

afterAll(async () => {
  for (const u of created) {
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  for (const o of [otherOrg, org]) if (o?.id) await db.delete(organizations).where(eq(organizations.id, o.id));
});

describe('PATCH org-settings aiStyleExample', () => {
  it('org admin saves the text', async () => {
    const text = 'Short example.\n\n- bullet';
    const res = await patch('admin', { aiStyleExample: text });
    expect(res.status).toBe(200);
    expect(await dbExample()).toBe(text);
  });

  it('accepts exactly 1500 characters', async () => {
    const res = await patch('admin', { aiStyleExample: 'b'.repeat(1500) });
    expect(res.status).toBe(200);
  });

  it('rejects more than 1500 characters with a clear message', async () => {
    const res = await patch('admin', { aiStyleExample: 'a'.repeat(1501) });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('1500 characters');
  });

  it('rejects a non-string value', async () => {
    const res = await patch('admin', { aiStyleExample: 42 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('must be a string');
  });

  it.each([['empty string', ''], ['null', null]])('clears with %s', async (_n, value) => {
    await db.update(organizations).set({ aiStyleExample: 'old' }).where(eq(organizations.id, org.id));
    const res = await patch('admin', { aiStyleExample: value });
    expect(res.status).toBe(200);
    expect(await dbExample()).toBeNull();
  });

  it.each([
    ['full name', 'Zephyrine Quickfoot', 'Zephyrine Quickfoot'],
    ['full name, lowercase', 'zephyrine quickfoot did well', 'Zephyrine Quickfoot'],
    ['capitalised first name', 'Zephyrine opened with a fast start', 'Zephyrine Quickfoot'],
    ['capitalised last name', 'Great work by Quickfoot today', 'Zephyrine Quickfoot'],
    ['a coach name', 'As Corwin said', 'Corwin Whistle'],
    ['an org admin name', 'Per Boss, keep going', 'Adminella Boss'],
    ['name that is also a word, capitalised', 'Will ran well', 'Will Long'],
  ])('rejects text containing a member name (%s) and lists the matched name', async (_n, text, matched) => {
    await db.update(organizations).set({ aiStyleExample: null }).where(eq(organizations.id, org.id));
    const res = await patch('admin', { aiStyleExample: text });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain(matched);
    expect(res.body.message.toLowerCase()).toContain('remove');
    expect(await dbExample()).toBeNull();
  });

  it('lets lowercase everyday words through even when a member is named Will Long', async () => {
    const res = await patch('admin', { aiStyleExample: 'He will take a long run, so keep it short.' });
    expect(res.status).toBe(200);
  });

  it('applies the name check again when unchanged text is re-sent after a member with that name joins', async () => {
    const text = 'Great session for Newcomer today';
    expect((await patch('admin', { aiStyleExample: text })).status).toBe(200);
    const nu = await makeUser('newcomer', 'Newcomer', 'Person', org.id, 'athlete');
    expect(nu.user.id).toBeTruthy();
    const again = await patch('admin', { aiStyleExample: text });
    expect(again.status).toBe(400);
    expect(again.body.message).toContain('Newcomer Person');
  });

  it('stores null for whitespace-only text', async () => {
    await db.update(organizations).set({ aiStyleExample: 'old' }).where(eq(organizations.id, org.id));
    const res = await patch('admin', { aiStyleExample: '  \n\t ' });
    expect(res.status).toBe(200);
    expect(await dbExample()).toBeNull();
  });

  it('trims surrounding whitespace before saving', async () => {
    const res = await patch('admin', { aiStyleExample: '  Plain example.  \n' });
    expect(res.status).toBe(200);
    expect(await dbExample()).toBe('Plain example.');
  });

  it('counts the 1500 cap in UTF-16 units (JS string length), accented text at 1500 is accepted', async () => {
    const accented = '\u00e9'.repeat(1500);
    expect((await patch('admin', { aiStyleExample: accented })).status).toBe(200);
    expect((await patch('admin', { aiStyleExample: accented + 'e' })).status).toBe(400);
    // an emoji is two units: 750 emoji fit, 751 do not
    expect((await patch('admin', { aiStyleExample: '\u{1F3C3}'.repeat(750) })).status).toBe(200);
    expect((await patch('admin', { aiStyleExample: '\u{1F3C3}'.repeat(751) })).status).toBe(400);
  });

  it('org admin of ANOTHER organization gets 403 and nothing changes', async () => {
    await db.update(organizations).set({ aiStyleExample: 'untouched' }).where(eq(organizations.id, org.id));
    const res = await patch('otheradmin', { aiStyleExample: 'from elsewhere' });
    expect(res.status).toBe(403);
    expect(await dbExample()).toBe('untouched');
  });

  it('site admin can write it', async () => {
    const res = await patch('siteadmin', { aiStyleExample: 'Written by site admin.' });
    expect(res.status).toBe(200);
    expect(await dbExample()).toBe('Written by site admin.');
  });

  it('does not reject a name that only belongs to another organization', async () => {
    const res = await patch('admin', { aiStyleExample: 'Elsewhere is a place.' });
    expect(res.status).toBe(200);
  });

  it('is preserved (not cleared) when AI is later disabled, and other-field updates leave it alone', async () => {
    await patch('admin', { aiStyleExample: 'Keep me.' });
    const res = await patch('admin', { aiEnabled: false });
    expect(res.status).toBe(200);
    expect(await dbExample()).toBe('Keep me.');
    await db.update(organizations).set({ aiEnabled: true }).where(eq(organizations.id, org.id));
  });

  it('rejects setting text while AI is disabled, but allows clearing', async () => {
    await db.update(organizations).set({ aiEnabled: false }).where(eq(organizations.id, org.id));
    const set = await patch('admin', { aiStyleExample: 'Not now.' });
    expect(set.status).toBe(403);
    const clear = await patch('admin', { aiStyleExample: null });
    expect(clear.status).toBe(200);
    await db.update(organizations).set({ aiEnabled: true }).where(eq(organizations.id, org.id));
  });

  it.each(['coach', 'athlete', 'outsider'])('forbids %s', async (key) => {
    await db.update(organizations).set({ aiStyleExample: 'untouched' }).where(eq(organizations.id, org.id));
    const res = await patch(key, { aiStyleExample: 'hacked' });
    expect(res.status).toBe(403);
    expect(await dbExample()).toBe('untouched');
  });
});

describe('aiStyleExample read exposure', () => {
  beforeAll(async () => {
    await db.update(organizations).set({ aiStyleExample: EXAMPLE, aiEnabled: true }).where(eq(organizations.id, org.id));
  });

  const reads: Array<[string, (key: string) => request.Test]> = [
    ['GET /api/organizations/:id', (k) => request(app).get(`/api/organizations/${org.id}`).set('Cookie', cookies[k])],
    ['GET /api/my-organizations', (k) => request(app).get('/api/my-organizations').set('Cookie', cookies[k])],
    ['GET /api/organizations/:id/profile', (k) => request(app).get(`/api/organizations/${org.id}/profile`).set('Cookie', cookies[k])],
    ['GET /api/organizations-with-users', (k) => request(app).get('/api/organizations-with-users').set('Cookie', cookies[k])],
    ['GET /api/auth/me/organizations', (k) => request(app).get('/api/auth/me/organizations').set('Cookie', cookies[k])],
  ];

  it.each(['coach', 'athlete', 'outsider'])('%s never receives the text from any organization read route', async (key) => {
    for (const [label, call] of reads) {
      const res = await call(key);
      expect(JSON.stringify(res.body), `${label} as ${key}`).not.toContain(MARKER);
    }
  });

  it('login response for a coach or athlete does not contain it', async () => {
    for (const key of ['coach', 'athlete']) {
      const res = await request(app).post('/api/auth/login').send({ username: `style-${key}-${ts}`, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(MARKER);
    }
  });

  it('the public directory and unauthenticated callers never receive it', async () => {
    const res = await request(app).get('/api/organizations/public');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(`Style Org ${ts}`);
    expect(JSON.stringify(res.body)).not.toContain(MARKER);
  });

  it('org admin receives it from the organization, profile, list and login reads', async () => {
    for (const [label, call] of reads.slice(0, 4)) {
      const res = await call('admin');
      expect(res.status, label).toBe(200);
      expect(JSON.stringify(res.body), label).toContain(MARKER);
    }
    const login = await request(app).post('/api/auth/login').send({ username: `style-admin-${ts}`, password: PASSWORD });
    expect(JSON.stringify(login.body)).toContain(MARKER);
  });

  it('site admin receives it from the organization, list and profile reads', async () => {
    for (const call of [
      (k: string) => request(app).get(`/api/organizations/${org.id}`).set('Cookie', cookies[k]),
      (k: string) => request(app).get('/api/organizations').set('Cookie', cookies[k]),
      (k: string) => request(app).get(`/api/organizations/${org.id}/profile`).set('Cookie', cookies[k]),
    ]) {
      const res = await call('siteadmin');
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(MARKER);
    }
  });
});
