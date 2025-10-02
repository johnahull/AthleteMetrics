/**
 * Measurement management service with enhanced athlete matching
 */

import { BaseService } from "./base-service";
import { insertMeasurementSchema } from "@shared/schema";
import { findBestAthleteMatch, type MatchingCriteria, type MatchResult } from "../athlete-matching";
import { reviewQueue } from "../review-queue";
import type { Measurement, InsertMeasurement } from "@shared/schema";
import { AuthorizationError, NotFoundError } from "../utils/errors";

export interface MeasurementFilters {
  athleteId?: string;
  metric?: string;
  startDate?: string;
  endDate?: string;
  organizationId?: string;
  teamId?: string;
  isVerified?: string;
}

export interface MeasurementImportData {
  firstName: string;
  lastName: string;
  teamName?: string;
  date: string;
  metric: string;
  value: string;
  units?: string;
  age?: string;
  notes?: string;
  gender?: string;
}

export class MeasurementService extends BaseService {
  /**
   * Get measurements with filtering and organization access validation
   */
  async getMeasurements(
    filters: MeasurementFilters,
    requestingUserId: string
  ): Promise<Measurement[]> {
    try {
      this.logger.info('Getting measurements', {
        userId: requestingUserId,
        filters,
      });

      // Site admins can see all measurements
      if (await this.isSiteAdmin(requestingUserId)) {
        return await this.executeQuery(
          'getMeasurements',
          () => this.storage.getMeasurements(filters),
          { userId: requestingUserId, filters }
        );
      }

      // Filter by user's organizations if not specified
      if (!filters.organizationId) {
        const userOrgs = await this.getUserOrganizations(requestingUserId);
        const accessibleOrgIds = userOrgs.map(org => org.organizationId);
        // For now, use the first accessible organization if multiple exist
        return await this.executeQuery(
          'getMeasurements',
          () => this.storage.getMeasurements({
            ...filters,
            organizationId: accessibleOrgIds[0]
          }),
          { userId: requestingUserId, organizationId: accessibleOrgIds[0] }
        );
      }

      // Validate organization access
      await this.requireOrganizationAccess(requestingUserId, filters.organizationId);

      return await this.executeQuery(
        'getMeasurements',
        () => this.storage.getMeasurements(filters),
        { userId: requestingUserId, organizationId: filters.organizationId }
      );
    } catch (error) {
      this.handleError(error, 'getMeasurements');
    }
  }

  /**
   * Create a single measurement
   */
  async createMeasurement(
    measurementData: InsertMeasurement,
    requestingUserId: string
  ): Promise<Measurement> {
    try {
      // Validate input
      const validatedData = insertMeasurementSchema.parse(measurementData);

      this.logger.info('Creating measurement', {
        userId: requestingUserId,
        athleteId: validatedData.userId,
        metric: validatedData.metric,
      });

      // Validate athlete access
      const athlete = await this.getOneOrFail(
        () => this.storage.getUser(validatedData.userId),
        'Athlete'
      );

      // Check organization access for the athlete
      if (!(await this.isSiteAdmin(requestingUserId))) {
        const athleteOrgs = await this.getUserOrganizations(validatedData.userId);
        const requestingUserOrgs = await this.getUserOrganizations(requestingUserId);

        const hasSharedOrg = athleteOrgs.some(athleteOrg =>
          requestingUserOrgs.some(userOrg => userOrg.organizationId === athleteOrg.organizationId)
        );

        if (!hasSharedOrg) {
          throw new AuthorizationError("Cannot create measurements for athletes outside your organizations");
        }
      }

      const measurement = await this.executeQuery(
        'createMeasurement',
        () => this.storage.createMeasurement(validatedData, requestingUserId),
        { userId: requestingUserId, athleteId: validatedData.userId, metric: validatedData.metric }
      );

      this.logger.audit('Measurement created', {
        userId: requestingUserId,
        measurementId: measurement.id,
        athleteId: validatedData.userId,
        metric: measurement.metric,
      });

      return measurement;
    } catch (error) {
      this.handleError(error, 'createMeasurement');
    }
  }

  /**
   * Import measurements with enhanced athlete matching
   */
  async importMeasurements(
    measurementsData: MeasurementImportData[],
    requestingUserId: string
  ): Promise<{
    results: any[];
    errors: any[];
    warnings: string[];
    summary: {
      successful: number;
      failed: number;
      warnings: number;
      pendingReview: number;
    };
  }> {
    try {
      this.logger.info('Importing measurements', {
        userId: requestingUserId,
        count: measurementsData.length,
      });

      const results: any[] = [];
      const errors: any[] = [];
      const warnings: string[] = [];

      for (let i = 0; i < measurementsData.length; i++) {
        const row = measurementsData[i];
        const rowNum = i + 2; // Account for header row

        try {
          const { firstName, lastName, teamName, date, age, metric, value, units, notes, gender } = row;

          // Validate required fields
          if (!firstName || !lastName || !teamName || !date || !metric || !value) {
            errors.push({ 
              row: rowNum, 
              error: "First name, last name, team name, date, metric, and value are required" 
            });
            continue;
          }

          // Get organization context for filtering
          let organizationId: string | undefined;
          const currentUser = await this.storage.getUser(requestingUserId);
          
          if (teamName) {
            // Try to find the team to get organization context
            const teams = await this.storage.getTeams();
            const team = teams.find(t => t.name?.toLowerCase().trim() === teamName.toLowerCase().trim());
            organizationId = team?.organization?.id;
          }
          
          if (!organizationId) {
            // Fallback to current user's primary organization
            const userOrgs = await this.getUserOrganizations(requestingUserId);
            organizationId = userOrgs[0]?.organizationId;
          }

          // Use enhanced athlete matching system
          const athletes = await this.storage.getAthletes({
            search: `${firstName} ${lastName}`,
            organizationId: organizationId
          });

          // Build matching criteria
          const matchingCriteria: MatchingCriteria = {
            firstName,
            lastName,
            teamName
          };

          // Find best match using advanced matching algorithm
          const matchResult: MatchResult = findBestAthleteMatch(matchingCriteria, athletes);

          let matchedAthlete;
          if (matchResult.type === 'none') {
            // No suitable match found
            let errorMsg = `No matching athlete found for ${firstName} ${lastName}`;
            if (teamName) {
              errorMsg += ` in team "${teamName}"`;
            }
            
            // Suggest alternatives if available
            if (matchResult.alternatives && matchResult.alternatives.length > 0) {
              const suggestions = matchResult.alternatives
                .slice(0, 2)
                .map(alt => `${alt.firstName} ${alt.lastName} (${alt.matchReason})`)
                .join(', ');
              errorMsg += `. Similar athletes found: ${suggestions}`;
            }
            
            errors.push({ row: rowNum, error: errorMsg });
            continue;
          }

          // Handle review queue for low-confidence matches
          if (matchResult.requiresManualReview || matchResult.confidence < 75) {
            // Add to review queue instead of processing immediately
            const reviewItem = reviewQueue.addItem({
              type: 'measurement',
              originalData: row,
              matchingCriteria,
              suggestedMatch: matchResult.candidate ? {
                id: matchResult.candidate.id,
                firstName: matchResult.candidate.firstName,
                lastName: matchResult.candidate.lastName,
                confidence: matchResult.confidence,
                reason: matchResult.candidate.matchReason
              } : undefined,
              alternatives: matchResult.alternatives?.map(alt => ({
                id: alt.id,
                firstName: alt.firstName,
                lastName: alt.lastName,
                confidence: alt.matchScore,
                reason: alt.matchReason
              })),
              createdBy: requestingUserId
            });

            results.push({
              action: 'pending_review',
              reviewItem: {
                id: reviewItem.id,
                reason: `Low confidence match (${matchResult.confidence}%) requires manual review`
              }
            });
            continue;
          }

          matchedAthlete = matchResult.candidate;

          if (!matchedAthlete) {
            errors.push({ row: rowNum, error: `No valid athlete match found for ${firstName} ${lastName}` });
            continue;
          }

          // Add warning for medium-confidence matches that were auto-approved
          if (matchResult.confidence < 90) {
            const warningMsg = `${firstName} ${lastName} matched to ${matchedAthlete.firstName} ${matchedAthlete.lastName} ` +
              `(confidence: ${matchResult.confidence}%, reason: ${matchedAthlete.matchReason})`;
            warnings.push(warningMsg);
          }

          // Validate metric type
          const validMetrics = ["FLY10_TIME", "VERTICAL_JUMP", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD", "RSI"];
          if (!validMetrics.includes(metric)) {
            errors.push({ row: rowNum, error: `Invalid metric "${metric}". Must be one of: ${validMetrics.join(', ')}` });
            continue;
          }

          const measurementData = {
            userId: matchedAthlete.id,
            date,
            age: age && !isNaN(parseInt(age)) ? parseInt(age) : undefined,
            metric: metric as "FLY10_TIME" | "VERTICAL_JUMP" | "AGILITY_505" | "AGILITY_5105" | "T_TEST" | "DASH_40YD" | "RSI",
            value: parseFloat(value),
            units: units || (metric === 'FLY10_TIME' ? 's' : metric === 'VERTICAL_JUMP' ? 'in' : ''),
            notes: notes || undefined,
            isVerified: "false"
          };

          const measurement = await this.storage.createMeasurement(measurementData, requestingUserId);

          results.push({
            action: 'created',
            measurement: {
              id: measurement.id,
              athlete: `${matchedAthlete.firstName} ${matchedAthlete.lastName}`,
              metric: measurement.metric,
              value: measurement.value,
              date: measurement.date
            }
          });
        } catch (error) {
          this.logger.error('Error processing measurement row', { row: rowNum }, error as Error);
          errors.push({
            row: rowNum,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const pendingReviewCount = results.filter(r => r.action === 'pending_review').length;
      const successfulCount = results.filter(r => r.action === 'created').length;

      this.logger.audit('Measurements imported', {
        userId: requestingUserId,
        total: measurementsData.length,
        successful: successfulCount,
        failed: errors.length,
        warnings: warnings.length,
        pendingReview: pendingReviewCount,
      });

      return {
        results,
        errors,
        warnings,
        summary: {
          successful: successfulCount,
          failed: errors.length,
          warnings: warnings.length,
          pendingReview: pendingReviewCount
        }
      };
    } catch (error) {
      this.handleError(error, 'importMeasurements');
    }
  }

  /**
   * Update measurement
   */
  async updateMeasurement(
    measurementId: string,
    updateData: Partial<InsertMeasurement>,
    requestingUserId: string
  ): Promise<Measurement> {
    try {
      // Get existing measurement
      const existingMeasurement = await this.getOneOrFail(
        () => this.storage.getMeasurement(measurementId),
        'Measurement'
      );

      this.logger.info('Updating measurement', {
        userId: requestingUserId,
        measurementId,
        athleteId: existingMeasurement.userId,
      });

      // Validate athlete access
      await this.getOneOrFail(
        () => this.storage.getUser(existingMeasurement.userId),
        'Athlete'
      );

      // Check organization access
      if (!(await this.isSiteAdmin(requestingUserId))) {
        const athleteOrgs = await this.getUserOrganizations(existingMeasurement.userId);
        const requestingUserOrgs = await this.getUserOrganizations(requestingUserId);

        const hasSharedOrg = athleteOrgs.some(athleteOrg =>
          requestingUserOrgs.some(userOrg => userOrg.organizationId === athleteOrg.organizationId)
        );

        if (!hasSharedOrg) {
          throw new AuthorizationError("Cannot update measurements for athletes outside your organizations");
        }
      }

      const measurement = await this.executeQuery(
        'updateMeasurement',
        () => this.storage.updateMeasurement(measurementId, updateData),
        { userId: requestingUserId, measurementId }
      );

      this.logger.audit('Measurement updated', {
        userId: requestingUserId,
        measurementId,
        athleteId: existingMeasurement.userId,
      });

      return measurement;
    } catch (error) {
      this.handleError(error, 'updateMeasurement');
    }
  }

  /**
   * Delete measurement
   */
  async deleteMeasurement(measurementId: string, requestingUserId: string): Promise<void> {
    try {
      // Get existing measurement
      const existingMeasurement = await this.getOneOrFail(
        () => this.storage.getMeasurement(measurementId),
        'Measurement'
      );

      this.logger.info('Deleting measurement', {
        userId: requestingUserId,
        measurementId,
        athleteId: existingMeasurement.userId,
      });

      // Validate athlete access
      if (!(await this.isSiteAdmin(requestingUserId))) {
        const athleteOrgs = await this.getUserOrganizations(existingMeasurement.userId);
        const requestingUserOrgs = await this.getUserOrganizations(requestingUserId);

        const hasSharedOrg = athleteOrgs.some(athleteOrg =>
          requestingUserOrgs.some(userOrg => userOrg.organizationId === athleteOrg.organizationId)
        );

        if (!hasSharedOrg) {
          throw new AuthorizationError("Cannot delete measurements for athletes outside your organizations");
        }
      }

      await this.executeQuery(
        'deleteMeasurement',
        () => this.storage.deleteMeasurement(measurementId),
        { userId: requestingUserId, measurementId }
      );

      this.logger.audit('Measurement deleted', {
        userId: requestingUserId,
        measurementId,
        athleteId: existingMeasurement.userId,
      });
    } catch (error) {
      this.handleError(error, 'deleteMeasurement');
    }
  }

  /**
   * Verify measurement
   */
  async verifyMeasurement(
    measurementId: string,
    requestingUserId: string
  ): Promise<Measurement> {
    try {
      // Get existing measurement
      const existingMeasurement = await this.getOneOrFail(
        () => this.storage.getMeasurement(measurementId),
        'Measurement'
      );

      this.logger.info('Verifying measurement', {
        userId: requestingUserId,
        measurementId,
        athleteId: existingMeasurement.userId,
      });

      // Only coaches and admins can verify measurements
      await this.getOneOrFail(
        () => this.storage.getUser(requestingUserId),
        'User'
      );

      // Get user's organization roles to check permissions
      const userOrgs = await this.getUserOrganizations(requestingUserId);
      const hasCoachOrAdminRole = userOrgs.some(org =>
        org.role === 'coach' || org.role === 'org_admin'
      );

      const canVerify = (await this.isSiteAdmin(requestingUserId)) || hasCoachOrAdminRole;

      if (!canVerify) {
        throw new AuthorizationError("Only coaches and administrators can verify measurements");
      }

      const measurement = await this.executeQuery(
        'verifyMeasurement',
        () => this.storage.verifyMeasurement(measurementId, requestingUserId),
        { userId: requestingUserId, measurementId }
      );

      this.logger.audit('Measurement verified', {
        userId: requestingUserId,
        measurementId,
        athleteId: existingMeasurement.userId,
      });

      return measurement;
    } catch (error) {
      this.handleError(error, 'verifyMeasurement');
    }
  }
}