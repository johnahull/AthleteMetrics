import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, Users, User, BarChart3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { FilterPanel } from '@/components/analytics/FilterPanel';
import { TeamComparisonCards } from '@/components/analytics/TeamComparisonCards';
import { AnalyticsProvider, useAnalyticsContext } from '@/contexts/AnalyticsContext';
import { ChartContainer, getRecommendedChartType } from '@/components/charts/ChartContainer';
import { AthleteSelector } from '@/components/ui/athlete-selector';
import { AthleteSelector as AthleteSelectionEnhanced } from '@/components/ui/athlete-selector-enhanced';
import { DateSelector } from '@/components/ui/date-selector';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import type {
  AnalysisType,
  AnalyticsFilters as FilterType,
  MetricSelection,
  TimeframeConfig,
  AnalyticsRequest,
  AnalyticsResponse,
  ChartType,
  ChartDataPoint
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

import { useAuth } from '@/lib/auth';
import { isSiteAdmin, hasRole, type EnhancedUser } from '@/lib/types/user';

// Helper function to format chart type names for display
function formatChartTypeName(chartType: string): string {
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

// Internal component that uses the analytics context
function CoachAnalyticsContent() {
  const { user, organizationContext } = useAuth();
  const { state, dispatch, groupingResult, isDataReady, shouldFetchData, chartData } = useAnalyticsContext();

  // Get user's organizations for fallback when organizationContext is null
  const { data: userOrganizations } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
  });

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // Local state for loading
  const [isLoadingAthletes, setIsLoadingAthletes] = useState(true);

  // Handler functions for context dispatch
  const handleFiltersChange = (newFilters: Partial<FilterType>) => {
    dispatch({ type: 'SET_FILTERS', payload: newFilters });
  };

  const handleMetricsChange = (newMetrics: Partial<MetricSelection>) => {
    dispatch({ type: 'SET_METRICS', payload: newMetrics });
  };

  const handleTimeframeChange = (newTimeframe: Partial<TimeframeConfig>) => {
    dispatch({ type: 'SET_TIMEFRAME', payload: newTimeframe });
  };

  const handleGroupByChange = (groupBy: string[]) => {
    dispatch({ type: 'SET_GROUPING', payload: groupBy });
  };

  const handleAnalysisTypeChange = (analysisType: AnalysisType) => {
    dispatch({ type: 'SET_ANALYSIS_TYPE', payload: analysisType });
  };

  const handleAthleteSelect = (athleteId: string, athlete: { id: string; name: string; teamName?: string } | null) => {
    dispatch({ type: 'SET_SELECTED_ATHLETE', payload: { id: athleteId, athlete } });
  };

  const handleAthleteIdsChange = (athleteIds: string[]) => {
    dispatch({ type: 'SET_SELECTED_ATHLETE_IDS', payload: athleteIds });
  };

  const handleDatesChange = (dates: string[]) => {
    dispatch({ type: 'SET_SELECTED_DATES', payload: dates });
  };

  const handleChartTypeChange = (chartType: ChartType) => {
    dispatch({ type: 'SET_CHART_TYPE', payload: chartType });
  };

  // Get effective organization ID (organizationContext or user's primary organization)
  const getEffectiveOrganizationId = () => {
    if (organizationContext) {
      return organizationContext;
    }

    const isSiteAdmin = user?.isSiteAdmin || false;
    if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
      return userOrganizations[0].organizationId;
    }

    return null;
  };

  const effectiveOrganizationId = getEffectiveOrganizationId();

  // Initialize context with organization ID
  React.useEffect(() => {
    if (effectiveOrganizationId) {
      dispatch({
        type: 'INITIALIZE_STATE',
        payload: { organizationId: effectiveOrganizationId }
      });
    }
  }, [effectiveOrganizationId, dispatch]);

  const loadInitialData = useCallback(async () => {
    if (!effectiveOrganizationId) {
      console.log('No effective organization ID found, skipping athlete load');
      setIsLoadingAthletes(false);
      return;
    }

    try {
      setIsLoadingAthletes(true);
      console.log('Loading athletes for organization:', effectiveOrganizationId);

      // Load organization profile with users (much more efficient than /api/users)
      const [teamsResponse, organizationResponse] = await Promise.all([
        fetch('/api/teams'),
        fetch(`/api/organizations/${effectiveOrganizationId}/profile`)
      ]);

      console.log('Teams response status:', teamsResponse.status);
      console.log('Organization response status:', organizationResponse.status);

      // Load teams
      if (teamsResponse.ok) {
        const teams = await teamsResponse.json();
        console.log('Teams loaded:', teams.length);
        const teamData = teams.map((team: any) => ({
          id: team.id,
          name: team.name
        }));
        dispatch({ type: 'SET_AVAILABLE_TEAMS', payload: teamData });
      } else {
        console.error('Teams request failed:', teamsResponse.status, await teamsResponse.text());
      }

      // Load athletes using the athletes API endpoint which includes proper team information
      const athletesResponse = await fetch(`/api/athletes?organizationId=${effectiveOrganizationId}`, {
        credentials: 'include'
      });

      if (athletesResponse.ok) {
        const athletes = await athletesResponse.json();
        console.log('Athletes loaded from API:', athletes.length);

        const athleteData = athletes.map((athlete: any) => ({
          id: athlete.id,
          name: athlete.name,
          teamName: athlete.teams && athlete.teams.length > 0
            ? athlete.teams.map((t: any) => t.name).join(', ')
            : undefined,
          teams: athlete.teams || []
        }));
        dispatch({ type: 'SET_AVAILABLE_ATHLETES', payload: athleteData });
      } else {
        console.error('Athletes request failed:', athletesResponse.status, await athletesResponse.text());
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    } finally {
      setIsLoadingAthletes(false);
      console.log('Finished loading athletes');
    }
  }, [effectiveOrganizationId]);

  const fetchAnalyticsData = useCallback(async () => {
    if (!effectiveOrganizationId) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const request: AnalyticsRequest = {
        analysisType: state.analysisType,
        filters: { ...state.filters, organizationId: effectiveOrganizationId },
        metrics: state.metrics,
        timeframe: state.timeframe,
        athleteId: state.analysisType === 'individual' ? state.selectedAthleteId : undefined
      };

      const response = await fetch('/api/analytics/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`Analytics request failed: ${response.statusText}`);
      }

      const data: AnalyticsResponse = await response.json();
      dispatch({ type: 'SET_ANALYTICS_DATA', payload: data });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Failed to fetch analytics data' });
      dispatch({ type: 'SET_ANALYTICS_DATA', payload: null });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [effectiveOrganizationId, state.analysisType, state.filters, state.metrics, state.timeframe, state.selectedAthleteId, dispatch]);

  const handleFiltersReset = useCallback(() => {
    dispatch({ type: 'RESET_FILTERS', payload: effectiveOrganizationId || '' });
  }, [effectiveOrganizationId, dispatch]);

  const handleExport = useCallback(async () => {
    // TODO: Implement export functionality
    // Export analytics data functionality
  }, [state.analyticsData]);

  // Load initial data and update organizationId in filters
  useEffect(() => {
    console.log('User object in coach analytics:', user);
    console.log('Organization context:', organizationContext);
    console.log('User organizations:', userOrganizations);
    console.log('Effective organization ID:', effectiveOrganizationId);

    // Update filters with effective organization ID when available
    if (effectiveOrganizationId && state.filters.organizationId !== effectiveOrganizationId) {
      dispatch({ type: 'SET_FILTERS', payload: { organizationId: effectiveOrganizationId } });
    }

    loadInitialData();
  }, [user, organizationContext, userOrganizations, effectiveOrganizationId, loadInitialData]);

  // Auto-refresh when key parameters change
  useEffect(() => {
    if (effectiveOrganizationId) {
      // For individual analysis, only fetch data if an athlete is selected
      if (state.analysisType === 'individual' && !state.selectedAthleteId) {
        dispatch({ type: 'SET_ANALYTICS_DATA', payload: null });
        return;
      }
      fetchAnalyticsData();
    }
  }, [fetchAnalyticsData]);

  // Update chart type recommendation when analysis parameters change
  useEffect(() => {
    const recommended = getRecommendedChartType(
      state.analysisType,
      state.metrics.additional.length + 1,
      state.timeframe.type
    );
    dispatch({ type: 'SET_CHART_TYPE', payload: recommended });
  }, [state.analysisType, state.metrics, state.timeframe, dispatch]);

  // Prepare athletes array for AthleteSelector component
  const athletesForSelector = state.availableAthletes.map(athlete => ({
    ...athlete,
    fullName: athlete.name || 'Unknown' // Map 'name' to 'fullName' and ensure it's never undefined
  }));

  // Chart data is now provided by the context and includes grouping logic

  const chartConfig = useMemo(() => {
    let title = 'Performance Analytics';
    let subtitle = '';

    // Helper function to format metrics for display
    const formatMetricsForDisplay = () => {
      if ((state.selectedChartType === 'scatter_plot' || state.selectedChartType === 'connected_scatter') && state.metrics.additional.length > 0) {
        const primaryLabel = METRIC_CONFIG[state.metrics.primary as keyof typeof METRIC_CONFIG]?.label || state.metrics.primary;
        const additionalLabel = METRIC_CONFIG[state.metrics.additional[0] as keyof typeof METRIC_CONFIG]?.label || state.metrics.additional[0];
        return `${primaryLabel} vs ${additionalLabel}`;
      }

      // For radar charts and multi-metric displays, show all metrics
      if (state.selectedChartType === 'radar_chart' && state.metrics.additional.length > 0) {
        const allMetrics = [state.metrics.primary, ...state.metrics.additional];
        const metricLabels = allMetrics.map(metric =>
          METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric
        );
        return metricLabels.join(', ');
      }

      return METRIC_CONFIG[state.metrics.primary as keyof typeof METRIC_CONFIG]?.label || state.metrics.primary;
    };

    // Add grouping information to title/subtitle if active
    const groupingInfo = groupingResult.isGrouped ? ` (Grouped by ${groupingResult.groupingSummary.groupType})` : '';

    switch (state.analysisType) {
      case 'individual':
        const athleteName = state.availableAthletes.find(a => a.id === state.selectedAthleteId)?.name;
        title = athleteName ? `${athleteName} - Performance Analysis` : 'Individual Performance Analysis';
        if ((state.selectedChartType === 'scatter_plot' || state.selectedChartType === 'connected_scatter') && state.metrics.additional.length > 0) {
          subtitle = `${formatMetricsForDisplay()} ${state.timeframe.type === 'best' ? 'Best Values' : 'Trends'} - ${state.timeframe.period.replace('_', ' ').toUpperCase()}`;
        } else if (state.selectedChartType === 'radar_chart' && state.metrics.additional.length > 0) {
          subtitle = `${formatMetricsForDisplay()} ${state.timeframe.type === 'best' ? 'Best Values' : 'Trends'} - ${state.timeframe.period.replace('_', ' ').toUpperCase()}`;
        } else {
          subtitle = `${state.metrics.primary} ${state.timeframe.type === 'best' ? 'Best Values' : 'Trends'} - ${state.timeframe.period.replace('_', ' ').toUpperCase()}`;
        }
        break;
      case 'intra_group':
        title = 'Multi-Athlete Analysis' + groupingInfo;
        subtitle = `Comparing athletes within selected groups - ${formatMetricsForDisplay()}`;
        break;
      case 'inter_group':
        title = 'Inter-Group Comparison' + groupingInfo;
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
  }, [state, groupingResult]);

  // CONDITIONAL RETURNS - MUST BE AFTER ALL HOOKS
  if (!user) {
    return <div className="p-6">Loading...</div>;
  }

  const userRole = user?.role;
  const isUserSiteAdmin = isSiteAdmin(user);

  if (!isUserSiteAdmin && !hasRole(user as EnhancedUser, 'coach') && !hasRole(user as EnhancedUser, 'org_admin')) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto mt-20 text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
            <h2 className="text-lg font-semibold text-red-800 mb-2">Access Restricted</h2>
            <p className="text-red-700 mb-4">
              Coach Analytics is only available to coaches and organization administrators.
            </p>
            <p className="text-sm text-red-600">
              Your current role: <span className="font-medium">{userRole || 'athlete'}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Coach Analytics</h1>
          <p className="text-muted-foreground">
            Advanced performance analytics and insights for your athletes
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchAnalyticsData}
            disabled={state.isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${state.isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!state.analyticsData || state.isLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Analysis Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Analysis Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={state.analysisType} onValueChange={(value) => handleAnalysisTypeChange(value as AnalysisType)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="individual" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Individual Athlete
              </TabsTrigger>
              <TabsTrigger value="intra_group" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Multi-Athlete
              </TabsTrigger>
              <TabsTrigger value="inter_group" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Inter-Group Comparison
              </TabsTrigger>
            </TabsList>

            <TabsContent value="individual" className="mt-4">
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-medium text-blue-900">Individual Athlete Analysis</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Analyze a single athlete's performance over time, compare against group averages, 
                    and track personal records and improvement trends.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Athlete *</label>
                  <AthleteSelector
                    athletes={athletesForSelector}
                    selectedAthlete={state.selectedAthlete ? {
                      ...state.selectedAthlete,
                      fullName: state.selectedAthlete.name
                    } : null}
                    onSelect={(athlete) => {
                      const athleteData = athlete ? {
                        id: athlete.id,
                        name: athlete.fullName || athlete.name || 'Unknown',
                        teamName: athlete.teamName
                      } : null;
                      handleAthleteSelect(athlete?.id || '', athleteData);
                    }}
                    placeholder={
                      isLoadingAthletes
                        ? "Loading athletes..."
                        : state.availableAthletes.length === 0
                          ? "No athletes available"
                          : "Select athlete..."
                    }
                    searchPlaceholder="Search athletes by name or team..."
                    showTeamInfo={true}
                    disabled={isLoadingAthletes}
                  />

                  {!isLoadingAthletes && state.availableAthletes.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No athletes found for your organization. Check that athletes are properly assigned to your organization.
                    </p>
                  )}
                  {!isLoadingAthletes && !state.selectedAthleteId && state.availableAthletes.length > 0 && (
                    <p className="text-xs text-orange-600">
                      Please select an athlete to view individual analysis.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="intra_group" className="mt-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-medium text-green-900">Multi-Athlete Analysis</h3>
                <p className="text-sm text-green-700 mt-1">
                  Compare multiple athletes within the same group (team, age group, gender, etc.) to identify
                  top performers, outliers, and distribution patterns.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="inter_group" className="mt-4">
              <div className="p-4 bg-purple-50 rounded-lg">
                <h3 className="font-medium text-purple-900">Inter-Group Comparison</h3>
                <p className="text-sm text-purple-700 mt-1">
                  Compare performance metrics across different groups (teams vs teams, age groups, 
                  gender differences) to identify group-level patterns and benchmarks.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Filter Panel with Grouping - Full Width */}
      <FilterPanel
        filters={state.filters}
        metrics={state.metrics}
        timeframe={state.timeframe}
        analysisType={state.analysisType}
        groupBy={state.groupBy}
        availableTeams={state.availableTeams}
        availableAthletes={state.availableAthletes}
        onFiltersChange={handleFiltersChange}
        onMetricsChange={handleMetricsChange}
        onTimeframeChange={handleTimeframeChange}
        onGroupByChange={handleGroupByChange}
        onReset={handleFiltersReset}
        effectiveOrganizationId={effectiveOrganizationId || undefined}
      />

      {/* Team Comparison Cards - Show when teams are being compared */}
      {groupingResult.isGrouped && groupingResult.groupingSummary.groupType === 'team' && (
        <TeamComparisonCards
          groupingResult={groupingResult}
          primaryMetric={state.metrics.primary}
          onTeamClick={(teamId) => {
            // TODO: Add functionality to drill down into specific team
            console.log('Team clicked:', teamId);
          }}
        />
      )}

      {/* Chart Controls Bar - Always render to prevent hooks violations */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        style={{
          display: (state.analyticsData && (state.analysisType !== 'individual' || state.selectedAthleteId)) ? 'grid' : 'none'
        }}
      >
          {/* Chart Type Selection */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Chart Type</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Select value={state.selectedChartType} onValueChange={(value) => handleChartTypeChange(value as ChartType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(state.analyticsData?.meta?.recommendedCharts || []).map((chartType) => (
                    <SelectItem key={chartType} value={chartType}>
                      {formatChartTypeName(chartType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Data Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Data Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Athletes:</span>
                <Badge variant="secondary" className="text-xs">{state.analyticsData?.meta?.totalAthletes || 0}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Measurements:</span>
                <Badge variant="secondary" className="text-xs">{state.analyticsData?.meta?.totalMeasurements || 0}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Export Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Export</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={!state.analyticsData || state.isLoading}
                  className="h-7 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  CSV Data
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1 text-sm">
              {state.analyticsData?.statistics?.[state.metrics.primary] && (
                <>
                  <div className="flex justify-between">
                    <span>Average:</span>
                    <span className="font-mono text-xs">
                      {state.analyticsData.statistics[state.metrics.primary].mean.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Best:</span>
                    <span className="font-mono text-xs">
                      {(() => {
                        const stats = state.analyticsData.statistics[state.metrics.primary];
                        const metricConfig = METRIC_CONFIG[state.metrics.primary as keyof typeof METRIC_CONFIG];
                        const lowerIsBetter = metricConfig?.lowerIsBetter || false;
                        const bestValue = lowerIsBetter ? stats.min : stats.max;
                        return bestValue.toFixed(2);
                      })()}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

      {/* Chart Display - Full Width */}
      <div className="w-full">
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {state.isLoading && (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-96 w-full" />
            </CardContent>
          </Card>
        )}

        {/* Conditionally render components */}
        {!state.isLoading && !state.error && state.analyticsData && chartData && state.analysisType === 'intra_group' && state.selectedChartType === 'line_chart' && state.analyticsData.trends && state.analyticsData.trends.length > 0 && (
          <AthleteSelectionEnhanced
            data={state.analyticsData.trends}
            selectedAthleteIds={state.selectedAthleteIds}
            onSelectionChange={handleAthleteIdsChange}
            maxSelection={10}
            metric={state.metrics.primary}
            className="mb-4"
          />
        )}

        {!state.isLoading && !state.error && state.analyticsData && chartData && state.analysisType !== 'individual' && state.selectedChartType === 'time_series_box_swarm' && state.analyticsData.trends && state.analyticsData.trends.length > 0 && (
          <DateSelector
            data={state.analyticsData.trends}
            selectedDates={state.selectedDates}
            onSelectionChange={handleDatesChange}
            maxSelection={10}
            className="mb-4"
          />
        )}

        {!state.isLoading && !state.error && state.analyticsData && chartData && (
          <ChartContainer
            title={chartConfig.title}
            subtitle={chartConfig.subtitle}
            chartType={state.selectedChartType}
            data={chartData as ChartDataPoint[]}
            trends={state.analyticsData.trends}
            multiMetric={state.analyticsData.multiMetric}
            statistics={state.analyticsData.statistics}
            config={chartConfig}
            highlightAthlete={state.analysisType === 'individual' ? state.selectedAthleteId : undefined}
            selectedAthleteIds={state.analysisType === 'intra_group' && state.selectedChartType === 'line_chart' ? state.selectedAthleteIds : undefined}
            onAthleteSelectionChange={state.analysisType === 'intra_group' && state.selectedChartType === 'line_chart' ? handleAthleteIdsChange : undefined}
            selectedDates={state.selectedChartType === 'time_series_box_swarm' ? state.selectedDates : undefined}
            metric={state.selectedChartType === 'time_series_box_swarm' ? state.metrics.primary : undefined}
            onExport={handleExport}
            groupingResult={groupingResult}
          />
        )}

        {!state.isLoading && !state.error && !state.analyticsData && (
          <Card>
            <CardContent className="flex items-center justify-center h-96">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Data Available</h3>
                <p className="text-muted-foreground mb-4">
                  Configure your analysis parameters and filters to view analytics data.
                </p>
                {state.analysisType === 'individual' && !state.selectedAthleteId && (
                  <p className="text-sm text-muted-foreground">
                    Please select an athlete for individual analysis.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}

// Main component with provider wrapper
export function CoachAnalytics() {
  const { user } = useAuth();

  // Ensure user is authenticated
  if (!user) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <AnalyticsProvider
      organizationId={user?.currentOrganization?.id}
      userId={user.id}
      initialAnalysisType="individual"
    >
      <CoachAnalyticsContent />
    </AnalyticsProvider>
  );
}

export default CoachAnalytics;