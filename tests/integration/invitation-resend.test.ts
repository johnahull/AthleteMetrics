/**
 * Regression test: resending an invitation emails a usable link.
 *
 * With tokens hashed at rest, the stored token cannot be reversed to build a
 * link, so resend must rotate to a fresh token (store its hash, email the raw).
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { storage } from '../../packages/api/storage';
import type { Organization, User } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// Capture the invitation link (raw token) that would be emailed.
const sentInviteLinks: string[] = [];
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendInvitation: vi.fn(async (_email: string, data: { invitationLink: string }) => {
      sentInviteLinks.push(data.invitationLink);
      return true;
    }),
    sendParentInvitation: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'TestPass123!';
const tokenOf = (link: string) => new URL(link, 'http://localhost').searchParams.get('token') ?? '';

describe('Invitation resend rotates to a usable token', () => {
  let app: express.Express;
  let org: Organization;
  let admin: User;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    const ts = Date.now();
    org = await storage.createOrganization({ name: `Resend Org ${ts}`, description: 'x' });
    admin = await storage.createUser({
      username: `resendadmin${ts}`,
      password: PASSWORD,
      emails: [`resendadmin${ts}@test.com`],
      firstName: 'Re',
      lastName: 'Send',
    });
    await storage.addUserToOrganization(admin.id, org.id, 'org_admin');
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: admin.username, password: PASSWORD }).expect(200);
  });

  afterAll(async () => {
    try { await storage.deleteUser(admin.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(org.id); } catch { /* ignore */ }
  });

  it('emails a fresh, acceptable token on resend', async () => {
    const create = await agent.post('/api/invitations').send({
      firstName: 'New', lastName: 'Invitee',
      email: `resendinvitee${Date.now()}@test.com`,
      role: 'athlete',
      organizationId: org.id,
    }).expect(201);
    const firstToken = tokenOf(create.body.inviteLink);

    // Ignore the create email; capture only the resend's emailed link.
    sentInviteLinks.length = 0;
    const resend = await agent.post(`/api/invitations/${create.body.id}/resend`).send({});
    expect(resend.status).toBe(200);
    expect(sentInviteLinks.length).toBe(1);
    const resentToken = tokenOf(sentInviteLinks[0]);

    // The token was rotated...
    expect(resentToken).toBeTruthy();
    expect(resentToken).not.toBe(firstToken);
    // ...and the resent token is the one that now validates.
    expect((await storage.getInvitationByToken(resentToken))?.id).toBe(create.body.id);
    expect(await storage.getInvitationByToken(firstToken)).toBeUndefined();
  });
});
