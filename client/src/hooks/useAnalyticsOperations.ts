/**
 * Shared Analytics Operations Hooks
 * Centralized hooks for common analytics operations
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useAnalyticsContext, useAnalyticsActions } from '@/contexts/AnalyticsContext';
import { getRecommendedChartType } from '@/components/charts/ChartContainer';
import type {
  AnalyticsRequest,
  AnalyticsResponse,
  ChartConfiguration,
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

/**
 * Hook for managing analytics permissions and organization context
 */
export function useAnalyticsPermissions() {
  const { user, organizationContext, userOrganizations } = useAuth();

  return useMemo(() => {
    const getEffectiveOrganizationId = () => {
      if (organizationContext) return organizationContext;
      const isSiteAdmin = user?.isSiteAdmin || false;
      if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
        return userOrganizations[0].organizationId;
      }
      return null;
    };

    const effectiveOrganizationId = getEffectiveOrganizationId();

    return {
      user,
      effectiveOrganizationId,
      isSiteAdmin: user?.isSiteAdmin || false,
      hasCoachAccess: user?.role === 'coach' || user?.role === 'org_admin' || user?.isSiteAdmin,
      hasAthleteAccess: user?.role === 'athlete' || user?.isSiteAdmin,
      organizationContext,
      userOrganizations,
    };
  }, [user, organizationContext, userOrganizations]);
}

/**
 * Hook for loading initial analytics data (teams, athletes)
 */
export function useAnalyticsDataLoader() {
  const { effectiveOrganizationId } = useAnalyticsPermissions();
  const { setAvailableTeams, setAvailableAthletes, setLoading } = useAnalyticsActions();

  const loadInitialData = useCallback(async () => {
    if (!effectiveOrganizationId) {
      console.log('No effective organization ID found, skipping data load');
      return;
    }

    try {
      setLoading(true);
      console.log('Loading initial data for organization:', effectiveOrganizationId);

      // Load teams and athletes in parallel
      const [teamsResponse, athletesResponse] = await Promise.all([
        fetch('/api/teams', { credentials: 'include' }),
        fetch(`/api/athletes?organizationId=${effectiveOrganizationId}`, { credentials: 'include' })
      ]);

      // Process teams
      if (teamsResponse.ok) {
        const teams = await teamsResponse.json();
        setAvailableTeams(teams.map((team: any) => ({
          id: team.id,
          name: team.name
        })));
      } else {
        console.error('Teams request failed:', teamsResponse.status);
      }

      // Process athletes
      if (athletesResponse.ok) {
        const athletes = await athletesResponse.json();
        setAvailableAthletes(athletes.map((athlete: any) => ({
          id: athlete.id,
          name: athlete.name,
          teamName: athlete.teams && athlete.teams.length > 0
            ? athlete.teams.map((t: any) => t.name).join(', ')
            : undefined,
          teams: athlete.teams || []
        })));
      } else {
        console.error('Athletes request failed:', athletesResponse.status);
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  }, [effectiveOrganizationId, setAvailableTeams, setAvailableAthletes, setLoading]);

  return { loadInitialData };
}

/**
 * Hook for fetching analytics data
 */
export function useAnalyticsDataFetcher() {
  const { state, shouldFetchData } = useAnalyticsContext();
  const { setLoading, setError, setAnalyticsData } = useAnalyticsActions();
  const { effectiveOrganizationId } = useAnalyticsPermissions();

  const fetchAnalyticsData = useCallback(async () => {
    if (!shouldFetchData || !effectiveOrganizationId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // For line charts/trends, we need inter_group analysis to show multiple athletes
      const needsInterGroupAnalysis = state.selectedChartType === 'line_chart' || state.timeframe.type === 'trends';
      const effectiveAnalysisType = needsInterGroupAnalysis ? 'inter_group' : state.analysisType;
      
      // For trends/line charts, use broader timeframe to ensure sufficient data
      const effectiveTimeframe = needsInterGroupAnalysis ? {
        ...state.timeframe,
        period: state.timeframe.period === 'last_7_days' || state.timeframe.period === 'last_30_days' || state.timeframe.period === 'last_90_days' 
          ? 'all_time' as const
          : state.timeframe.period
      } : state.timeframe;
      
      const request: AnalyticsRequest = {
        analysisType: effectiveAnalysisType,
        filters: { ...state.filters, organizationId: effectiveOrganizationId },
        metrics: state.metrics,
        timeframe: effectiveTimeframe,
        athleteId: (effectiveAnalysisType === 'individual' && state.selectedAthleteId) ? state.selectedAthleteId : undefined
      };

      // Fetch CSRF token first
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      
      if (!csrfResponse.ok) {
        throw new Error('Failed to fetch CSRF token');
      }
      
      const { csrfToken } = await csrfResponse.json();

      const response = await fetch('/api/analytics/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`Analytics request failed: ${response.statusText}`);
      }

      const data: AnalyticsResponse = await response.json();
      
      console.log('Analytics data received:', {
        hasData: !!data.data,
        dataLength: data.data?.length || 0,
        hasTrends: !!data.trends,
        trendsLength: data.trends?.length || 0,
        hasMultiMetric: !!data.multiMetric,
        multiMetricLength: data.multiMetric?.length || 0,
        hasStatistics: !!data.statistics,
        statisticsKeys: Object.keys(data.statistics || {}),
        recommendedCharts: data.meta?.recommendedCharts || [],
        totalAthletes: data.meta?.totalAthletes || 0,
        totalMeasurements: data.meta?.totalMeasurements || 0
      });
      
      setAnalyticsData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytics data';
      setError(errorMessage);
      setAnalyticsData(null);
    } finally {
      setLoading(false);
    }
  }, [
    shouldFetchData,
    effectiveOrganizationId,
    state.analysisType,
    state.filters,
    state.metrics,
    state.timeframe,
    state.selectedAthleteId,
    setLoading,
    setError,
    setAnalyticsData
  ]);

  return { fetchAnalyticsData };
}

/**
 * Hook for smart chart configuration
 */
export function useChartConfiguration() {
  const { state } = useAnalyticsContext();
  const { setChartType } = useAnalyticsActions();

  // Auto-update chart type recommendation when parameters change (but not when user explicitly selects)
  useEffect(() => {
    const recommended = getRecommendedChartType(
      state.analysisType,
      state.metrics.additional.length + 1,
      state.timeframe.type
    );
    // Only update if current chart type is not available in recommended charts
    // This prevents overriding explicit user selections
    const currentChartIsRecommended = state.analyticsData?.meta?.recommendedCharts?.includes(state.selectedChartType) ?? true;
    if (recommended !== state.selectedChartType && !currentChartIsRecommended) {
      setChartType(recommended);
    }
  }, [state.analysisType, state.metrics, state.timeframe, setChartType, state.analyticsData?.meta?.recommendedCharts]);

  const chartConfig: ChartConfiguration = useMemo(() => {
    let title = 'Performance Analytics';
    let subtitle = '';

    // Helper function to format metrics for display
    const formatMetricsForDisplay = () => {
      if ((state.selectedChartType === 'scatter_plot' || state.selectedChartType === 'connected_scatter') && state.metrics.additional.length > 0) {
        const primaryLabel = METRIC_CONFIG[state.metrics.primary as keyof typeof METRIC_CONFIG]?.label || state.metrics.primary;
        const additionalLabel = METRIC_CONFIG[state.metrics.additional[0] as keyof typeof METRIC_CONFIG]?.label || state.metrics.additional[0];
        return `${primaryLabel} vs ${additionalLabel}`;
      }

      if ((state.selectedChartType === 'radar_chart' || state.selectedChartType === 'multi_line') && state.metrics.additional.length > 0) {
        const allMetrics = [state.metrics.primary, ...state.metrics.additional];
        const metricLabels = allMetrics.map(metric =>
          METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric
        );
        return metricLabels.join(', ');
      }

      return METRIC_CONFIG[state.metrics.primary as keyof typeof METRIC_CONFIG]?.label || state.metrics.primary;
    };

    switch (state.analysisType) {
      case 'individual':
        const athleteName = state.selectedAthlete?.name;
        title = athleteName ? `${athleteName} - Performance Analysis` : 'Individual Performance Analysis';
        if ((state.selectedChartType === 'scatter_plot' || state.selectedChartType === 'connected_scatter') && state.metrics.additional.length > 0) {
          subtitle = `${formatMetricsForDisplay()} ${state.timeframe.type === 'best' ? 'Best Values' : 'Trends'} - ${state.timeframe.period.replace('_', ' ').toUpperCase()}`;
        } else if ((state.selectedChartType === 'radar_chart' || state.selectedChartType === 'multi_line') && state.metrics.additional.length > 0) {
          subtitle = `${formatMetricsForDisplay()} ${state.timeframe.type === 'best' ? 'Best Values' : 'Trends'} - ${state.timeframe.period.replace('_', ' ').toUpperCase()}`;
        } else {
          subtitle = `${state.metrics.primary} ${state.timeframe.type === 'best' ? 'Best Values' : 'Trends'} - ${state.timeframe.period.replace('_', ' ').toUpperCase()}`;
        }
        break;
      case 'intra_group':
        title = 'Multi-Athlete Analysis';
        subtitle = `Comparing athletes within selected groups - ${formatMetricsForDisplay()}`;
        break;
      case 'inter_group':
        title = 'Inter-Group Comparison';
        subtitle = `Comparing performance across different groups - ${formatMetricsForDisplay()}`;
        break;
    }

    return {
      type: state.selectedChartType,
      title,
      subtitle,
      showLegend: true,
      showTooltips: true,
      responsive: true,
      aspectRatio: 2
    };
  }, [state.analysisType, state.selectedChartType, state.metrics, state.timeframe, state.selectedAthlete]);

  return {
    chartConfig,
    formatChartTypeName: (chartType: string) => {
      const chartTypeNames: Record<string, string> = {
        'box_swarm_combo': 'Box + Swarm',
        'box_plot': 'Box Plot',
        'distribution': 'Distribution',
        'bar_chart': 'Bar Chart',
        'line_chart': 'Line Chart',
        'scatter_plot': 'Scatter Plot',
        'radar_chart': 'Radar Chart',
        'swarm_plot': 'Swarm Plot',
        'connected_scatter': 'Connected Scatter',
        'multi_line': 'Multi Line',
        'time_series_box_swarm': 'Time-Series Box + Swarm'
      };
      return chartTypeNames[chartType] || chartType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };
}

/**
 * Hook for analytics export functionality
 */
export function useAnalyticsExport() {
  const { state } = useAnalyticsContext();

  const handleExport = useCallback(async () => {
    if (!state.analyticsData) {
      console.warn('No analytics data to export');
      return;
    }

    try {
      // TODO: Implement actual export logic
      // This could export to CSV, PDF, or other formats
      console.log('Exporting analytics data:', state.analyticsData);

      // Example CSV export implementation:
      // const csvData = convertAnalyticsDataToCSV(state.analyticsData);
      // downloadCSV(csvData, `analytics-${Date.now()}.csv`);
    } catch (error) {
      console.error('Failed to export analytics data:', error);
    }
  }, [state.analyticsData]);

  return {
    handleExport,
    canExport: Boolean(state.analyticsData && !state.isLoading)
  };
}

/**
 * Main analytics operations hook that combines all functionality
 */
export function useAnalyticsOperations() {
  const permissions = useAnalyticsPermissions();
  const dataLoader = useAnalyticsDataLoader();
  const dataFetcher = useAnalyticsDataFetcher();
  const chartConfig = useChartConfiguration();
  const exportOperations = useAnalyticsExport();
  const actions = useAnalyticsActions();

  // Initialize data on mount
  useEffect(() => {
    if (permissions.effectiveOrganizationId) {
      dataLoader.loadInitialData();
    }
  }, [permissions.effectiveOrganizationId, dataLoader.loadInitialData]);

  return {
    ...permissions,
    ...dataLoader,
    ...dataFetcher,
    ...chartConfig,
    ...exportOperations,
    ...actions
  };
}