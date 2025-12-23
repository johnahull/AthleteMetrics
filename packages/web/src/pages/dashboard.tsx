import React, { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Users, UsersRound, Clock, ArrowUp, Activity } from "lucide-react";
import { formatFly10TimeWithSpeed } from "@/lib/speed-utils";
import { getMetricDisplayName, getMetricColor, getMetricIcon, formatMetricValue, getMetricUnits } from "@/lib/metrics";
import { useAuth } from "@/lib/auth";
import { useAvailableMetrics } from "@/hooks/use-available-metrics";
import { useAthleteDashboardData } from "@/hooks/useAthleteDashboardData";
import { MetricProgressCard } from "@/components/athlete/MetricProgressCard";
import { useDashboardTrends } from "@/hooks/use-dashboard-trends";
import { KPICardWithTrend } from "@/components/kpi-card-with-trend";
import { KPICardSkeleton, ChartSkeleton } from "@/components/ui/loading-states";
import { useIsMobile } from "@/hooks/use-mobile";
import { MeasurementsTimeline } from "@/components/measurements-timeline";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { useDashboardScope } from "@/hooks/useDashboardScope";
import { DashboardScopeSelector } from "@/components/dashboard/DashboardScopeSelector";
import { DashboardTimeframeFilter } from "@/components/dashboard/DashboardTimeframeFilter";
import { DashboardWellnessSection } from "@/components/dashboard/DashboardWellnessSection";
import { LeaderboardWidget } from "@/components/dashboard/LeaderboardWidget";
import { MostImprovedCard } from "@/components/dashboard/MostImprovedCard";
import { AtRiskAthletesAlert } from "@/components/dashboard/AtRiskAthletesAlert";
import { DashboardTrendsChart } from "@/components/dashboard/DashboardTrendsChart";
import type { TimeframePreset } from "@shared/dashboard-timeframe";

// Type definitions for dashboard data
interface BestMetricResult {
  value: string;
  userName: string;
}

interface DashboardStats {
  totalAthletes: number;
  activeAthletes: number;
  totalTeams: number;
  bestFly10Today: BestMetricResult | null;
  bestVerticalToday: BestMetricResult | null;
  bestAgility505Today: BestMetricResult | null;
  bestAgility5105Today: BestMetricResult | null;
  bestTTestToday: BestMetricResult | null;
  bestDash40YdToday: BestMetricResult | null;
  bestTopSpeedToday: BestMetricResult | null;
  bestRSIToday: BestMetricResult | null;
  bestFly10Last30Days: BestMetricResult | null;
  bestVerticalLast30Days: BestMetricResult | null;
  bestAgility505Last30Days: BestMetricResult | null;
  bestAgility5105Last30Days: BestMetricResult | null;
  bestTTestLast30Days: BestMetricResult | null;
  bestDash40YdLast30Days: BestMetricResult | null;
  bestTopSpeedLast30Days: BestMetricResult | null;
  bestRSILast30Days: BestMetricResult | null;
  // Allow indexing for dynamic metric access
  [key: string]: number | BestMetricResult | null;
}

interface RecentMeasurement {
  id: string;
  userId: string;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    teams?: { name: string }[];
  };
  metric: string;
  metricType?: string;
  value: string;
  units: string;
  date: string;
  notes?: string;
  team?: { name: string };
}

export default function Dashboard() {
  const isMobile = useIsMobile();
  const labels = useContextualLabels();
  const { user, organizationContext, userOrganizations } = useAuth();
  const [, setLocation] = useLocation();

  // Get available metrics for the organization
  const { metrics: availableMetrics, isLoading: metricsLoading } = useAvailableMetrics();

  // Use role from user session data
  const userRole = user?.role || 'athlete';
  const isSiteAdmin = user?.isSiteAdmin || false;

  // Get effective organization ID - same pattern as CoachAnalytics
  const getEffectiveOrganizationId = () => {
    if (organizationContext) return organizationContext;
    const isSiteAdmin = user?.isSiteAdmin || false;
    if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
      return userOrganizations[0].organizationId;
    }
    return null;
  };

  const effectiveOrganizationId = getEffectiveOrganizationId();

  // Dashboard scope (organization/team/athlete view) with URL state sync
  const { scope, setTeamScope, setAthleteScope, setTimeframe, resetScope, getQueryParams } = useDashboardScope(effectiveOrganizationId);

  // Handle scope change from selector
  const handleScopeChange = (update: Partial<typeof scope>) => {
    if (update.view === 'organization') {
      resetScope();
    } else if (update.view === 'team' && update.teamId) {
      setTeamScope(update.teamId);
    } else if (update.view === 'athlete' && update.teamId && update.athleteId) {
      setAthleteScope(update.teamId, update.athleteId);
    }
  };

  // Get filter params for API calls
  const filterParams = getQueryParams();

  // Fetch dashboard trends with scope and timeframe filters
  const { data: trendsData, isLoading: trendsLoading } = useDashboardTrends(
    effectiveOrganizationId,
    filterParams.teamId,
    filterParams.athleteId,
    filterParams.timeframe,
    filterParams.dateFrom,
    filterParams.dateTo
  );

  const { data: dashboardStats, isLoading, error } = useQuery({
    queryKey: ["/api/analytics/dashboard", effectiveOrganizationId, filterParams.teamId, filterParams.athleteId, filterParams.timeframe, filterParams.dateFrom, filterParams.dateTo],
    queryFn: async () => {
      // Organization selection is required for all users
      if (!effectiveOrganizationId) {
        throw new Error("Please select an organization to view dashboard");
      }

      // Build URL with optional filter params
      const params = new URLSearchParams({ organizationId: effectiveOrganizationId });
      if (filterParams.teamId) params.append('teamId', filterParams.teamId);
      if (filterParams.athleteId) params.append('athleteId', filterParams.athleteId);

      // Add timeframe params
      if (filterParams.timeframe) params.append('timeframe', filterParams.timeframe);
      if (filterParams.dateFrom) params.append('dateFrom', filterParams.dateFrom);
      if (filterParams.dateTo) params.append('dateTo', filterParams.dateTo);

      const url = `/api/analytics/dashboard?${params.toString()}`;
      const response = await fetch(url, {
        credentials: 'include' // Ensure cookies are sent for authentication
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!user && !!effectiveOrganizationId // Require organization for all users
  });

  const { data: recentMeasurements, isLoading: measurementsLoading, error: measurementsError } = useQuery({
    queryKey: ["/api/measurements", effectiveOrganizationId, filterParams.teamId, filterParams.athleteId],
    queryFn: async () => {
      // Build URL with scope filters (org, team, or athlete)
      const params = new URLSearchParams();
      if (effectiveOrganizationId) params.append('organizationId', effectiveOrganizationId);
      if (filterParams.teamId) params.append('teamIds', filterParams.teamId);
      if (filterParams.athleteId) params.append('userId', filterParams.athleteId);

      const url = `/api/measurements?${params.toString()}`;
      const response = await fetch(url, {
        credentials: 'include'
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!user && !!effectiveOrganizationId // Only fetch measurements when org is selected
  });

  // Get organization name for context indicator
  const { data: currentOrganization } = useQuery({
    queryKey: ['organizations', effectiveOrganizationId, 'details'],
    enabled: !!effectiveOrganizationId && !!user,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${effectiveOrganizationId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    }
  });

  // Fetch teams for scope label
  const { data: teams = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/teams', effectiveOrganizationId],
    queryFn: async () => {
      const response = await fetch(`/api/teams?organizationId=${effectiveOrganizationId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch teams');
      return response.json();
    },
    enabled: !!effectiveOrganizationId && !!user,
  });

  // Fetch athlete-specific data when in athlete view
  const { data: athleteDashboardData } = useAthleteDashboardData(
    scope.athleteId || '',
    { enabled: scope.view === 'athlete' && !!scope.athleteId }
  );

  // Compute scope label for widgets (shows org name, team name, or athlete name)
  const scopeLabel = useMemo(() => {
    if (scope.view === 'athlete' && athleteDashboardData?.athleteName) {
      return athleteDashboardData.athleteName;
    }
    if (scope.view === 'team' && scope.teamId) {
      const team = teams.find(t => t.id === scope.teamId);
      return team?.name || 'Team';
    }
    return currentOrganization?.name || 'Organization';
  }, [scope.view, scope.teamId, scope.athleteId, teams, currentOrganization?.name, athleteDashboardData?.athleteName]);

  // Group measurements by metric for MetricProgressCard
  const athleteMeasurementsByMetric = useMemo(() => {
    if (!athleteDashboardData?.measurements) return {};
    const grouped: Record<string, typeof athleteDashboardData.measurements> = {};
    athleteDashboardData.measurements.forEach((m) => {
      if (!grouped[m.metric]) grouped[m.metric] = [];
      grouped[m.metric].push(m);
    });
    return grouped;
  }, [athleteDashboardData?.measurements]);

  // Debug logging (MUST be before any early returns)
  useEffect(() => {
    console.log('Dashboard Debug Info:', {
      user,
      userRole,
      organizationContext,
      effectiveOrganizationId,
      dashboardStats,
      error
    });
  }, [user, userRole, organizationContext, effectiveOrganizationId, dashboardStats, error]);

  // Redirect athletes away from organization dashboard (MUST be before any early returns)
  useEffect(() => {
    if (!isSiteAdmin && userRole === "athlete" && user?.athleteId) {
      setLocation(`/athletes/${user.athleteId}`);
    }
  }, [isSiteAdmin, userRole, user?.athleteId, setLocation]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-6">
          {/* Header Skeleton */}
          <div>
            <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-96 bg-gray-200 rounded animate-pulse"></div>
          </div>

          {/* KPI Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <KPICardSkeleton />
            <KPICardSkeleton />
            <KPICardSkeleton />
          </div>

          {/* Charts Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white">
              <CardContent className="p-0">
                <ChartSkeleton />
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="h-4 w-32 bg-gray-200 rounded mb-6 animate-pulse"></div>
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-3 w-16 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Don't render dashboard for athletes (after all hooks are called)
  if (!isSiteAdmin && userRole === "athlete") {
    return null;
  }

  // Show error state if dashboard stats failed to load
  if (error) {
    console.error('Dashboard stats error:', error);
  }

  const stats: DashboardStats = dashboardStats || {
    totalAthletes: 0,
    activeAthletes: 0,
    totalTeams: 0,
    bestFly10Today: null,
    bestVerticalToday: null,
    bestAgility505Today: null,
    bestAgility5105Today: null,
    bestTTestToday: null,
    bestDash40YdToday: null,
    bestTopSpeedToday: null,
    bestRSIToday: null,
    bestFly10Last30Days: null,
    bestVerticalLast30Days: null,
    bestAgility505Last30Days: null,
    bestAgility5105Last30Days: null,
    bestTTestLast30Days: null,
    bestDash40YdLast30Days: null,
    bestTopSpeedLast30Days: null,
    bestRSILast30Days: null,
  };

  return (
    <div className="p-6">
      {/* Organization Selection Required */}
      {!effectiveOrganizationId && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Organization Selection Required</h3>
              <p className="mt-1 text-sm text-blue-700">
                Please select an organization from the top navigation to view dashboard statistics and performance data.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Dashboard Data Error</h3>
              <p className="mt-1 text-sm text-red-700">
                Failed to load dashboard statistics: {error?.message || 'Unknown error'}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard Overview</h1>
            <p className="text-gray-600 mt-1">
              {effectiveOrganizationId && currentOrganization
                ? `${currentOrganization.name} - Performance overview`
                : "Select an organization to view performance and analytics"
              }
            </p>
          </div>
          {effectiveOrganizationId && (
            <div className="flex items-center gap-3 flex-wrap">
              <DashboardScopeSelector
                organizationId={effectiveOrganizationId}
                organizationName={currentOrganization?.name || null}
                scope={scope}
                onScopeChange={handleScopeChange}
              />
              <DashboardTimeframeFilter
                timeframe={scope.timeframe}
                startDate={scope.startDate}
                endDate={scope.endDate}
                onTimeframeChange={(update) => {
                  setTimeframe(update.timeframe, update.startDate, update.endDate);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards with Trends */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <KPICardWithTrend
          title="Total Athletes"
          value={stats.totalAthletes || 0}
          icon={UsersRound}
          trend={trendsData?.athletes ? {
            value: trendsData.athletes.change,
            percent: trendsData.athletes.changePercent,
            direction: trendsData.athletes.trend
          } : undefined}
        />

        <KPICardWithTrend
          title="Total Measurements"
          value={trendsData?.measurements.total || 0}
          icon={Activity}
          trend={trendsData?.measurements ? {
            value: trendsData.measurements.current,
            percent: trendsData.measurements.changePercent,
            direction: trendsData.measurements.trend
          } : undefined}
        />

        <KPICardWithTrend
          title={`Active ${labels.teams}`}
          value={stats.totalTeams || 0}
          icon={Users}
          trend={trendsData?.teams ? {
            value: trendsData.teams.change,
            percent: trendsData.teams.changePercent,
            direction: trendsData.teams.trend
          } : undefined}
        />
      </div>

      {/* Wellness Section - Only show when org is selected and wellness is enabled */}
      {effectiveOrganizationId && (
        <DashboardWellnessSection
          organizationId={effectiveOrganizationId}
          teamId={filterParams.teamId}
          athleteId={filterParams.athleteId}
          isSiteAdmin={isSiteAdmin}
          scopeLabel={scopeLabel}
        />
      )}

      {/* At-Risk Athletes Alert - Only show for org/team view, not athlete view */}
      {effectiveOrganizationId && scope.view !== 'athlete' && (
        <AtRiskAthletesAlert
          organizationId={effectiveOrganizationId}
          teamId={filterParams.teamId}
        />
      )}

      {/* Performance Metrics Cards - Best from Last 30 Days - Only show for org/team view */}
      {effectiveOrganizationId && scope.view !== 'athlete' && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        {/* Dynamic metric cards for organization-enabled metrics only (exclude tracking metrics) */}
        {!metricsLoading && availableMetrics
          .filter((metric) => metric.metricType !== 'tracking')
          .map((metric) => {
          const metricCode = metric.code;
          const bestResult = stats[`best${metricCode}Last30Days`];
          const MetricIcon = getMetricIcon(metricCode);
          const metricColor = getMetricColor(metricCode);

          // Type guard to check if bestResult is a BestMetricResult object
          const isBestMetricResult = (value: number | BestMetricResult | null): value is BestMetricResult => {
            return value !== null && typeof value === 'object' && 'value' in value && 'userName' in value;
          };

          return (
            <Card key={metricCode} className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Best {metric.label} ({scope.timeframe})
                    </p>
                    <p className="text-2xl font-bold text-gray-900" data-testid={`stat-best-${metricCode.toLowerCase()}`}>
                      {isBestMetricResult(bestResult) ? formatMetricValue(metricCode, parseFloat(bestResult.value)) : "N/A"}
                    </p>
                    <p className="text-sm text-gray-500 mt-1" data-testid={`stat-best-${metricCode.toLowerCase()}-athlete`}>
                      {isBestMetricResult(bestResult) ? bestResult.userName : "No data"}
                    </p>
                  </div>
                  <div className={`w-12 h-12 ${metricColor.replace('text-', 'bg-').replace('800', '100')} rounded-lg flex items-center justify-center`}>
                    <MetricIcon className={`h-6 w-6 ${metricColor.replace('bg-', 'text-').replace('100', '600')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {/* Loading state for metrics */}
        {metricsLoading && (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={`loading-${i}`} className="bg-white">
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
      )}

      {/* Leaderboard Section - Only show for org/team view, not athlete view */}
      {effectiveOrganizationId && scope.view !== 'athlete' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <LeaderboardWidget
          organizationId={effectiveOrganizationId}
          teamId={filterParams.teamId}
          timeframe={filterParams.timeframe as TimeframePreset | "custom" | undefined}
          dateFrom={filterParams.dateFrom}
          dateTo={filterParams.dateTo}
          scopeLabel={scopeLabel}
        />
        <MostImprovedCard
          organizationId={effectiveOrganizationId}
          teamId={filterParams.teamId}
          timeframe={filterParams.timeframe as TimeframePreset | "custom" | undefined}
          dateFrom={filterParams.dateFrom}
          dateTo={filterParams.dateTo}
          scopeLabel={scopeLabel}
        />
      </div>
      )}

      {/* Athlete Metric Progress Cards - Only show in athlete view */}
      {effectiveOrganizationId && scope.view === 'athlete' && athleteDashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {athleteDashboardData.availableMetrics.map((metric) => (
            <MetricProgressCard
              key={metric}
              metric={metric}
              displayName={getMetricDisplayName(metric)}
              measurements={athleteMeasurementsByMetric[metric] || []}
              units={getMetricUnits(metric)}
              personalRecord={athleteDashboardData.personalRecords.find(pr => pr.metric === metric)}
              showConfetti={false}
            />
          ))}
        </div>
      )}

      {/* Charts Section - Only show when org is selected */}
      {effectiveOrganizationId && (
      <div className="mb-8">
        <DashboardTrendsChart
          organizationId={effectiveOrganizationId}
          teamId={filterParams.teamId}
          athleteId={filterParams.athleteId}
          timeframe={filterParams.timeframe as TimeframePreset | "custom" | undefined}
          dateFrom={filterParams.dateFrom}
          dateTo={filterParams.dateTo}
          scopeLabel={scopeLabel}
        />
      </div>
      )}


      {/* Recent Activity - Only show when org is selected */}
      {effectiveOrganizationId && (
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Recent Measurements</h3>
              {scopeLabel && (
                <p className="text-sm text-gray-500">{scopeLabel}</p>
              )}
            </div>
          </div>
          {measurementsError ? (
            /* Error State */
            <div className="py-8 text-center text-red-500">
              Failed to load recent measurements
            </div>
          ) : measurementsLoading ? (
            /* Loading State */
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-3 animate-pulse">
                  <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : isMobile ? (
            /* Mobile Timeline View */
            <MeasurementsTimeline
              measurements={(recentMeasurements as RecentMeasurement[] || []).slice(0, 10).map((m) => ({
                id: m.id,
                athleteId: m.user?.id || '',
                athleteName: `${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim() || 'Unknown',
                metricType: m.metricType || '',
                metricName: m.metricType ? getMetricDisplayName(m.metricType) : 'Unknown',
                value: parseFloat(m.value) || 0,
                date: m.date,
                notes: m.notes,
                teamName: m.team?.name,
              }))}
            />
          ) : (
            /* Desktop Table View */
            <div className="overflow-x-auto md:block hidden">
              <table className="w-full" aria-label="Recent measurements">
              <thead>
                <tr className="text-left text-sm font-medium text-gray-500 border-b border-gray-200">
                  <th className="pb-3" scope="col">Athlete</th>
                  <th className="pb-3" scope="col">{labels.team}</th>
                  <th className="pb-3" scope="col">Metric</th>
                  <th className="pb-3" scope="col">Value</th>
                  <th className="pb-3" scope="col">Date</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {Array.isArray(recentMeasurements) && (recentMeasurements as RecentMeasurement[]).slice(0, 10).map((measurement) => (
                  <tr key={measurement.id} className="border-b border-gray-100">
                    <td className="py-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {measurement.user?.firstName?.charAt(0) || ''}{measurement.user?.lastName?.charAt(0) || ''}
                          </span>
                        </div>
                        <button
                          onClick={() => measurement.user?.id && setLocation(`/athletes/${measurement.user.id}`)}
                          className="font-medium text-gray-900 hover:text-primary cursor-pointer text-left"
                          aria-label={`View profile for ${measurement.user?.fullName || 'athlete'}`}
                        >
                          {measurement.user?.fullName || 'Unknown'}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 text-gray-600">
                      {measurement.user?.teams && measurement.user.teams.length > 0
                        ? measurement.user.teams.length > 1
                          ? `${measurement.user.teams[0].name} (+${measurement.user.teams.length - 1})`
                          : measurement.user.teams[0].name
                        : "Independent"
                      }
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getMetricColor(measurement.metric)}`}>
                        {getMetricDisplayName(measurement.metric)}
                      </span>
                    </td>
                    <td className="py-3 font-mono">
                      {measurement.metric === "FLY10_TIME" ?
                        formatFly10TimeWithSpeed(parseFloat(measurement.value)) :
                        `${measurement.value}${measurement.units}`
                      }
                    </td>
                    <td className="py-3 text-gray-600">{measurement.date}</td>
                  </tr>
                ))}
                {(!recentMeasurements || !Array.isArray(recentMeasurements) || recentMeasurements.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No recent measurements found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

    </div>
  );
}