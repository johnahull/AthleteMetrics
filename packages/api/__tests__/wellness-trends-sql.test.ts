/**
 * Test Suite: SQL-Based Wellness Trends Aggregation
 *
 * Validates that wellness trends are efficiently calculated using PostgreSQL
 * JSON functions instead of in-memory Node.js aggregation.
 *
 * Performance goals:
 * - 80-90% reduction in data transfer
 * - 5-10x faster query execution
 * - Proper statistical calculations (stddev, min, max)
 * - Fixed count aggregation bug (was hardcoded to 1)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import { wellnessResponses, wellnessTemplates, wellnessRequests, organizations, users } from '@shared/schema';
import { storage } from '../storage';
import type { WellnessTrend } from '@shared/wellness-types';
import { sql, eq } from 'drizzle-orm';

describe('getWellnessTrends with SQL aggregation', () => {
  let testOrgId: string;
  let testTemplateId: string;
  let testUserId1: string;
  let testUserId2: string;

  beforeEach(async () => {
    // Setup: Create test organization with unique name
    const timestamp = Date.now();
    const [org] = await db.insert(organizations).values({
      name: `Test Wellness Org ${timestamp}`,
      description: 'Test organization for wellness trends',
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create test users with unique usernames
    const [user1] = await db.insert(users).values({
      username: `athlete1_${timestamp}`,
      password: 'test',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      role: 'athlete',
      emails: [`athlete1_${timestamp}@test.com`],
    }).returning();
    testUserId1 = user1.id;

    const [user2] = await db.insert(users).values({
      username: `athlete2_${timestamp}`,
      password: 'test',
      firstName: 'Jane',
      lastName: 'Smith',
      fullName: 'Jane Smith',
      role: 'athlete',
      emails: [`athlete2_${timestamp}@test.com`],
    }).returning();
    testUserId2 = user2.id;

    // Create test template
    const [template] = await db.insert(wellnessTemplates).values({
      organizationId: testOrgId,
      name: 'Daily Wellness Check',
      description: 'Test template',
      config: {
        questions: [
          {
            id: 'question1',
            label: 'How are you feeling today?',
            type: 'scale',
            required: true,
            scaleMin: 1,
            scaleMax: 10,
          },
          {
            id: 'question2',
            label: 'Sleep Quality',
            type: 'scale',
            required: true,
            scaleMin: 1,
            scaleMax: 10,
          },
        ],
        statusConfig: {
          scaleOrientation: 'higher_is_better',
          redThreshold: 3,
          yellowThreshold: 6,
        },
      },
      isActive: true,
      isDefault: false,
    }).returning();
    testTemplateId = template.id;

    // Insert test wellness responses with known data
    await db.insert(wellnessResponses).values([
      {
        organizationId: testOrgId,
        userId: testUserId1,
        userFullName: 'John Doe',
        templateId: testTemplateId,
        date: '2024-01-01',
        responses: {
          question1: { label: 'How are you feeling today?', value: 8 },
          question2: { label: 'Sleep Quality', value: 7 },
        },
        submittedAt: new Date('2024-01-01T10:00:00Z'),
      },
      {
        organizationId: testOrgId,
        userId: testUserId2,
        userFullName: 'Jane Smith',
        templateId: testTemplateId,
        date: '2024-01-01',
        responses: {
          question1: { label: 'How are you feeling today?', value: 6 },
          question2: { label: 'Sleep Quality', value: 9 },
        },
        submittedAt: new Date('2024-01-01T11:00:00Z'),
      },
    ]);
  });

  afterEach(async () => {
    // Cleanup: Delete test data in correct order (respecting foreign keys)
    await db.delete(wellnessResponses).where(eq(wellnessResponses.organizationId, testOrgId));
    await db.delete(wellnessTemplates).where(eq(wellnessTemplates.organizationId, testOrgId));
    await db.delete(users).where(sql`id IN (${testUserId1}, ${testUserId2})`);
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  it('should aggregate responses by date and question', async () => {
    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(trends).toHaveLength(2); // 2 questions

    const q1Trend = trends.find(t => t.questionId === 'question1');
    expect(q1Trend).toBeDefined();
    expect(q1Trend!.questionLabel).toBe('How are you feeling today?');
    expect(q1Trend!.dataPoints).toHaveLength(1); // 1 date

    const q1DataPoint = q1Trend!.dataPoints[0];
    expect(q1DataPoint.date).toBe('2024-01-01');
    expect(q1DataPoint.value).toBe(7); // (8 + 6) / 2
    expect(q1DataPoint.count).toBe(2); // FIXED: Should be 2, not hardcoded to 1
  });

  it('should calculate correct average values', async () => {
    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    const q1Trend = trends.find(t => t.questionId === 'question1');
    const q2Trend = trends.find(t => t.questionId === 'question2');

    expect(q1Trend!.dataPoints[0].value).toBe(7); // (8 + 6) / 2
    expect(q2Trend!.dataPoints[0].value).toBe(8); // (7 + 9) / 2
  });

  it('should properly count responses per date', async () => {
    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    const q1Trend = trends.find(t => t.questionId === 'question1');

    // CRITICAL: This was the bug - count was hardcoded to 1
    expect(q1Trend!.dataPoints[0].count).toBe(2);
  });

  it('should group by date when multiple dates exist', async () => {
    // Insert more data for 2024-01-02
    await db.insert(wellnessResponses).values([
      {
        organizationId: testOrgId,
        userId: testUserId1,
        userFullName: 'John Doe',
        templateId: testTemplateId,
        date: '2024-01-02',
        responses: {
          question1: { label: 'How are you feeling today?', value: 9 },
          question2: { label: 'Sleep Quality', value: 8 },
        },
        submittedAt: new Date('2024-01-02T10:00:00Z'),
      },
    ]);

    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-01',
      endDate: '2024-01-02',
    });

    const q1Trend = trends.find(t => t.questionId === 'question1');
    expect(q1Trend!.dataPoints).toHaveLength(2); // Two dates

    const dataPoints = q1Trend!.dataPoints.sort((a, b) => a.date.localeCompare(b.date));
    expect(dataPoints[0].date).toBe('2024-01-01');
    expect(dataPoints[0].value).toBe(7); // (8 + 6) / 2
    expect(dataPoints[0].count).toBe(2);

    expect(dataPoints[1].date).toBe('2024-01-02');
    expect(dataPoints[1].value).toBe(9);
    expect(dataPoints[1].count).toBe(1);
  });

  it('should filter by question IDs if provided', async () => {
    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      questionIds: ['question1'], // Only question1
    });

    expect(trends).toHaveLength(1);
    expect(trends[0].questionId).toBe('question1');
  });

  it('should handle null/undefined values gracefully', async () => {
    // Insert response with null value
    await db.insert(wellnessResponses).values([
      {
        organizationId: testOrgId,
        userId: testUserId1,
        userFullName: 'John Doe',
        templateId: testTemplateId,
        date: '2024-01-03',
        responses: {
          question1: { label: 'How are you feeling today?', value: null },
          question2: { label: 'Text Response', value: 'Not a number' },
        },
        submittedAt: new Date('2024-01-03T10:00:00Z'),
      },
    ]);

    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-03',
      endDate: '2024-01-03',
    });

    // Should skip non-numeric values
    expect(trends).toHaveLength(0); // No valid numeric data
  });

  it('should handle date range filtering correctly', async () => {
    // Insert data outside the range
    await db.insert(wellnessResponses).values([
      {
        organizationId: testOrgId,
        userId: testUserId1,
        userFullName: 'John Doe',
        templateId: testTemplateId,
        date: '2024-02-01', // Outside range
        responses: {
          question1: { label: 'How are you feeling today?', value: 5 },
        },
        submittedAt: new Date('2024-02-01T10:00:00Z'),
      },
    ]);

    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-01',
      endDate: '2024-01-31', // Jan only
    });

    const q1Trend = trends.find(t => t.questionId === 'question1');
    expect(q1Trend!.dataPoints).toHaveLength(1); // Only Jan 1st
    expect(q1Trend!.dataPoints[0].date).toBe('2024-01-01');
  });

  it('should return empty array for date range with no data', async () => {
    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-12-01',
      endDate: '2024-12-31',
    });

    expect(trends).toEqual([]);
  });

  it('should handle single response correctly', async () => {
    // Delete one response to test single data point
    await db.delete(wellnessResponses)
      .where(sql`user_id = ${testUserId2} AND date = '2024-01-01'`);

    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    const q1Trend = trends.find(t => t.questionId === 'question1');
    expect(q1Trend!.dataPoints[0].value).toBe(8); // Single value
    expect(q1Trend!.dataPoints[0].count).toBe(1);
  });

  it('should order data points by date ascending', async () => {
    // Insert data for multiple dates
    await db.insert(wellnessResponses).values([
      {
        organizationId: testOrgId,
        userId: testUserId1,
        userFullName: 'John Doe',
        templateId: testTemplateId,
        date: '2024-01-05',
        responses: { question1: { label: 'Wellness', value: 7 } },
        submittedAt: new Date('2024-01-05T10:00:00Z'),
      },
      {
        organizationId: testOrgId,
        userId: testUserId1,
        userFullName: 'John Doe',
        templateId: testTemplateId,
        date: '2024-01-03',
        responses: { question1: { label: 'Wellness', value: 8 } },
        submittedAt: new Date('2024-01-03T10:00:00Z'),
      },
    ]);

    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    const q1Trend = trends.find(t => t.questionId === 'question1');
    const dates = q1Trend!.dataPoints.map(dp => dp.date);

    // Should be ordered: 2024-01-01, 2024-01-03, 2024-01-05
    expect(dates).toEqual(['2024-01-01', '2024-01-03', '2024-01-05']);
  });

  it('should handle organization filtering correctly', async () => {
    // Create another organization with data
    const timestamp = Date.now();
    const [otherOrg] = await db.insert(organizations).values({
      name: `Other Org ${timestamp}`,
      description: 'Other organization',
      isActive: true,
    }).returning();

    const [otherTemplate] = await db.insert(wellnessTemplates).values({
      organizationId: otherOrg.id,
      name: 'Other Template',
      config: { questions: [] },
      isActive: true,
      isDefault: false,
    }).returning();

    await db.insert(wellnessResponses).values([
      {
        organizationId: otherOrg.id,
        userId: testUserId1,
        userFullName: 'John Doe',
        templateId: otherTemplate.id,
        date: '2024-01-01',
        responses: { question1: { label: 'Wellness', value: 10 } },
        submittedAt: new Date('2024-01-01T10:00:00Z'),
      },
    ]);

    // Query for original organization only
    const trends = await storage.getWellnessTrends(testOrgId, {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    // Should not include data from other organization
    expect(trends).toHaveLength(2); // Only original org's 2 questions

    // Cleanup
    await db.delete(wellnessResponses).where(eq(wellnessResponses.organizationId, otherOrg.id));
    await db.delete(wellnessTemplates).where(eq(wellnessTemplates.organizationId, otherOrg.id));
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  });
});
