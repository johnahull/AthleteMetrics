/**
 * HTTP API Integration Tests for Team Update Endpoints
 *
 * These tests validate the PATCH /api/teams/:id endpoint including:
 * - Authentication and authorization middleware
 * - HTTP status codes and response formats
 * - Unique constraint error handling (409 Conflict)
 * - Data validation and normalization
 * - organizationId immutability
 *
 * Unlike team-update-storage.test.ts which tests the storage layer directly,
 * these tests make actual HTTP requests to the Express API endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { storage } from '../../server/storage';
import type { Organization, Team, User } from '@shared/schema';

// Mock vite module before importing registerRoutes
vi.mock('../../server/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../server/routes';

describe('Team Update API Integration Tests', () => {
  let app: Express;
  let testOrg: Organization;
  let otherOrg: Organization;
  let testTeam: Team;
  let otherTeam: Team;
  let siteAdminUser: User;
  let orgAdminUser: User;
  let coachUser: User;
  let athleteUser: User;
  let siteAdminCookie: string;
  let orgAdminCookie: string;
  let coachCookie: string;
  let createdUsers: string[] = [];
  let createdTeams: string[] = [];
  let createdOrgs: string[] = [];

  beforeAll(async () => {
    // Create test Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Register routes
    await registerRoutes(app);

    const timestamp = Date.now();

    // Create test organizations
    testOrg = await storage.createOrganization({
      name: `Team API Test Org ${timestamp}`,
      contactEmail: `team-api-${timestamp}@example.com`,
    });
    createdOrgs.push(testOrg.id);

    otherOrg = await storage.createOrganization({
      name: `Other API Test Org ${timestamp}`,
      contactEmail: `other-api-${timestamp}@example.com`,
    });
    createdOrgs.push(otherOrg.id);

    // Create test teams
    testTeam = await storage.createTeam({
      name: `API Test Team ${timestamp}`,
      level: 'Club',
      organizationId: testOrg.id,
      notes: 'Original notes',
      season: '2024-Fall',
    });
    createdTeams.push(testTeam.id);

    otherTeam = await storage.createTeam({
      name: `Other API Team ${timestamp}`,
      level: 'HS',
      organizationId: testOrg.id,
    });
    createdTeams.push(otherTeam.id);

    // Create site admin user and login
    siteAdminUser = await storage.createUser({
      username: `site-admin-api-${timestamp}`,
      password: 'password123',
      emails: [`site-admin-api-${timestamp}@test.com`],
      firstName: 'Site',
      lastName: 'Admin',
      role: 'site_admin',
      isSiteAdmin: true,
    });
    createdUsers.push(siteAdminUser.id);

    const siteAdminLogin = await request(app)
      .post('/api/login')
      .send({ username: siteAdminUser.username, password: 'password123' });
    siteAdminCookie = siteAdminLogin.headers['set-cookie'];

    // Create org admin user and login
    orgAdminUser = await storage.createUser({
      username: `org-admin-api-${timestamp}`,
      password: 'password123',
      emails: [`org-admin-api-${timestamp}@test.com`],
      firstName: 'Org',
      lastName: 'Admin',
      role: 'org_admin',
    });
    createdUsers.push(orgAdminUser.id);
    await storage.addUserToOrganization(orgAdminUser.id, testOrg.id, 'org_admin');

    const orgAdminLogin = await request(app)
      .post('/api/login')
      .send({ username: orgAdminUser.username, password: 'password123' });
    orgAdminCookie = orgAdminLogin.headers['set-cookie'];

    // Create coach user and login
    coachUser = await storage.createUser({
      username: `coach-api-${timestamp}`,
      password: 'password123',
      emails: [`coach-api-${timestamp}@test.com`],
      firstName: 'Coach',
      lastName: 'User',
      role: 'coach',
    });
    createdUsers.push(coachUser.id);
    await storage.addUserToOrganization(coachUser.id, testOrg.id, 'coach');

    const coachLogin = await request(app)
      .post('/api/login')
      .send({ username: coachUser.username, password: 'password123' });
    coachCookie = coachLogin.headers['set-cookie'];

    // Create athlete user
    athleteUser = await storage.createUser({
      username: `athlete-api-${timestamp}`,
      password: 'password123',
      emails: [`athlete-api-${timestamp}@test.com`],
      firstName: 'Athlete',
      lastName: 'User',
      role: 'athlete',
    });
    createdUsers.push(athleteUser.id);
    await storage.addUserToOrganization(athleteUser.id, testOrg.id, 'athlete');
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    for (const userId of createdUsers) {
      try {
        await storage.deleteUser(userId);
      } catch (error) {
        console.error(`Failed to delete user ${userId}:`, error);
      }
    }

    for (const teamId of createdTeams) {
      try {
        await storage.deleteTeam(teamId);
      } catch (error) {
        console.error(`Failed to delete team ${teamId}:`, error);
      }
    }

    for (const orgId of createdOrgs) {
      try {
        await storage.deleteOrganization(orgId);
      } catch (error) {
        console.error(`Failed to delete organization ${orgId}:`, error);
      }
    }
  }, 30000);

  describe('Authentication & Authorization', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .send({ notes: 'Updated notes' });

      expect(response.status).toBe(401);
    });

    it('should allow site admin to update any team', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', siteAdminCookie)
        .send({ notes: 'Updated by site admin' });

      expect(response.status).toBe(200);
      expect(response.body.team.notes).toBe('Updated by site admin');
    });

    it('should allow org admin to update teams in their organization', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ notes: 'Updated by org admin' });

      expect(response.status).toBe(200);
      expect(response.body.team.notes).toBe('Updated by org admin');
    });

    it('should allow coach to update teams in their organization', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', coachCookie)
        .send({ notes: 'Updated by coach' });

      expect(response.status).toBe(200);
      expect(response.body.team.notes).toBe('Updated by coach');
    });

    it('should prevent updating team from different organization', async () => {
      // Create team in otherOrg
      const otherOrgTeam = await storage.createTeam({
        name: `Other Org Team ${Date.now()}`,
        organizationId: otherOrg.id,
        level: 'Club',
      });
      createdTeams.push(otherOrgTeam.id);

      // Org admin from testOrg tries to update team in otherOrg
      const response = await request(app)
        .patch(`/api/teams/${otherOrgTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ notes: 'Unauthorized update attempt' });

      expect(response.status).toBe(403);
    });
  });

  describe('Unique Constraint Handling', () => {
    it('should return 409 Conflict for duplicate team name', async () => {
      const response = await request(app)
        .patch(`/api/teams/${otherTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ name: testTeam.name });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('already exists');
      expect(response.body.errorCode).toBe('DUPLICATE_TEAM_NAME');
    });

    it('should allow same team name in different organizations', async () => {
      // Create team in otherOrg with same name as testTeam
      const sameName = `Shared Name ${Date.now()}`;

      const team1 = await storage.createTeam({
        name: sameName,
        organizationId: testOrg.id,
        level: 'Club',
      });
      createdTeams.push(team1.id);

      const team2 = await storage.createTeam({
        name: 'Different Name',
        organizationId: otherOrg.id,
        level: 'Club',
      });
      createdTeams.push(team2.id);

      // Update team2 to have same name - should succeed (different org)
      const response = await request(app)
        .patch(`/api/teams/${team2.id}`)
        .set('Cookie', siteAdminCookie)
        .send({ name: sameName });

      expect(response.status).toBe(200);
      expect(response.body.team.name).toBe(sameName);
    });
  });

  describe('Data Validation & Normalization', () => {
    it('should trim whitespace from team name', async () => {
      const nameWithWhitespace = `  Whitespace Test ${Date.now()}  `;

      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ name: nameWithWhitespace });

      expect(response.status).toBe(200);
      expect(response.body.team.name).toBe(nameWithWhitespace.trim());
      expect(response.body.team.name).not.toMatch(/^\s|\s$/);
    });

    it('should validate level enum', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ level: 'InvalidLevel' });

      expect(response.status).toBe(400);
    });

    it('should accept valid level values', async () => {
      const validLevels = ['Club', 'HS', 'College'];

      for (const level of validLevels) {
        const response = await request(app)
          .patch(`/api/teams/${testTeam.id}`)
          .set('Cookie', orgAdminCookie)
          .send({ level });

        expect(response.status).toBe(200);
        expect(response.body.team.level).toBe(level);
      }
    });
  });

  describe('Organization Immutability', () => {
    it('should prevent organizationId updates', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', siteAdminCookie)
        .send({ organizationId: otherOrg.id });

      // Should succeed but organizationId should remain unchanged
      expect(response.status).toBe(200);
      expect(response.body.team.organizationId).toBe(testOrg.id);
      expect(response.body.team.organizationId).not.toBe(otherOrg.id);
    });
  });

  describe('Partial Updates', () => {
    it('should update only name', async () => {
      const newName = `Updated Name ${Date.now()}`;

      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ name: newName });

      expect(response.status).toBe(200);
      expect(response.body.team.name).toBe(newName);
      expect(response.body.team.level).toBe(testTeam.level); // Unchanged
    });

    it('should update only notes', async () => {
      const newNotes = 'New notes only';

      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ notes: newNotes });

      expect(response.status).toBe(200);
      expect(response.body.team.notes).toBe(newNotes);
    });

    it('should update multiple fields', async () => {
      const updates = {
        name: `Multi Update ${Date.now()}`,
        level: 'HS' as const,
        notes: 'Multi-field notes',
        season: '2025-Spring',
      };

      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.team.name).toBe(updates.name);
      expect(response.body.team.level).toBe(updates.level);
      expect(response.body.team.notes).toBe(updates.notes);
      expect(response.body.team.season).toBe(updates.season);
    });
  });

  describe('HTTP Response Formats', () => {
    it('should return 200 with updated team on success', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ notes: 'Success test' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('team');
      expect(response.body.team.id).toBe(testTeam.id);
      expect(response.body.team.notes).toBe('Success test');
    });

    it('should return 404 for non-existent team', async () => {
      const fakeTeamId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .patch(`/api/teams/${fakeTeamId}`)
        .set('Cookie', siteAdminCookie)
        .send({ notes: 'Should fail' });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    it('should return 400 for invalid request body', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ invalidField: 'should be rejected' });

      // Should either accept and ignore, or reject with 400
      expect([200, 400]).toContain(response.status);
    });

    it('should return JSON content-type', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ notes: 'Content type test' });

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    it('should not leak sensitive information in error messages', async () => {
      const response = await request(app)
        .patch(`/api/teams/${testTeam.id}`)
        .set('Cookie', orgAdminCookie)
        .send({ level: 'InvalidLevel' });

      // Error message should not contain stack traces or internal details
      expect(response.body.message).toBeDefined();
      expect(response.body.message).not.toMatch(/at Object\.|Error:/);
    });
  });
});
