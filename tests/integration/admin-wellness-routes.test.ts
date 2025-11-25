/**
 * Integration Tests for Admin Wellness API Routes
 *
 * Tests verify:
 * - GET /api/admin/wellness/templates - List system templates
 * - GET /api/admin/wellness/templates/:id/usage - Get usage statistics
 * - POST /api/admin/wellness/templates - Create system template
 * - PUT /api/admin/wellness/templates/:id - Update system template
 * - DELETE /api/admin/wellness/templates/:id - Delete system template
 *
 * All endpoints require site admin authentication.
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import {
  organizations,
  users,
  wellnessTemplates,
} from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import type { WellnessTemplateConfig } from '@shared/wellness-types';

let app: express.Application;
let siteAdmin: any;
let regularUser: any;
let testOrg: any;
let siteAdminCookie: string;
let regularUserCookie: string;

const createdTemplateIds: string[] = [];

// Valid template config for testing
const validTemplateConfig: WellnessTemplateConfig = {
  questions: [
    {
      id: 'q1',
      type: 'scale',
      label: 'How are you feeling today?',
      required: true,
      scaleMin: 1,
      scaleMax: 10,
    },
  ],
  statusConfig: {
    scaleOrientation: 'higher_is_better',
    calculationMethod: 'average',
    redThreshold: 3,
    yellowThreshold: 7,
    injuryQuestionIds: [],
    injuryOverride: true,
  },
};

beforeAll(async () => {
  // Setup Express app with routes
  app = express();
  app.use(express.json());
  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
    })
  );

  // Add mock login endpoint for testing
  app.post('/mock-login', async (req: any, res: any) => {
    const { userId, isSiteAdmin } = req.body;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    req.session.user = {
      id: user.id,
      emails: user.emails,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: 'coach',
      isSiteAdmin: isSiteAdmin ?? user.isSiteAdmin ?? false,
    };
    res.json({ success: true });
  });

  // Import and register admin wellness routes
  const { registerAdminWellnessRoutes } = await import('../../packages/api/routes/admin-wellness-routes');
  registerAdminWellnessRoutes(app);

  // Create test organization
  const [org] = await db.insert(organizations).values({
    name: `Admin Wellness Test Org ${Date.now()}`,
    description: 'Test organization for admin wellness route tests',
    orgType: 'club',
  }).returning();
  testOrg = org;

  // Create site admin user
  const [admin] = await db.insert(users).values({
    username: `admin_wellness_siteadmin_${Date.now()}`,
    emails: ['admin.wellness.siteadmin@test.com'],
    password: 'hashed_password_here',
    firstName: 'Site',
    lastName: 'Admin',
    fullName: 'Site Admin',
    isSiteAdmin: true,
  }).returning();
  siteAdmin = admin;

  // Create regular (non-admin) user
  const [regular] = await db.insert(users).values({
    username: `admin_wellness_regular_${Date.now()}`,
    emails: ['admin.wellness.regular@test.com'],
    password: 'hashed_password_here',
    firstName: 'Regular',
    lastName: 'User',
    fullName: 'Regular User',
    isSiteAdmin: false,
  }).returning();
  regularUser = regular;

  // Get session cookies
  const adminLoginRes = await request(app)
    .post('/mock-login')
    .send({ userId: siteAdmin.id, isSiteAdmin: true });
  siteAdminCookie = adminLoginRes.headers['set-cookie']?.[0] || '';

  const regularLoginRes = await request(app)
    .post('/mock-login')
    .send({ userId: regularUser.id, isSiteAdmin: false });
  regularUserCookie = regularLoginRes.headers['set-cookie']?.[0] || '';
});

afterEach(async () => {
  // Clean up created templates
  for (const id of createdTemplateIds) {
    try {
      await db.delete(wellnessTemplates).where(eq(wellnessTemplates.id, id));
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
  createdTemplateIds.length = 0;
});

afterAll(async () => {
  // Clean up test data
  if (siteAdmin?.id) {
    await db.delete(users).where(eq(users.id, siteAdmin.id));
  }
  if (regularUser?.id) {
    await db.delete(users).where(eq(users.id, regularUser.id));
  }
  if (testOrg?.id) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
});

describe('GET /api/admin/wellness/templates', () => {
  it('should return system templates for site admin', async () => {
    // Create a system template for testing
    const [template] = await db.insert(wellnessTemplates).values({
      name: `Test System Template ${Date.now()}`,
      description: 'Test template for listing',
      organizationId: null, // System template
      createdBy: siteAdmin.id,
      config: validTemplateConfig,
      isActive: true,
      isSystemSeeded: true,
    }).returning();
    createdTemplateIds.push(template.id);

    const res = await request(app)
      .get('/api/admin/wellness/templates')
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should include our created template
    const found = res.body.find((t: any) => t.id === template.id);
    expect(found).toBeDefined();
    expect(found.name).toContain('Test System Template');
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app)
      .get('/api/admin/wellness/templates');

    expect(res.status).toBe(401);
  });

  it('should return 403 for non-site-admin user', async () => {
    const res = await request(app)
      .get('/api/admin/wellness/templates')
      .set('Cookie', regularUserCookie);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/wellness/templates/:id/usage', () => {
  it('should return usage statistics for system template', async () => {
    // Create a system template
    const [template] = await db.insert(wellnessTemplates).values({
      name: `Usage Test Template ${Date.now()}`,
      description: 'Test template for usage stats',
      organizationId: null,
      createdBy: siteAdmin.id,
      config: validTemplateConfig,
      isActive: true,
      isSystemSeeded: true,
    }).returning();
    createdTemplateIds.push(template.id);

    const res = await request(app)
      .get(`/api/admin/wellness/templates/${template.id}/usage`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('organizationCount');
  });

  it('should return 404 for non-existent template', async () => {
    const res = await request(app)
      .get('/api/admin/wellness/templates/00000000-0000-0000-0000-000000000000/usage')
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(404);
  });

  it('should return 400 for non-system template', async () => {
    // Create an organization template (not system)
    const [template] = await db.insert(wellnessTemplates).values({
      name: `Org Template ${Date.now()}`,
      description: 'Organization template',
      organizationId: testOrg.id, // Has organization
      createdBy: siteAdmin.id,
      config: validTemplateConfig,
      isActive: true,
      isSystemSeeded: false,
    }).returning();
    createdTemplateIds.push(template.id);

    const res = await request(app)
      .get(`/api/admin/wellness/templates/${template.id}/usage`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('not a system template');
  });

  it('should return 403 for non-site-admin user', async () => {
    const res = await request(app)
      .get('/api/admin/wellness/templates/some-id/usage')
      .set('Cookie', regularUserCookie);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/wellness/templates', () => {
  it('should create a new system template for site admin', async () => {
    const templateData = {
      name: `New System Template ${Date.now()}`,
      description: 'Created via API test',
      config: validTemplateConfig,
      isActive: true,
      category: 'general',
      tags: ['test', 'api'],
    };

    const res = await request(app)
      .post('/api/admin/wellness/templates')
      .set('Cookie', siteAdminCookie)
      .send(templateData);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe(templateData.name);
    expect(res.body.organizationId).toBeNull(); // System template
    expect(res.body.isSystemSeeded).toBe(true);

    createdTemplateIds.push(res.body.id);
  });

  it('should return 400 for invalid template data', async () => {
    const res = await request(app)
      .post('/api/admin/wellness/templates')
      .set('Cookie', siteAdminCookie)
      .send({
        // Missing required fields
        description: 'Invalid template',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/admin/wellness/templates')
      .send({ name: 'Test', config: validTemplateConfig });

    expect(res.status).toBe(401);
  });

  it('should return 403 for non-site-admin user', async () => {
    const res = await request(app)
      .post('/api/admin/wellness/templates')
      .set('Cookie', regularUserCookie)
      .send({ name: 'Test', config: validTemplateConfig });

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admin/wellness/templates/:id', () => {
  it('should update a system template', async () => {
    // Create template to update
    const [template] = await db.insert(wellnessTemplates).values({
      name: `Template to Update ${Date.now()}`,
      description: 'Original description',
      organizationId: null,
      createdBy: siteAdmin.id,
      config: validTemplateConfig,
      isActive: true,
      isSystemSeeded: true,
    }).returning();
    createdTemplateIds.push(template.id);

    const updateData = {
      name: 'Updated Template Name',
      description: 'Updated description',
    };

    const res = await request(app)
      .put(`/api/admin/wellness/templates/${template.id}`)
      .set('Cookie', siteAdminCookie)
      .send(updateData);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(updateData.name);
    expect(res.body.description).toBe(updateData.description);
  });

  it('should return 404 for non-existent template', async () => {
    const res = await request(app)
      .put('/api/admin/wellness/templates/00000000-0000-0000-0000-000000000000')
      .set('Cookie', siteAdminCookie)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(404);
  });

  it('should return 403 for non-system template', async () => {
    // Create an organization template
    const [template] = await db.insert(wellnessTemplates).values({
      name: `Org Template ${Date.now()}`,
      description: 'Organization template',
      organizationId: testOrg.id,
      createdBy: siteAdmin.id,
      config: validTemplateConfig,
      isActive: true,
      isSystemSeeded: false,
    }).returning();
    createdTemplateIds.push(template.id);

    const res = await request(app)
      .put(`/api/admin/wellness/templates/${template.id}`)
      .set('Cookie', siteAdminCookie)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('only update system templates');
  });
});

describe('DELETE /api/admin/wellness/templates/:id', () => {
  it('should delete a system template', async () => {
    // Create template to delete
    const [template] = await db.insert(wellnessTemplates).values({
      name: `Template to Delete ${Date.now()}`,
      description: 'Will be deleted',
      organizationId: null,
      createdBy: siteAdmin.id,
      config: validTemplateConfig,
      isActive: true,
      isSystemSeeded: true,
    }).returning();

    const res = await request(app)
      .delete(`/api/admin/wellness/templates/${template.id}`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(204);

    // Verify deletion
    const deleted = await db.query.wellnessTemplates.findFirst({
      where: eq(wellnessTemplates.id, template.id),
    });
    expect(deleted).toBeUndefined();
  });

  it('should return 404 for non-existent template', async () => {
    const res = await request(app)
      .delete('/api/admin/wellness/templates/00000000-0000-0000-0000-000000000000')
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(404);
  });

  it('should return 403 for non-system template', async () => {
    // Create an organization template
    const [template] = await db.insert(wellnessTemplates).values({
      name: `Org Template ${Date.now()}`,
      description: 'Organization template',
      organizationId: testOrg.id,
      createdBy: siteAdmin.id,
      config: validTemplateConfig,
      isActive: true,
      isSystemSeeded: false,
    }).returning();
    createdTemplateIds.push(template.id);

    const res = await request(app)
      .delete(`/api/admin/wellness/templates/${template.id}`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('only delete system templates');
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app)
      .delete('/api/admin/wellness/templates/some-id');

    expect(res.status).toBe(401);
  });

  it('should return 403 for non-site-admin user', async () => {
    const res = await request(app)
      .delete('/api/admin/wellness/templates/some-id')
      .set('Cookie', regularUserCookie);

    expect(res.status).toBe(403);
  });
});
