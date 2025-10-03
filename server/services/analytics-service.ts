/**
 * Analytics service handling dashboard and team analytics
 */

import { BaseService } from "./base-service";
import type { Measurement } from "@shared/schema";

interface AnalyticsFilters {
  organizationId?: string;
  metrics?: string[];
  dateRange?: {
    start?: string;
    end?: string;
  };
}

interface DashboardAnalytics {
  totalMeasurements: number;
  verifiedCount: number;
  metricBreakdown: Record<string, number>;
  dateRange?: {
    start: string | null;
    end: string | null;
  };
  results?: Measurement[];
}

interface TeamAnalytics {
  totalTeams: number;
  activeTeams: number;
  archivedTeams: number;
  levelBreakdown: Record<string, number>;
}

export class AnalyticsService extends BaseService {
  /**
   * Get dashboard analytics
   */
  async getDashboardAnalytics(
    filters: AnalyticsFilters,
    userId: string
  ): Promise<DashboardAnalytics> {
    try {
      this.logger.info('Getting dashboard analytics', { filters, userId });

      // Check access to organization if specified
      if (filters.organizationId) {
        await this.requireOrganizationAccess(userId, filters.organizationId);
      }

      const measurementFilters = {
        organizationId: filters.organizationId,
        metric: filters.metrics?.join(','),
        startDate: filters.dateRange?.start,
        endDate: filters.dateRange?.end
      };

      const measurements = await this.executeQuery(
        'getDashboardAnalytics',
        () => this.storage.getMeasurements(measurementFilters),
        { userId, filters }
      );

      // Calculate analytics
      const analytics: DashboardAnalytics = {
        totalMeasurements: measurements.length,
        verifiedCount: measurements.filter(m => m.isVerified === true).length,
        metricBreakdown: measurements.reduce((acc, m) => {
          acc[m.metric] = (acc[m.metric] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      // Include date range and results if provided
      if (filters.dateRange) {
        analytics.dateRange = {
          start: filters.dateRange.start || null,
          end: filters.dateRange.end || null
        };
        analytics.results = measurements;
      }

      this.logger.info('Dashboard analytics retrieved', {
        userId,
        totalMeasurements: analytics.totalMeasurements
      });

      return analytics;
    } catch (error) {
      this.handleError(error, 'getDashboardAnalytics');
    }
  }

  /**
   * Get team analytics
   */
  async getTeamAnalytics(
    organizationId: string | undefined,
    userId: string
  ): Promise<TeamAnalytics> {
    try {
      this.logger.info('Getting team analytics', { organizationId, userId });

      // Check access to organization if specified
      if (organizationId) {
        await this.requireOrganizationAccess(userId, organizationId);
      }

      const teams = await this.executeQuery(
        'getTeamAnalytics',
        () => this.storage.getTeams(organizationId),
        { userId, organizationId }
      );

      const analytics: TeamAnalytics = {
        totalTeams: teams.length,
        activeTeams: teams.filter(t => t.isArchived !== true).length,
        archivedTeams: teams.filter(t => t.isArchived === true).length,
        levelBreakdown: teams.reduce((acc, t) => {
          const level = t.level || 'Unknown';
          acc[level] = (acc[level] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      this.logger.info('Team analytics retrieved', {
        userId,
        totalTeams: analytics.totalTeams
      });

      return analytics;
    } catch (error) {
      this.handleError(error, 'getTeamAnalytics');
    }
  }
}
