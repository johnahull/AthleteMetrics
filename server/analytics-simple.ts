/**
 * Simplified Analytics Service for initial testing
 */

import { eq, and, inArray, gte, lte, sql, exists } from "drizzle-orm";
import { db } from "./db";
import { measurements, users, userOrganizations, teams, userTeams } from "@shared/schema";
import type {
  AnalyticsRequest,
  AnalyticsResponse,
  ChartDataPoint,
  StatisticalSummary
} from "@shared/analytics-types";
import { METRIC_CONFIG } from "@shared/analytics-types";

/**
 * Filters data to best measurements per athlete (for 'best' data type)
 */
function filterToBestMeasurements(data: ChartDataPoint[]): ChartDataPoint[] {
  const grouped = data.reduce((acc, point) => {
    const key = `${point.athleteId}-${point.metric}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(point);
    return acc;
  }, {} as Record<string, ChartDataPoint[]>);

  return Object.values(grouped).map(athleteMetricData => {
    const metric = athleteMetricData[0].metric;
    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];

    if (metricConfig?.lowerIsBetter) {
      // Find minimum value (best time)
      return athleteMetricData.reduce((best, current) =>
        current.value < best.value ? current : best
      );
    } else {
      // Find maximum value (best performance)
      return athleteMetricData.reduce((best, current) =>
        current.value > best.value ? current : best
      );
    }
  });
}

/**
 * Filters data to best measurements per athlete per date (for 'trends' data type)
 */
function filterToBestMeasurementsPerDate(data: ChartDataPoint[]): ChartDataPoint[] {
  const grouped = data.reduce((acc, point) => {
    const dateStr = point.date.toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `${point.athleteId}-${point.metric}-${dateStr}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(point);
    return acc;
  }, {} as Record<string, ChartDataPoint[]>);

  return Object.values(grouped).map(athleteMetricDateData => {
    const metric = athleteMetricDateData[0].metric;
    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];

    if (metricConfig?.lowerIsBetter) {
      // Find minimum value (best time) for this date
      return athleteMetricDateData.reduce((best, current) =>
        current.value < best.value ? current : best
      );
    } else {
      // Find maximum value (best performance) for this date
      return athleteMetricDateData.reduce((best, current) =>
        current.value > best.value ? current : best
      );
    }
  });
}

export class AnalyticsService {
  async getAnalyticsData(request: AnalyticsRequest): Promise<AnalyticsResponse> {
    try {
      console.log('🔍 Analytics request received:', {
        analysisType: request.analysisType,
        metrics: request.metrics,
        timeframe: request.timeframe,
        filters: {
          teams: request.filters.teams,
          genders: request.filters.genders,
          birthYears: request.filters.birthYears,
          organizationId: request.filters.organizationId
        }
      });

      // Calculate date range based on timeframe
      const now = new Date();
      let startDate: Date | undefined;
      let endDate: Date = now;

      switch (request.timeframe.period) {
        case 'last_7_days':
          startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          break;
        case 'last_30_days':
          startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
          break;
        case 'last_90_days':
          startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
          break;
        case 'this_year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'custom':
          if (request.timeframe.startDate) startDate = new Date(request.timeframe.startDate);
          if (request.timeframe.endDate) endDate = new Date(request.timeframe.endDate);
          break;
        case 'all_time':
        default:
          // Set earliest date to January 1, 2023 for all time
          startDate = new Date('2023-01-01');
          endDate = now;
          break;
      }

      console.log('📅 Calculated date range:', { 
        startDate: startDate?.toISOString(), 
        endDate: endDate.toISOString(),
        period: request.timeframe.period 
      });

      // Build where conditions
      const whereConditions = [
        eq(measurements.isVerified, "true"),
        eq(userOrganizations.organizationId, request.filters.organizationId),
        eq(measurements.metric, request.metrics.primary),
      ];

      // Add team filtering if specified - filter by athlete team membership
      if (request.filters.teams && request.filters.teams.length > 0) {
        console.log('🏀 Team filtering requested for teams:', request.filters.teams);
        // Filter to only include measurements from athletes who belong to the selected teams
        // This narrows down the comparison group, regardless of individual athlete being analyzed
        whereConditions.push(
          exists(
            db.select().from(userTeams)
              .where(
                and(
                  eq(userTeams.userId, users.id),
                  inArray(userTeams.teamId, request.filters.teams),
                  eq(userTeams.isActive, "true")
                )
              )
          )
        );
      }

      // Add gender filtering if specified
      if (request.filters.genders && request.filters.genders.length > 0) {
        whereConditions.push(inArray(users.gender, request.filters.genders));
      }

      // Add birth year filtering if specified
      if (request.filters.birthYears && request.filters.birthYears.length > 0) {
        const birthYearConditions = request.filters.birthYears.map(year =>
          sql`EXTRACT(YEAR FROM ${users.birthDate}) = ${year}`
        );
        whereConditions.push(sql`(${sql.join(birthYearConditions, sql` OR `)})`);
      }

      // Add date range filtering if specified
      if (startDate) {
        whereConditions.push(gte(measurements.date, startDate.toISOString().split('T')[0]));
      }
      if (endDate) {
        whereConditions.push(lte(measurements.date, endDate.toISOString().split('T')[0]));
      }

      // Query to get basic data
      const data = await db
        .select({
          measurementId: measurements.id,
          athleteId: measurements.userId,
          metric: measurements.metric,
          value: measurements.value,
          date: measurements.date,
          teamId: measurements.teamId,
          athleteName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
          teamName: teams.name,
          gender: users.gender,
          birthYear: sql<number>`EXTRACT(YEAR FROM ${users.birthDate})`
        })
        .from(measurements)
        .innerJoin(users, eq(measurements.userId, users.id))
        .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
        .leftJoin(teams, eq(measurements.teamId, teams.id))
        .where(and(...whereConditions))
        .limit(5000);

      console.log('📊 Query results:', {
        totalRows: data.length,
        uniqueAthletes: new Set(data.map(row => row.athleteId)).size,
        metrics: [...new Set(data.map(row => row.metric))],
        teams: [...new Set(data.map(row => row.teamName).filter(Boolean))],
        teamIds: [...new Set(data.map(row => row.teamId).filter(Boolean))],
        dateRange: data.length > 0 ? {
          earliest: data.reduce((min, row) => row.date < min ? row.date : min, data[0].date),
          latest: data.reduce((max, row) => row.date > max ? row.date : max, data[0].date)
        } : null,
        sampleRows: data.slice(0, 3).map(row => ({
          athlete: row.athleteName,
          teamId: row.teamId,
          teamName: row.teamName,
          metric: row.metric,
          value: row.value
        }))
      });

      // Transform to chart data format
      let chartData: ChartDataPoint[] = data.map(row => ({
        athleteId: row.athleteId,
        athleteName: row.athleteName || 'Unknown',
        value: parseFloat(row.value) || 0,
        date: new Date(row.date),
        metric: row.metric,
        teamName: row.teamName || 'No Team'
      }));

      // Apply filtering based on timeframe type
      if (request.timeframe.type === 'best') {
        console.log('📊 Filtering to best measurements per athlete');
        const originalCount = chartData.length;
        chartData = filterToBestMeasurements(chartData);
        console.log(`📊 Filtered from ${originalCount} to ${chartData.length} measurements (best per athlete)`);
      } else if (request.timeframe.type === 'trends') {
        console.log('📈 Filtering to best measurements per athlete per date');
        const originalCount = chartData.length;
        chartData = filterToBestMeasurementsPerDate(chartData);
        console.log(`📈 Filtered from ${originalCount} to ${chartData.length} measurements (best per athlete per date)`);
      }

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
            start: chartData.length > 0 
              ? new Date(Math.min(...chartData.map(d => d.date.getTime())))
              : startDate || new Date(),
            end: chartData.length > 0 
              ? new Date(Math.max(...chartData.map(d => d.date.getTime())))
              : endDate || new Date()
          },
          appliedFilters: request.filters,
          recommendedCharts: ['box_swarm_combo', 'distribution', 'bar_chart'] as any
        }
      };
    } catch (error) {
      console.error('Analytics service error:', error);
      throw error;
    }
  }
}