/**
 * Simplified Analytics Service for initial testing
 */

import { eq, and, inArray } from "drizzle-orm";
import { db } from "./db";
import { measurements, users, userOrganizations, teams } from "@shared/schema";
import type {
  AnalyticsRequest,
  AnalyticsResponse,
  ChartDataPoint,
  StatisticalSummary
} from "@shared/analytics-types";

export class AnalyticsService {
  async getAnalyticsData(request: AnalyticsRequest): Promise<AnalyticsResponse> {
    try {
      // Simple query to get basic data for now
      const data = await db
        .select({
          measurementId: measurements.id,
          athleteId: measurements.userId,
          metric: measurements.metric,
          value: measurements.value,
          date: measurements.date,
          teamId: measurements.teamId,
          athleteName: users.firstName,
          teamName: teams.name
        })
        .from(measurements)
        .innerJoin(users, eq(measurements.userId, users.id))
        .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
        .leftJoin(teams, eq(measurements.teamId, teams.id))
        .where(
          and(
            eq(measurements.isVerified, "true"),
            eq(userOrganizations.organizationId, request.filters.organizationId),
            // Add team filtering if teams are specified
            request.filters.teams && request.filters.teams.length > 0
              ? inArray(measurements.teamId, request.filters.teams)
              : undefined
          )
        )
        .limit(100);

      // Transform to chart data format
      const chartData: ChartDataPoint[] = data.map(row => ({
        athleteId: row.athleteId,
        athleteName: row.athleteName || 'Unknown',
        value: parseFloat(row.value) || 0,
        date: new Date(row.date),
        metric: row.metric,
        teamName: row.teamName || 'No Team'
      }));

      // Basic statistics calculation
      const statistics: Record<string, StatisticalSummary> = {};
      const metricGroups = chartData.reduce((groups, point) => {
        if (!groups[point.metric]) {
          groups[point.metric] = [];
        }
        groups[point.metric].push(point.value);
        return groups;
      }, {} as Record<string, number[]>);

      for (const [metric, values] of Object.entries(metricGroups)) {
        if (values.length === 0) continue; // Skip empty arrays
        
        const sorted = [...values].sort((a, b) => a - b);
        const count = values.length;
        const sum = values.reduce((a, b) => a + b, 0);
        const mean = count > 0 ? sum / count : 0;
        const median = sorted[Math.floor(count / 2)];

        statistics[metric] = {
          count,
          mean,
          median,
          min: Math.min(...values),
          max: Math.max(...values),
          std: Math.sqrt(values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count),
          variance: 0,
          percentiles: {
            p5: sorted[Math.floor(count * 0.05)],
            p10: sorted[Math.floor(count * 0.1)],
            p25: sorted[Math.floor(count * 0.25)],
            p50: median,
            p75: sorted[Math.floor(count * 0.75)],
            p90: sorted[Math.floor(count * 0.9)],
            p95: sorted[Math.floor(count * 0.95)]
          }
        };
      }

      return {
        data: chartData,
        trends: [],
        multiMetric: [],
        statistics,
        groupings: {},
        meta: {
          totalAthletes: new Set(chartData.map(d => d.athleteId)).size,
          totalMeasurements: chartData.length,
          dateRange: {
            start: new Date(),
            end: new Date()
          },
          appliedFilters: request.filters,
          recommendedCharts: ['box_plot', 'distribution', 'bar_chart'] as any
        }
      };
    } catch (error) {
      console.error('Analytics service error:', error);
      throw error;
    }
  }
}