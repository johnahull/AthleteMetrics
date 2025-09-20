/**
 * Athlete Management Service
 *
 * Specializes in athlete profiles, performance tracking, and team memberships.
 * Provides comprehensive athlete lifecycle management capabilities.
 */

import { BaseService, type ServiceContext, type ServiceConfig } from './base/BaseService';
import type {
  User,
  Team,
  UserTeam,
  Measurement,
  InsertAthlete
} from '@shared/schema';
import type { MeasurementFilters } from './types/common';

export interface AthleteManagementServiceInterface {
  // Athlete CRUD Operations
  createAthlete(data: InsertAthlete, context: ServiceContext): Promise<User>;
  getAthlete(athleteId: string, context: ServiceContext): Promise<User | null>;
  getAthletes(filters?: AthleteFilters, context?: ServiceContext): Promise<User[]>;
  updateAthlete(athleteId: string, data: Partial<InsertAthlete>, context: ServiceContext): Promise<User>;
  deleteAthlete(athleteId: string, context: ServiceContext): Promise<void>;

  // Team Membership Management
  addAthleteToTeam(athleteId: string, teamId: string, context: ServiceContext): Promise<UserTeam>;
  removeAthleteFromTeam(athleteId: string, teamId: string, context: ServiceContext): Promise<void>;
  getAthleteTeams(athleteId: string, context: ServiceContext): Promise<UserTeam[]>;
  getTeamAthletes(teamId: string, context: ServiceContext): Promise<User[]>;
  transferAthlete(athleteId: string, fromTeamId: string, toTeamId: string, context: ServiceContext): Promise<void>;

  // Performance Tracking
  getAthletePerformance(athleteId: string, filters?: MeasurementFilters, context?: ServiceContext): Promise<AthletePerformance>;
  getAthleteMeasurements(athleteId: string, filters?: MeasurementFilters, context?: ServiceContext): Promise<Measurement[]>;
  addMeasurement(athleteId: string, measurement: any, context: ServiceContext): Promise<Measurement>;
  getPersonalBests(athleteId: string, context: ServiceContext): Promise<PersonalBests>;

  // Analytics & Insights
  getAthleteAnalytics(athleteId: string, context: ServiceContext): Promise<AthleteAnalytics>;
  compareAthletes(athleteIds: string[], context: ServiceContext): Promise<AthleteComparison>;
  getAthleteRankings(teamId?: string, metric?: string, context?: ServiceContext): Promise<AthleteRanking[]>;
  getProgressTracking(athleteId: string, period: string, context: ServiceContext): Promise<ProgressTracking>;

  // Bulk Operations
  bulkCreateAthletes(athletes: InsertAthlete[], context: ServiceContext): Promise<BulkOperationResult>;
  bulkUpdateAthletes(updates: AthleteUpdate[], context: ServiceContext): Promise<BulkOperationResult>;
  bulkAssignToTeam(athleteIds: string[], teamId: string, context: ServiceContext): Promise<BulkOperationResult>;
}

export interface AthleteFilters {
  organizationId?: string;
  teamId?: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  gender?: string;
  sports?: string[];
  positions?: string[];
  search?: string;
  isActive?: boolean;
}

export interface AthletePerformance {
  athlete: User;
  measurements: Measurement[];
  personalBests: PersonalBests;
  recentProgress: ProgressMetric[];
  teamComparison: TeamComparison;
  insights: string[];
}

export interface PersonalBests {
  [metric: string]: {
    value: number;
    date: string;
    improvement: number;
    rank?: number;
  };
}

export interface AthleteAnalytics {
  overallScore: number;
  strengthAreas: string[];
  improvementAreas: string[];
  trendAnalysis: TrendAnalysis;
  goalRecommendations: GoalRecommendation[];
}

export interface AthleteComparison {
  athletes: User[];
  metrics: ComparisonMetric[];
  rankings: Record<string, AthleteRanking[]>;
  insights: string[];
}

export interface AthleteRanking {
  athleteId: string;
  athleteName: string;
  metric: string;
  value: number;
  rank: number;
  percentile: number;
}

export interface ProgressTracking {
  athlete: User;
  period: string;
  metrics: ProgressMetric[];
  goals: Goal[];
  achievements: Achievement[];
}

export interface ProgressMetric {
  metric: string;
  startValue: number;
  endValue: number;
  improvement: number;
  improvementPercent: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface TeamComparison {
  teamAverage: Record<string, number>;
  athletePosition: Record<string, number>;
  percentileRank: Record<string, number>;
}

export interface TrendAnalysis {
  overall: 'improving' | 'declining' | 'stable';
  byMetric: Record<string, 'improving' | 'declining' | 'stable'>;
  correlations: Correlation[];
}

export interface Correlation {
  metric1: string;
  metric2: string;
  coefficient: number;
  significance: number;
}

export interface GoalRecommendation {
  metric: string;
  currentValue: number;
  targetValue: number;
  timeframe: string;
  confidence: number;
  reasoning: string;
}

export interface ComparisonMetric {
  name: string;
  values: Record<string, number>;
  bestPerformer: string;
  averageValue: number;
}

export interface Goal {
  id: string;
  metric: string;
  targetValue: number;
  currentValue: number;
  deadline: string;
  progress: number;
  status: 'on-track' | 'behind' | 'ahead' | 'completed';
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earnedDate: string;
  category: string;
}

export interface AthleteUpdate {
  athleteId: string;
  data: Partial<InsertAthlete>;
}

export interface BulkOperationResult {
  successful: number;
  failed: number;
  errors: OperationError[];
  results: any[];
}

export interface OperationError {
  athleteId?: string;
  error: string;
  details?: any;
}

export class AthleteManagementService extends BaseService implements AthleteManagementServiceInterface {
  constructor(config: ServiceConfig) {
    super(config, 'AthleteManagementService');
  }

  /**
   * Create new athlete
   */
  async createAthlete(data: InsertAthlete, context: ServiceContext): Promise<User> {
    return this.executeWithContext('createAthlete', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Validate athlete data
      this.validateAthleteData(data);

      // Check for duplicate athletes (by email)
      if (data.emails && data.emails.length > 0) {
        for (const email of data.emails) {
          const existingUser = await this.storage.getUserByEmail(email);
          if (existingUser) {
            throw new Error(`User with email ${email} already exists`);
          }
        }
      }

      // Set organization context for non-site admins
      if (!context.isSiteAdmin && context.organizationId) {
        data.organizationId = context.organizationId;
      }

      // Create athlete
      const athlete = await this.storage.createAthlete(data);

      this.logger.info('Athlete created', {
        athleteId: athlete.id,
        name: `${athlete.firstName} ${athlete.lastName}`,
        createdBy: context.userId
      });

      this.eventBus.emit('athlete.created', {
        athlete,
        context
      });

      return athlete;
    });
  }

  /**
   * Get athlete by ID with access control
   */
  async getAthlete(athleteId: string, context: ServiceContext): Promise<User | null> {
    return this.executeWithContext('getAthlete', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const athlete = await this.storage.getAthlete(athleteId);
      if (!athlete) {
        return null;
      }

      // Access control checks
      if (!context.isSiteAdmin) {
        const hasAccess = await this.userHasAthleteAccess(context.userId!, athleteId, context);
        if (!hasAccess) {
          throw new Error('Access denied to athlete profile');
        }
      }

      return athlete;
    });
  }

  /**
   * Get athletes with filtering and access control
   */
  async getAthletes(filters: AthleteFilters = {}, context?: ServiceContext): Promise<User[]> {
    const ctx = context || {};
    return this.executeWithContext('getAthletes', ctx, async () => {
      if (context) {
        this.validatePermissions(context, { requireAuth: true });
      }

      // Apply organization filter for non-site admins
      const organizationAwareFilters = this.applyOrganizationFilter(filters, context);

      return await this.storage.getAthletes(organizationAwareFilters);
    });
  }

  /**
   * Update athlete information
   */
  async updateAthlete(
    athleteId: string,
    data: Partial<InsertAthlete>,
    context: ServiceContext
  ): Promise<User> {
    return this.executeWithContext('updateAthlete', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const athlete = await this.storage.getAthlete(athleteId);
      if (!athlete) {
        throw new Error('Athlete not found');
      }

      // Access control
      if (!context.isSiteAdmin) {
        const hasAccess = await this.userHasAthleteAccess(context.userId!, athleteId, context);
        if (!hasAccess) {
          throw new Error('Access denied to update athlete');
        }
      }

      // Validate update data
      if (Object.keys(data).length > 0) {
        this.validateAthleteData(data as InsertAthlete, true);
      }

      const updatedAthlete = await this.storage.updateAthlete(athleteId, data);

      this.logger.info('Athlete updated', {
        athleteId,
        updatedBy: context.userId,
        fields: Object.keys(data)
      });

      this.eventBus.emit('athlete.updated', {
        athlete: updatedAthlete,
        context,
        changes: data
      });

      return updatedAthlete;
    });
  }

  /**
   * Delete athlete (with cascade considerations)
   */
  async deleteAthlete(athleteId: string, context: ServiceContext): Promise<void> {
    return this.executeWithContext('deleteAthlete', context, async () => {
      this.validatePermissions(context, { requireAuth: true, requireSiteAdmin: true });

      const athlete = await this.storage.getAthlete(athleteId);
      if (!athlete) {
        throw new Error('Athlete not found');
      }

      // Check for dependent data
      const measurements = await this.storage.getMeasurements({ athleteId });
      const teamMemberships = await this.storage.getUserTeams(athleteId);

      if (measurements.length > 0 || teamMemberships.length > 0) {
        throw new Error(
          'Cannot delete athlete with existing measurements or team memberships. ' +
          'Please remove associated data first or consider deactivating the athlete instead.'
        );
      }

      await this.storage.deleteAthlete(athleteId);

      this.logger.info('Athlete deleted', {
        athleteId,
        athleteName: `${athlete.firstName} ${athlete.lastName}`,
        deletedBy: context.userId
      });

      this.eventBus.emit('athlete.deleted', {
        athleteId,
        context
      });
    });
  }

  /**
   * Add athlete to team
   */
  async addAthleteToTeam(athleteId: string, teamId: string, context: ServiceContext): Promise<UserTeam> {
    return this.executeWithContext('addAthleteToTeam', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Validate athlete and team exist
      const athlete = await this.storage.getAthlete(athleteId);
      const team = await this.storage.getTeam(teamId);

      if (!athlete) throw new Error('Athlete not found');
      if (!team) throw new Error('Team not found');

      // Check permissions
      if (!context.isSiteAdmin) {
        const hasTeamAccess = await this.userHasTeamAccess(context.userId!, teamId, context);
        if (!hasTeamAccess) {
          throw new Error('Access denied to manage team memberships');
        }
      }

      // Check if already a member
      const userTeams = await this.storage.getUserTeams(athleteId);
      const existingMembership = userTeams.find(ut => ut.teamId === teamId);
      if (existingMembership) {
        throw new Error('Athlete is already a member of this team');
      }

      const userTeam = await this.storage.addUserToTeam(athleteId, teamId);

      this.logger.info('Athlete added to team', {
        athleteId,
        teamId,
        athleteName: `${athlete.firstName} ${athlete.lastName}`,
        teamName: team.name,
        addedBy: context.userId
      });

      this.eventBus.emit('athlete.team.added', {
        athleteId,
        teamId,
        context
      });

      return userTeam;
    });
  }

  /**
   * Remove athlete from team
   */
  async removeAthleteFromTeam(athleteId: string, teamId: string, context: ServiceContext): Promise<void> {
    return this.executeWithContext('removeAthleteFromTeam', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Check permissions
      if (!context.isSiteAdmin) {
        const hasTeamAccess = await this.userHasTeamAccess(context.userId!, teamId, context);
        if (!hasTeamAccess) {
          throw new Error('Access denied to manage team memberships');
        }
      }

      const userTeams = await this.storage.getUserTeams(athleteId);
      const membership = userTeams.find(ut => ut.teamId === teamId);
      if (!membership) {
        throw new Error('Athlete is not a member of this team');
      }

      await this.storage.removeUserFromTeam(athleteId, teamId);

      this.logger.info('Athlete removed from team', {
        athleteId,
        teamId,
        removedBy: context.userId
      });

      this.eventBus.emit('athlete.team.removed', {
        athleteId,
        teamId,
        context
      });
    });
  }

  /**
   * Get athlete's team memberships
   */
  async getAthleteTeams(athleteId: string, context: ServiceContext): Promise<UserTeam[]> {
    return this.executeWithContext('getAthleteTeams', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Access control
      if (!context.isSiteAdmin) {
        const hasAccess = await this.userHasAthleteAccess(context.userId!, athleteId, context);
        if (!hasAccess) {
          throw new Error('Access denied to athlete information');
        }
      }

      return await this.storage.getUserTeams(athleteId);
    });
  }

  /**
   * Get all athletes in a team
   */
  async getTeamAthletes(teamId: string, context: ServiceContext): Promise<User[]> {
    return this.executeWithContext('getTeamAthletes', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Check team access
      if (!context.isSiteAdmin) {
        const hasAccess = await this.userHasTeamAccess(context.userId!, teamId, context);
        if (!hasAccess) {
          throw new Error('Access denied to team information');
        }
      }

      const athletes = await this.storage.getAthletes({ teamId });
      return athletes;
    });
  }

  /**
   * Get athlete performance summary
   */
  async getAthletePerformance(
    athleteId: string,
    filters: MeasurementFilters = {},
    context?: ServiceContext
  ): Promise<AthletePerformance> {
    const ctx = context || { userId: athleteId };
    return this.executeWithContext('getAthletePerformance', ctx, async () => {
      if (context) {
        this.validatePermissions(context, { requireAuth: true });

        if (!context.isSiteAdmin) {
          const hasAccess = await this.userHasAthleteAccess(context.userId!, athleteId, context);
          if (!hasAccess) {
            throw new Error('Access denied to athlete performance data');
          }
        }
      }

      const athlete = await this.storage.getAthlete(athleteId);
      if (!athlete) {
        throw new Error('Athlete not found');
      }

      const measurementFilters = { ...filters, athleteId };
      const measurements = await this.storage.getMeasurements(measurementFilters);
      const personalBests = this.calculatePersonalBests(measurements);
      const recentProgress = this.calculateRecentProgress(measurements);
      const teamComparison = await this.calculateTeamComparison(athleteId, measurements);
      const insights = this.generatePerformanceInsights(measurements, personalBests, recentProgress);

      return {
        athlete,
        measurements,
        personalBests,
        recentProgress,
        teamComparison,
        insights
      };
    });
  }

  /**
   * Get athlete measurements with filters
   */
  async getAthleteMeasurements(
    athleteId: string,
    filters: MeasurementFilters = {},
    context?: ServiceContext
  ): Promise<Measurement[]> {
    const ctx = context || { userId: athleteId };
    return this.executeWithContext('getAthleteMeasurements', ctx, async () => {
      const measurementFilters = { ...filters, athleteId };
      return await this.storage.getMeasurements(measurementFilters);
    });
  }

  /**
   * Bulk create athletes
   */
  async bulkCreateAthletes(athletes: InsertAthlete[], context: ServiceContext): Promise<BulkOperationResult> {
    return this.executeWithContext('bulkCreateAthletes', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const results: any[] = [];
      const errors: OperationError[] = [];
      let successful = 0;
      let failed = 0;

      for (const athleteData of athletes) {
        try {
          const athlete = await this.createAthlete(athleteData, context);
          results.push(athlete);
          successful++;
        } catch (error) {
          failed++;
          errors.push({
            athleteId: `${athleteData.firstName} ${athleteData.lastName}`,
            error: (error as Error).message
          });
        }
      }

      this.logger.info('Bulk athlete creation completed', {
        total: athletes.length,
        successful,
        failed,
        createdBy: context.userId
      });

      return {
        successful,
        failed,
        errors,
        results
      };
    });
  }

  // Private helper methods

  private async userHasAthleteAccess(userId: string, athleteId: string, context: ServiceContext): Promise<boolean> {
    // Athletes can access their own data
    if (userId === athleteId) {
      return true;
    }

    // Check if user has access through organization/team membership
    const userOrgs = await this.storage.getUserOrganizations(userId);
    const athleteTeams = await this.storage.getUserTeams(athleteId);

    // Check if user and athlete share any organization
    for (const userOrg of userOrgs) {
      for (const athleteTeam of athleteTeams) {
        if (athleteTeam.team.organizationId === userOrg.organizationId) {
          // Coaches and org admins can access athletes in their organization
          if (['coach', 'org_admin'].includes(userOrg.role)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private async userHasTeamAccess(userId: string, teamId: string, context: ServiceContext): Promise<boolean> {
    const team = await this.storage.getTeam(teamId);
    if (!team) return false;

    const userOrgs = await this.storage.getUserOrganizations(userId);
    const userOrgInTeam = userOrgs.find(uo => uo.organizationId === team.organizationId);

    return userOrgInTeam ? ['coach', 'org_admin'].includes(userOrgInTeam.role) : false;
  }

  private applyOrganizationFilter(filters: AthleteFilters, context?: ServiceContext): any {
    if (!context || context.isSiteAdmin) {
      return filters;
    }

    // Non-site admins are restricted to their organization
    if (context.organizationId) {
      return {
        ...filters,
        organizationId: context.organizationId
      };
    }

    return filters;
  }

  private validateAthleteData(data: Partial<InsertAthlete>, isUpdate = false): void {
    if (!isUpdate) {
      if (!data.firstName || data.firstName.trim().length === 0) {
        throw new Error('First name is required');
      }
      if (!data.lastName || data.lastName.trim().length === 0) {
        throw new Error('Last name is required');
      }
    }

    if (data.emails && data.emails.length === 0) {
      throw new Error('At least one email address is required');
    }

    if (data.birthDate) {
      const birthDate = new Date(data.birthDate);
      const now = new Date();
      if (birthDate > now) {
        throw new Error('Birth date cannot be in the future');
      }
    }
  }

  private calculatePersonalBests(measurements: Measurement[]): PersonalBests {
    const personalBests: PersonalBests = {};

    // Group measurements by metric
    const metricGroups: Record<string, Measurement[]> = {};
    measurements.forEach(m => {
      if (!metricGroups[m.metric]) {
        metricGroups[m.metric] = [];
      }
      metricGroups[m.metric].push(m);
    });

    // Calculate best for each metric
    Object.entries(metricGroups).forEach(([metric, values]) => {
      // For timing metrics, lower is better; for others, higher is better
      const isTimingMetric = metric.includes('TIME') || metric.includes('AGILITY');

      const best = values.reduce((best, current) => {
        const currentValue = parseFloat(current.value);
        const bestValue = parseFloat(best.value);

        return isTimingMetric
          ? (currentValue < bestValue ? current : best)
          : (currentValue > bestValue ? current : best);
      });

      personalBests[metric] = {
        value: parseFloat(best.value),
        date: best.date,
        improvement: 0 // Would calculate based on historical data
      };
    });

    return personalBests;
  }

  private calculateRecentProgress(measurements: Measurement[]): ProgressMetric[] {
    // Calculate progress over recent period (e.g., last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const recentMeasurements = measurements.filter(m =>
      new Date(m.date) > threeMonthsAgo
    );

    // Implementation would analyze trends and calculate progress metrics
    return [];
  }

  private async calculateTeamComparison(athleteId: string, measurements: Measurement[]): Promise<TeamComparison> {
    // Get athlete's teams and calculate team averages for comparison
    const athleteTeams = await this.storage.getUserTeams(athleteId);

    // Implementation would calculate team averages and athlete's position
    return {
      teamAverage: {},
      athletePosition: {},
      percentileRank: {}
    };
  }

  private generatePerformanceInsights(
    measurements: Measurement[],
    personalBests: PersonalBests,
    recentProgress: ProgressMetric[]
  ): string[] {
    const insights: string[] = [];

    // Generate insights based on performance data
    if (measurements.length === 0) {
      insights.push('No performance data available. Start by recording some measurements.');
    }

    // Add more insight generation logic...

    return insights;
  }

  // Additional interface methods (simplified implementations)
  async transferAthlete(athleteId: string, fromTeamId: string, toTeamId: string, context: ServiceContext): Promise<void> {
    await this.removeAthleteFromTeam(athleteId, fromTeamId, context);
    await this.addAthleteToTeam(athleteId, toTeamId, context);
  }

  async addMeasurement(athleteId: string, measurement: any, context: ServiceContext): Promise<Measurement> {
    // Implementation details...
    return {} as Measurement;
  }

  async getPersonalBests(athleteId: string, context: ServiceContext): Promise<PersonalBests> {
    const measurements = await this.getAthleteMeasurements(athleteId, {}, context);
    return this.calculatePersonalBests(measurements);
  }

  async getAthleteAnalytics(athleteId: string, context: ServiceContext): Promise<AthleteAnalytics> {
    // Implementation details...
    return {
      overallScore: 75,
      strengthAreas: [],
      improvementAreas: [],
      trendAnalysis: { overall: 'stable', byMetric: {}, correlations: [] },
      goalRecommendations: []
    };
  }

  async compareAthletes(athleteIds: string[], context: ServiceContext): Promise<AthleteComparison> {
    // Implementation details...
    return {
      athletes: [],
      metrics: [],
      rankings: {},
      insights: []
    };
  }

  async getAthleteRankings(teamId?: string, metric?: string, context?: ServiceContext): Promise<AthleteRanking[]> {
    // Implementation details...
    return [];
  }

  async getProgressTracking(athleteId: string, period: string, context: ServiceContext): Promise<ProgressTracking> {
    // Implementation details...
    const athlete = await this.getAthlete(athleteId, context);
    return {
      athlete: athlete!,
      period,
      metrics: [],
      goals: [],
      achievements: []
    };
  }

  async bulkUpdateAthletes(updates: AthleteUpdate[], context: ServiceContext): Promise<BulkOperationResult> {
    // Implementation details...
    return {
      successful: 0,
      failed: 0,
      errors: [],
      results: []
    };
  }

  async bulkAssignToTeam(athleteIds: string[], teamId: string, context: ServiceContext): Promise<BulkOperationResult> {
    // Implementation details...
    return {
      successful: 0,
      failed: 0,
      errors: [],
      results: []
    };
  }
}