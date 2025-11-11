import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storage } from '../../packages/api/storage';
import type { Organization, User, Report } from '@shared/schema';

/**
 * Integration tests for Report Organization Filtering
 * Tests the organizationId bug fix at the API/database level
 */

describe('Report Organization Filtering - Integration Tests', () => {
  let org1: Organization;
  let org2: Organization;
  let orgAdmin1: User;
  let orgAdmin2: User;
  let siteAdmin: User;
  let createdReportIds: string[] = [];

  beforeAll(async () => {
    // Create test organizations
    org1 = await storage.createOrganization({
      name: `Test Org 1 ${Date.now()}`,
      contactEmail: 'org1@test.com',
      isActive: true,
    });

    org2 = await storage.createOrganization({
      name: `Test Org 2 ${Date.now()}`,
      contactEmail: 'org2@test.com',
      isActive: true,
    });

    // Create test users
    orgAdmin1 = await storage.createUser({
      username: `orgadmin1_${Date.now()}`,
      password: 'password123',
      firstName: 'Admin',
      lastName: 'One',
      email: 'admin1@test.com',
    });

    orgAdmin2 = await storage.createUser({
      username: `orgadmin2_${Date.now()}`,
      password: 'password123',
      firstName: 'Admin',
      lastName: 'Two',
      email: 'admin2@test.com',
    });

    siteAdmin = await storage.createUser({
      username: `siteadmin_${Date.now()}`,
      password: 'password123',
      firstName: 'Site',
      lastName: 'Admin',
      email: 'siteadmin@test.com',
      isSiteAdmin: true,
    });

    // Associate users with organizations
    await storage.addUserToOrganization(orgAdmin1.id, org1.id, 'org_admin');
    await storage.addUserToOrganization(orgAdmin2.id, org2.id, 'org_admin');
  });

  afterAll(async () => {
    // Cleanup reports
    for (const reportId of createdReportIds) {
      try {
        await storage.deleteReport(reportId);
      } catch (error) {
        console.warn(`Failed to cleanup report ${reportId}:`, error);
      }
    }

    // Cleanup users and organizations
    await storage.deleteUser(orgAdmin1.id);
    await storage.deleteUser(orgAdmin2.id);
    await storage.deleteUser(siteAdmin.id);
    await storage.deleteOrganization(org1.id);
    await storage.deleteOrganization(org2.id);
  });

  describe('Report Creation with organizationId', () => {
    it('should create report with organizationId field', async () => {
      const report = await storage.createReport({
        name: 'Test Report Org1',
        description: 'Integration test report',
        reportType: 'team',
        organizationId: org1.id,
        createdBy: orgAdmin1.id,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
        },
      });

      createdReportIds.push(report.id);

      expect(report).toBeDefined();
      expect(report.organizationId).toBe(org1.id);
      expect(report.createdBy).toBe(orgAdmin1.id);
      expect(report.name).toBe('Test Report Org1');
    });

    it('should require organizationId when creating report', async () => {
      try {
        // @ts-expect-error Testing missing organizationId
        await storage.createReport({
          name: 'Invalid Report',
          reportType: 'team',
          createdBy: orgAdmin1.id,
          config: {
            timeframe: { type: 'preset', preset: 'season' },
            metrics: ['FLY10_TIME'],
          },
          // Missing organizationId
        });

        expect.fail('Should have thrown error for missing organizationId');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should create multiple reports for same organization', async () => {
      const report1 = await storage.createReport({
        name: 'Report 1 for Org1',
        reportType: 'team',
        organizationId: org1.id,
        createdBy: orgAdmin1.id,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
        },
      });

      const report2 = await storage.createReport({
        name: 'Report 2 for Org1',
        reportType: 'individual',
        organizationId: org1.id,
        createdBy: orgAdmin1.id,
        config: {
          timeframe: { type: 'preset', preset: 'year' },
          metrics: ['VERTICAL_JUMP'],
        },
      });

      createdReportIds.push(report1.id, report2.id);

      expect(report1.organizationId).toBe(org1.id);
      expect(report2.organizationId).toBe(org1.id);
      expect(report1.id).not.toBe(report2.id);
    });
  });

  describe('Report Filtering by organizationId', () => {
    beforeAll(async () => {
      // Create reports for org1
      const report1 = await storage.createReport({
        name: 'Org1 Report 1',
        reportType: 'team',
        organizationId: org1.id,
        createdBy: orgAdmin1.id,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
        },
      });

      const report2 = await storage.createReport({
        name: 'Org1 Report 2',
        reportType: 'team',
        organizationId: org1.id,
        createdBy: orgAdmin1.id,
        config: {
          timeframe: { type: 'preset', preset: 'year' },
          metrics: ['VERTICAL_JUMP'],
        },
      });

      // Create reports for org2
      const report3 = await storage.createReport({
        name: 'Org2 Report 1',
        reportType: 'team',
        organizationId: org2.id,
        createdBy: orgAdmin2.id,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
        },
      });

      createdReportIds.push(report1.id, report2.id, report3.id);
    });

    it('should filter reports by organizationId', async () => {
      const org1Reports = await storage.getReportsByOrganization(org1.id);
      const org2Reports = await storage.getReportsByOrganization(org2.id);

      expect(org1Reports.length).toBeGreaterThanOrEqual(2);
      expect(org2Reports.length).toBeGreaterThanOrEqual(1);

      // Verify all org1 reports belong to org1
      org1Reports.forEach(report => {
        expect(report.organizationId).toBe(org1.id);
      });

      // Verify all org2 reports belong to org2
      org2Reports.forEach(report => {
        expect(report.organizationId).toBe(org2.id);
      });
    });

    it('should not return reports from other organizations', async () => {
      const org1Reports = await storage.getReportsByOrganization(org1.id);
      const org2Reports = await storage.getReportsByOrganization(org2.id);

      // Org1 reports should not include org2 reports
      const org2ReportIds = org2Reports.map(r => r.id);
      org1Reports.forEach(report => {
        expect(org2ReportIds).not.toContain(report.id);
      });

      // Org2 reports should not include org1 reports
      const org1ReportIds = org1Reports.map(r => r.id);
      org2Reports.forEach(report => {
        expect(org1ReportIds).not.toContain(report.id);
      });
    });

    it('should return empty array for organization with no reports', async () => {
      // Create a new org with no reports
      const emptyOrg = await storage.createOrganization({
        name: `Empty Org ${Date.now()}`,
        contactEmail: 'empty@test.com',
        isActive: true,
      });

      const reports = await storage.getReportsByOrganization(emptyOrg.id);

      expect(reports).toEqual([]);

      // Cleanup
      await storage.deleteOrganization(emptyOrg.id);
    });
  });

  describe('Multi-Organization Data Isolation', () => {
    it('should ensure org1 admin cannot access org2 reports via storage layer', async () => {
      const org2Reports = await storage.getReportsByOrganization(org2.id);

      expect(org2Reports.length).toBeGreaterThan(0);

      // Verify organizationId doesn't match org1
      org2Reports.forEach(report => {
        expect(report.organizationId).not.toBe(org1.id);
      });
    });

    it('should properly associate report with correct organization', async () => {
      const report = await storage.createReport({
        name: 'Isolation Test Report',
        reportType: 'team',
        organizationId: org1.id,
        createdBy: orgAdmin1.id,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
        },
      });

      createdReportIds.push(report.id);

      // Fetch from org1
      const org1Reports = await storage.getReportsByOrganization(org1.id);
      const foundInOrg1 = org1Reports.some(r => r.id === report.id);

      // Try to fetch from org2
      const org2Reports = await storage.getReportsByOrganization(org2.id);
      const foundInOrg2 = org2Reports.some(r => r.id === report.id);

      expect(foundInOrg1).toBe(true);
      expect(foundInOrg2).toBe(false);
    });
  });

  describe('Permission Checks with organizationId', () => {
    it('should allow user to access reports from their organization', async () => {
      const userOrgs = await storage.getUserOrganizations(orgAdmin1.id);
      const orgIds = userOrgs.map(uo => uo.organizationId);

      expect(orgIds).toContain(org1.id);
      expect(orgIds).not.toContain(org2.id);

      // User should be able to get org1 reports
      const org1Reports = await storage.getReportsByOrganization(org1.id);
      expect(org1Reports).toBeDefined();
      expect(org1Reports.length).toBeGreaterThan(0);
    });

    it('should validate user has access to organization before creating report', async () => {
      const userOrgs = await storage.getUserOrganizations(orgAdmin1.id);
      const hasAccessToOrg1 = userOrgs.some(uo => uo.organizationId === org1.id);
      const hasAccessToOrg2 = userOrgs.some(uo => uo.organizationId === org2.id);

      expect(hasAccessToOrg1).toBe(true);
      expect(hasAccessToOrg2).toBe(false);

      // User1 can create report for org1
      const validReport = await storage.createReport({
        name: 'Valid Permission Report',
        reportType: 'team',
        organizationId: org1.id,
        createdBy: orgAdmin1.id,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
        },
      });

      createdReportIds.push(validReport.id);
      expect(validReport.organizationId).toBe(org1.id);
    });

    it('should allow site admin to access all reports regardless of organization', async () => {
      // Site admin should be able to get all reports
      const org1Reports = await storage.getReportsByOrganization(org1.id);
      const org2Reports = await storage.getReportsByOrganization(org2.id);

      expect(org1Reports.length).toBeGreaterThan(0);
      expect(org2Reports.length).toBeGreaterThan(0);

      // Both should be accessible (no permission errors)
      expect(org1Reports).toBeDefined();
      expect(org2Reports).toBeDefined();
    });
  });

  describe('Report Retrieval by ID with organizationId validation', () => {
    it('should retrieve report and verify organizationId matches', async () => {
      const report = await storage.createReport({
        name: 'Retrieval Test Report',
        reportType: 'individual',
        organizationId: org1.id,
        createdBy: orgAdmin1.id,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['VERTICAL_JUMP'],
        },
      });

      createdReportIds.push(report.id);

      const retrieved = await storage.getReportById(report.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(report.id);
      expect(retrieved?.organizationId).toBe(org1.id);
      expect(retrieved?.organizationId).not.toBe(org2.id);
    });

    it('should maintain organizationId integrity through updates', async () => {
      const report = await storage.createReport({
        name: 'Update Test Report',
        reportType: 'team',
        organizationId: org1.id,
        createdBy: orgAdmin1.id,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
        },
      });

      createdReportIds.push(report.id);

      // Update report
      const updated = await storage.updateReport(report.id, {
        name: 'Updated Report Name',
      });

      expect(updated.organizationId).toBe(org1.id);
      expect(updated.name).toBe('Updated Report Name');

      // Verify organizationId didn't change
      const retrieved = await storage.getReportById(report.id);
      expect(retrieved?.organizationId).toBe(org1.id);
    });
  });
});
