/**
 * Measurement management service with enhanced athlete matching
 */

import { BaseService } from "./base-service";
import { insertMeasurementSchema } from "@shared/schema";
import { findBestAthleteMatch, type MatchingCriteria, type MatchResult } from "../athlete-matching";
import { reviewQueue } from "../review-queue";
import type { Measurement, InsertMeasurement } from "@shared/schema";

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
      // Get user's accessible organizations
      const userOrgs = await this.getUserOrganizations(requestingUserId);
      const requestingUser = await this.storage.getUser(requestingUserId);
      
      // Site admins can see all measurements
      if (requestingUser?.isSiteAdmin === "true") {
        return await this.storage.getMeasurements(filters);
      }

      // Filter by user's organizations if not specified
      if (!filters.organizationId) {
        const accessibleOrgIds = userOrgs.map(org => org.organizationId);
        // For now, use the first accessible organization if multiple exist
        return await this.storage.getMeasurements({
          ...filters,
          organizationId: accessibleOrgIds[0]
        });
      }

      // Validate organization access
      const hasAccess = await this.validateOrganizationAccess(
        requestingUserId, 
        filters.organizationId
      );
      
      if (!hasAccess) {
        throw new Error("Unauthorized: Access denied to this organization's measurements");
      }

      return await this.storage.getMeasurements(filters);
    } catch (error) {
      this.handleError(error, "MeasurementService.getMeasurements");
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

      // Validate athlete access
      const athlete = await this.storage.getUser(validatedData.userId);
      if (!athlete) {
        throw new Error("Athlete not found");
      }

      // Check organization access for the athlete
      const athleteOrgs = await this.getUserOrganizations(validatedData.userId);
      const requestingUserOrgs = await this.getUserOrganizations(requestingUserId);
      
      const hasSharedOrg = athleteOrgs.some(athleteOrg =>
        requestingUserOrgs.some(userOrg => userOrg.organizationId === athleteOrg.organizationId)
      );

      const requestingUser = await this.storage.getUser(requestingUserId);
      if (!hasSharedOrg && requestingUser?.isSiteAdmin !== "true") {
        throw new Error("Unauthorized: Cannot create measurements for athletes outside your organizations");
      }

      return await this.storage.createMeasurement(validatedData, requestingUserId);
    } catch (error) {
      this.handleError(error, "MeasurementService.createMeasurement");
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
          console.error('Error processing measurement row:', error);
          errors.push({ 
            row: rowNum, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }

      const pendingReviewCount = results.filter(r => r.action === 'pending_review').length;

      return {
        results,
        errors,
        warnings,
        summary: {
          successful: results.filter(r => r.action === 'created').length,
          failed: errors.length,
          warnings: warnings.length,
          pendingReview: pendingReviewCount
        }
      };
    } catch (error) {
      this.handleError(error, "MeasurementService.importMeasurements");
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
      const existingMeasurement = await this.storage.getMeasurement(measurementId);
      if (!existingMeasurement) {
        throw new Error("Measurement not found");
      }

      // Validate athlete access
      const athlete = await this.storage.getUser(existingMeasurement.userId);
      if (!athlete) {
        throw new Error("Athlete not found");
      }

      // Check organization access
      const athleteOrgs = await this.getUserOrganizations(existingMeasurement.userId);
      const requestingUserOrgs = await this.getUserOrganizations(requestingUserId);
      
      const hasSharedOrg = athleteOrgs.some(athleteOrg =>
        requestingUserOrgs.some(userOrg => userOrg.organizationId === athleteOrg.organizationId)
      );

      const requestingUser = await this.storage.getUser(requestingUserId);
      if (!hasSharedOrg && requestingUser?.isSiteAdmin !== "true") {
        throw new Error("Unauthorized: Cannot update measurements for athletes outside your organizations");
      }

      return await this.storage.updateMeasurement(measurementId, updateData);
    } catch (error) {
      this.handleError(error, "MeasurementService.updateMeasurement");
    }
  }

  /**
   * Delete measurement
   */
  async deleteMeasurement(measurementId: string, requestingUserId: string): Promise<void> {
    try {
      // Get existing measurement
      const existingMeasurement = await this.storage.getMeasurement(measurementId);
      if (!existingMeasurement) {
        throw new Error("Measurement not found");
      }

      // Validate athlete access
      const athleteOrgs = await this.getUserOrganizations(existingMeasurement.userId);
      const requestingUserOrgs = await this.getUserOrganizations(requestingUserId);
      
      const hasSharedOrg = athleteOrgs.some(athleteOrg =>
        requestingUserOrgs.some(userOrg => userOrg.organizationId === athleteOrg.organizationId)
      );

      const requestingUser = await this.storage.getUser(requestingUserId);
      if (!hasSharedOrg && requestingUser?.isSiteAdmin !== "true") {
        throw new Error("Unauthorized: Cannot delete measurements for athletes outside your organizations");
      }

      await this.storage.deleteMeasurement(measurementId);
    } catch (error) {
      this.handleError(error, "MeasurementService.deleteMeasurement");
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
      const existingMeasurement = await this.storage.getMeasurement(measurementId);
      if (!existingMeasurement) {
        throw new Error("Measurement not found");
      }

      // Only coaches and admins can verify measurements
      const requestingUser = await this.storage.getUser(requestingUserId);
      if (!requestingUser) {
        throw new Error("User not found");
      }

      // Get user's organization roles to check permissions
      const userOrgs = await this.getUserOrganizations(requestingUserId);
      const hasCoachOrAdminRole = userOrgs.some(org => 
        org.role === 'coach' || org.role === 'org_admin'
      );

      const canVerify = requestingUser.isSiteAdmin === "true" || hasCoachOrAdminRole;

      if (!canVerify) {
        throw new Error("Unauthorized: Only coaches and administrators can verify measurements");
      }

      return await this.storage.verifyMeasurement(measurementId, requestingUserId);
    } catch (error) {
      this.handleError(error, "MeasurementService.verifyMeasurement");
    }
  }
}