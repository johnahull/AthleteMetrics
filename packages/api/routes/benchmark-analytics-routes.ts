/**
 * Benchmark Analytics Routes
 * Provides aggregation and analytics endpoints for benchmark tracking
 */

import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { BenchmarkAnalyticsService } from '../services/benchmark-analytics-service';
import { requireAuth } from '../middleware';
import { isSiteAdmin } from '../utils/auth-helpers';
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from '../constants/rate-limits';
import { db } from '../db';
import { teams } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

// Valid gender values from database schema
const VALID_GENDERS = ['Male', 'Female', 'Not Specified'] as const;
type ValidGender = typeof VALID_GENDERS[number];

// Birth year validation constants
const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = CURRENT_YEAR - 100; // Reasonable minimum (100 years old)
const MAX_BIRTH_YEAR = CURRENT_YEAR + 10; // Reasonable maximum (10 years in future for youth)

/**
 * Type predicate to check if a string is a valid gender
 */
function isValidGender(g: string): g is ValidGender {
  return (VALID_GENDERS as readonly string[]).includes(g);
}

/**
 * Validates and sanitizes gender values
 * @param genders Array of gender strings from query params
 * @returns Sanitized array of valid genders, or empty array if none are valid
 */
function validateGenders(genders: string[]): ValidGender[] {
  return genders.filter(isValidGender);
}

/**
 * Validates birth year is within reasonable range
 * @param year Birth year to validate
 * @returns Error message if invalid, null if valid
 */
function validateBirthYear(year: number): string | null {
  if (year < MIN_BIRTH_YEAR || year > MAX_BIRTH_YEAR) {
    return `Birth year must be between ${MIN_BIRTH_YEAR} and ${MAX_BIRTH_YEAR}`;
  }
  return null;
}

/**
 * Validates team IDs belong to the specified organization
 * @param teamIds Array of team IDs to validate
 * @param organizationId Organization ID to check against
 * @returns True if all teams belong to organization, false otherwise
 */
async function validateTeamOwnership(teamIds: string[], organizationId: string): Promise<boolean> {
  const userTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(
      eq(teams.organizationId, organizationId),
      inArray(teams.id, teamIds)
    ));

  return userTeams.length === teamIds.length;
}

// Rate limiting for analytics endpoints
const analyticsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.ANALYTICS,
  message: {
    message: process.env.ANALYTICS_RATE_LIMIT_MESSAGE || 'Too many analytics requests, please try again later.',
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';
    if (isProduction) {
      return false;
    }
    if (process.env.BYPASS_ANALYTICS_RATE_LIMIT === 'true') {
      return req.session?.user?.isSiteAdmin === true;
    }
    return false;
  },
});

export function registerBenchmarkAnalyticsRoutes(app: Express) {
  const service = new BenchmarkAnalyticsService();

  /**
   * GET /api/analytics/benchmarks/aggregation
   * Returns achievement rates for all enabled benchmarks in an organization
   * Query params:
   *   - organizationId (required)
   *   - teamIds (optional, comma-separated)
   *   - genders (optional, comma-separated)
   *   - birthYearFrom (optional, number)
   *   - birthYearTo (optional, number)
   *   - benchmarkIds (optional, comma-separated)
   */
  app.get(
    '/api/analytics/benchmarks/aggregation',
    analyticsLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: 'User not authenticated' });
        }

        // Get organizationId from query or user's primary organization
        let organizationId = req.query.organizationId as string | undefined;

        if (!organizationId && !isSiteAdmin(user)) {
          organizationId = user.primaryOrganizationId;
        }

        if (!organizationId) {
          return res.status(400).json({ message: 'organizationId is required' });
        }

        // Permission check: non-admin users can only access their organization
        if (!isSiteAdmin(user) && user.primaryOrganizationId !== organizationId) {
          return res.status(403).json({ message: 'Access denied - organization mismatch' });
        }

        // Parse optional filter parameters
        const teamIdsParam = req.query.teamIds as string | undefined;
        const teamIds = teamIdsParam
          ? teamIdsParam.split(',').map((id) => id.trim()).filter(id => id.length > 0)
          : undefined;

        // Validate team ownership for non-admin users
        if (teamIds && teamIds.length > 0 && !isSiteAdmin(user)) {
          const isValid = await validateTeamOwnership(teamIds, organizationId);
          if (!isValid) {
            return res.status(403).json({
              message: 'Access denied - one or more team IDs do not belong to your organization'
            });
          }
        }

        const gendersParam = req.query.genders as string | undefined;
        const rawGenders = gendersParam ? gendersParam.split(',').map((g) => g.trim()) : undefined;

        // Validate and sanitize genders
        let genders: string[] | undefined;
        if (rawGenders && rawGenders.length > 0) {
          genders = validateGenders(rawGenders);
          if (genders.length === 0) {
            return res.status(400).json({
              message: `Invalid gender values. Must be one of: ${VALID_GENDERS.join(', ')}`
            });
          }
        }

        const birthYearFromStr = req.query.birthYearFrom as string | undefined;
        const birthYearFrom = birthYearFromStr ? parseInt(birthYearFromStr, 10) : undefined;

        const birthYearToStr = req.query.birthYearTo as string | undefined;
        const birthYearTo = birthYearToStr ? parseInt(birthYearToStr, 10) : undefined;

        const benchmarkIdsParam = req.query.benchmarkIds as string | undefined;
        const benchmarkIds = benchmarkIdsParam
          ? benchmarkIdsParam.split(',').map((id) => id.trim()).filter(id => id.length > 0)
          : undefined;

        // Validate birth year range
        if (birthYearFrom !== undefined && isNaN(birthYearFrom)) {
          return res.status(400).json({ message: 'birthYearFrom must be a valid number' });
        }
        if (birthYearTo !== undefined && isNaN(birthYearTo)) {
          return res.status(400).json({ message: 'birthYearTo must be a valid number' });
        }

        // Validate birth year bounds
        if (birthYearFrom !== undefined) {
          const error = validateBirthYear(birthYearFrom);
          if (error) {
            return res.status(400).json({ message: error });
          }
        }
        if (birthYearTo !== undefined) {
          const error = validateBirthYear(birthYearTo);
          if (error) {
            return res.status(400).json({ message: error });
          }
        }

        if (
          birthYearFrom !== undefined &&
          birthYearTo !== undefined &&
          birthYearFrom > birthYearTo
        ) {
          return res
            .status(400)
            .json({ message: 'birthYearFrom must be less than or equal to birthYearTo' });
        }

        const result = await service.getTeamBenchmarkAggregation(organizationId, {
          teamIds,
          genders,
          birthYearFrom,
          birthYearTo,
          benchmarkIds,
        });

        res.json(result);
      } catch (error) {
        console.error('Get benchmark aggregation error:', error);
        const message =
          error instanceof Error ? error.message : 'Failed to fetch benchmark aggregation';
        res.status(500).json({ message });
      }
    }
  );

  /**
   * GET /api/analytics/benchmarks/for-metric/:metricCode
   * Returns all enabled benchmarks for a specific metric
   * Query params:
   *   - organizationId (required)
   */
  app.get(
    '/api/analytics/benchmarks/for-metric/:metricCode',
    analyticsLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: 'User not authenticated' });
        }

        const metricCode = req.params.metricCode;
        if (!metricCode) {
          return res.status(400).json({ message: 'metricCode is required' });
        }

        // Get organizationId from query or user's primary organization
        let organizationId = req.query.organizationId as string | undefined;

        if (!organizationId && !isSiteAdmin(user)) {
          organizationId = user.primaryOrganizationId;
        }

        if (!organizationId) {
          return res.status(400).json({ message: 'organizationId is required' });
        }

        // Permission check: non-admin users can only access their organization
        if (!isSiteAdmin(user) && user.primaryOrganizationId !== organizationId) {
          return res.status(403).json({ message: 'Access denied - organization mismatch' });
        }

        const result = await service.getBenchmarksForMetric(organizationId, metricCode);

        res.json(result);
      } catch (error) {
        console.error('Get benchmarks for metric error:', error);
        const message =
          error instanceof Error ? error.message : 'Failed to fetch benchmarks for metric';
        res.status(500).json({ message });
      }
    }
  );

  /**
   * GET /api/analytics/benchmarks/:benchmarkId/progress
   * Returns time-series snapshots of benchmark achievement rates
   * Query params:
   *   - organizationId (required)
   *   - startDate (optional, ISO string)
   *   - endDate (optional, ISO string)
   *   - interval (optional): 'day' | 'week' | 'month'
   *   - teamIds (optional, comma-separated)
   *   - genders (optional, comma-separated)
   */
  app.get(
    '/api/analytics/benchmarks/:benchmarkId/progress',
    analyticsLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: 'User not authenticated' });
        }

        const benchmarkId = req.params.benchmarkId;
        if (!benchmarkId) {
          return res.status(400).json({ message: 'benchmarkId is required' });
        }

        // Get organizationId from query or user's primary organization
        let organizationId = req.query.organizationId as string | undefined;

        if (!organizationId && !isSiteAdmin(user)) {
          organizationId = user.primaryOrganizationId;
        }

        if (!organizationId) {
          return res.status(400).json({ message: 'organizationId is required' });
        }

        // Permission check: non-admin users can only access their organization
        if (!isSiteAdmin(user) && user.primaryOrganizationId !== organizationId) {
          return res.status(403).json({ message: 'Access denied - organization mismatch' });
        }

        // Parse optional parameters
        const startDateStr = req.query.startDate as string | undefined;
        const startDate = startDateStr ? new Date(startDateStr) : undefined;

        const endDateStr = req.query.endDate as string | undefined;
        const endDate = endDateStr ? new Date(endDateStr) : undefined;

        const interval = req.query.interval as 'day' | 'week' | 'month' | undefined;

        const teamIdsParam = req.query.teamIds as string | undefined;
        const teamIds = teamIdsParam
          ? teamIdsParam.split(',').map((id) => id.trim()).filter(id => id.length > 0)
          : undefined;

        // Validate team ownership for non-admin users
        if (teamIds && teamIds.length > 0 && !isSiteAdmin(user)) {
          const isValid = await validateTeamOwnership(teamIds, organizationId);
          if (!isValid) {
            return res.status(403).json({
              message: 'Access denied - one or more team IDs do not belong to your organization'
            });
          }
        }

        const gendersParam = req.query.genders as string | undefined;
        const rawGenders = gendersParam ? gendersParam.split(',').map((g) => g.trim()) : undefined;

        // Validate and sanitize genders
        let genders: string[] | undefined;
        if (rawGenders && rawGenders.length > 0) {
          genders = validateGenders(rawGenders);
          if (genders.length === 0) {
            return res.status(400).json({
              message: `Invalid gender values. Must be one of: ${VALID_GENDERS.join(', ')}`
            });
          }
        }

        // Validate dates
        if (startDate && isNaN(startDate.getTime())) {
          return res.status(400).json({ message: 'startDate must be a valid ISO date string' });
        }
        if (endDate && isNaN(endDate.getTime())) {
          return res.status(400).json({ message: 'endDate must be a valid ISO date string' });
        }
        if (startDate && endDate && startDate > endDate) {
          return res.status(400).json({ message: 'startDate must be before endDate' });
        }

        // Validate interval
        if (interval && !['day', 'week', 'month'].includes(interval)) {
          return res.status(400).json({ message: 'interval must be one of: day, week, month' });
        }

        const result = await service.getBenchmarkProgressOverTime(organizationId, benchmarkId, {
          startDate,
          endDate,
          interval,
          teamIds,
          genders,
        });

        res.json(result);
      } catch (error) {
        console.error('Get benchmark progress over time error:', error);
        const message =
          error instanceof Error ? error.message : 'Failed to fetch benchmark progress over time';
        res.status(500).json({ message });
      }
    }
  );

  /**
   * GET /api/analytics/benchmarks/:benchmarkId/athletes
   * Returns array of athlete IDs filtered by benchmark status
   * Query params:
   *   - organizationId (required)
   *   - status (required): 'met' | 'unmet' | 'no_data'
   *   - teamIds (optional, comma-separated)
   *   - genders (optional, comma-separated)
   *   - birthYearFrom (optional, number)
   *   - birthYearTo (optional, number)
   */
  app.get(
    '/api/analytics/benchmarks/:benchmarkId/athletes',
    analyticsLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const user = req.session.user;
        if (!user?.id) {
          return res.status(401).json({ message: 'User not authenticated' });
        }

        const benchmarkId = req.params.benchmarkId;
        if (!benchmarkId) {
          return res.status(400).json({ message: 'benchmarkId is required' });
        }

        // Get organizationId from query or user's primary organization
        let organizationId = req.query.organizationId as string | undefined;

        if (!organizationId && !isSiteAdmin(user)) {
          organizationId = user.primaryOrganizationId;
        }

        if (!organizationId) {
          return res.status(400).json({ message: 'organizationId is required' });
        }

        // Permission check: non-admin users can only access their organization
        if (!isSiteAdmin(user) && user.primaryOrganizationId !== organizationId) {
          return res.status(403).json({ message: 'Access denied - organization mismatch' });
        }

        // Validate status parameter
        const status = req.query.status as string | undefined;
        if (!status) {
          return res.status(400).json({ message: 'status query parameter is required' });
        }
        if (!['met', 'unmet', 'no_data'].includes(status)) {
          return res
            .status(400)
            .json({ message: 'status must be one of: met, unmet, no_data' });
        }

        // Parse optional filter parameters
        const teamIdsParam = req.query.teamIds as string | undefined;
        const teamIds = teamIdsParam
          ? teamIdsParam.split(',').map((id) => id.trim()).filter(id => id.length > 0)
          : undefined;

        // Validate team ownership for non-admin users
        if (teamIds && teamIds.length > 0 && !isSiteAdmin(user)) {
          const isValid = await validateTeamOwnership(teamIds, organizationId);
          if (!isValid) {
            return res.status(403).json({
              message: 'Access denied - one or more team IDs do not belong to your organization'
            });
          }
        }

        const gendersParam = req.query.genders as string | undefined;
        const rawGenders = gendersParam ? gendersParam.split(',').map((g) => g.trim()) : undefined;

        // Validate and sanitize genders
        let genders: string[] | undefined;
        if (rawGenders && rawGenders.length > 0) {
          genders = validateGenders(rawGenders);
          if (genders.length === 0) {
            return res.status(400).json({
              message: `Invalid gender values. Must be one of: ${VALID_GENDERS.join(', ')}`
            });
          }
        }

        const birthYearFromStr = req.query.birthYearFrom as string | undefined;
        const birthYearFrom = birthYearFromStr ? parseInt(birthYearFromStr, 10) : undefined;

        const birthYearToStr = req.query.birthYearTo as string | undefined;
        const birthYearTo = birthYearToStr ? parseInt(birthYearToStr, 10) : undefined;

        // Validate birth year range
        if (birthYearFrom !== undefined && isNaN(birthYearFrom)) {
          return res.status(400).json({ message: 'birthYearFrom must be a valid number' });
        }
        if (birthYearTo !== undefined && isNaN(birthYearTo)) {
          return res.status(400).json({ message: 'birthYearTo must be a valid number' });
        }

        // Validate birth year bounds
        if (birthYearFrom !== undefined) {
          const error = validateBirthYear(birthYearFrom);
          if (error) {
            return res.status(400).json({ message: error });
          }
        }
        if (birthYearTo !== undefined) {
          const error = validateBirthYear(birthYearTo);
          if (error) {
            return res.status(400).json({ message: error });
          }
        }

        if (
          birthYearFrom !== undefined &&
          birthYearTo !== undefined &&
          birthYearFrom > birthYearTo
        ) {
          return res
            .status(400)
            .json({ message: 'birthYearFrom must be less than or equal to birthYearTo' });
        }

        const result = await service.getAthletesByBenchmarkStatus(
          organizationId,
          benchmarkId,
          status as 'met' | 'unmet' | 'no_data',
          {
            teamIds,
            genders,
            birthYearFrom,
            birthYearTo,
          }
        );

        res.json(result);
      } catch (error) {
        console.error('Get athletes by benchmark status error:', error);
        const message =
          error instanceof Error ? error.message : 'Failed to fetch athletes by benchmark status';
        res.status(500).json({ message });
      }
    }
  );
}
