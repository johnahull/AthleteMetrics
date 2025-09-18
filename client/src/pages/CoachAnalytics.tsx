import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, Users, User, BarChart3, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { ChartContainer, getRecommendedChartType } from '@/components/charts/ChartContainer';
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

import { useAuth } from '@/lib/auth';
import { sortAthletesByLastName, filterAthletesByName } from '@/lib/utils/names';
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
    'multi_line': 'Multi Line'
  };

  return chartTypeNames[chartType] || chartType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function CoachAnalytics() {
  const { user, organizationContext } = useAuth();

  // Get user's organizations for fallback when organizationContext is null
  const { data: userOrganizations } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
  });

  // Role-based access control - only coaches and org admins
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
  
  // Core state
  const [analysisType, setAnalysisType] = useState<AnalysisType>('individual');
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>('');
  const [athleteSearchTerm, setAthleteSearchTerm] = useState<string>('');
  const [selectedAthlete, setSelectedAthlete] = useState<{id: string, name: string, teamName?: string} | null>(null);
  const [filters, setFilters] = useState<FilterType>({
    organizationId: ''
  });
  const [metrics, setMetrics] = useState<MetricSelection>({
    primary: 'FLY10_TIME',
    additional: []
  });
  const [timeframe, setTimeframe] = useState<TimeframeConfig>({
    type: 'best',
    period: 'all_time'
  });

  // Data and UI state
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [availableTeams, setAvailableTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [availableAthletes, setAvailableAthletes] = useState<Array<{ id: string; name: string; teamName?: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAthletes, setIsLoadingAthletes] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chart configuration
  const [selectedChartType, setSelectedChartType] = useState<ChartType>('box_swarm_combo');

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

  // Load initial data and update organizationId in filters
  useEffect(() => {
    console.log('User object in coach analytics:', user);
    console.log('Organization context:', organizationContext);
    console.log('User organizations:', userOrganizations);
    console.log('Effective organization ID:', effectiveOrganizationId);
    
    // Update filters with effective organization ID when available
    if (effectiveOrganizationId && filters.organizationId !== effectiveOrganizationId) {
      setFilters(prev => ({ ...prev, organizationId: effectiveOrganizationId }));
    }
    
    loadInitialData();
  }, [user, organizationContext, userOrganizations, effectiveOrganizationId]);

  // Auto-refresh when key parameters change
  useEffect(() => {
    if (effectiveOrganizationId) {
      fetchAnalyticsData();
    }
  }, [analysisType, filters, metrics, timeframe, selectedAthleteId, effectiveOrganizationId]);

  // Update chart type recommendation when analysis parameters change
  useEffect(() => {
    const recommended = getRecommendedChartType(
      analysisType,
      metrics.additional.length + 1,
      timeframe.type
    );
    setSelectedChartType(recommended);
  }, [analysisType, metrics, timeframe]);

  const loadInitialData = async () => {
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
        setAvailableTeams(teams.map((team: any) => ({
          id: team.id,
          name: team.name
        })));
      } else {
        console.error('Teams request failed:', teamsResponse.status, await teamsResponse.text());
      }

      // Load athletes from organization profile
      if (organizationResponse.ok) {
        const organizationProfile = await organizationResponse.json();
        console.log('Organization profile loaded:', organizationProfile);
        const athletes = organizationProfile.users || [];
        console.log('Raw users from organization:', athletes.length);
        
        // Log all users first to understand the data structure
        athletes.forEach((athlete: any) => {
          console.log('User:', athlete.user?.firstName, athlete.user?.lastName, 'Role:', athlete.role);
        });
        
        // Filter to show only athletes (users with 'athlete' role)
        const filteredAthletes = athletes.filter((athlete: any) => athlete.role === 'athlete');
        console.log('Filtered athletes only:', filteredAthletes.length, 'out of', athletes.length, 'total users');
        
        setAvailableAthletes(filteredAthletes.map((athlete: any) => ({
          id: athlete.user.id,
          name: `${athlete.user.firstName} ${athlete.user.lastName}`,
          teamName: athlete.teamName
        })));
      } else {
        console.error('Organization request failed:', organizationResponse.status, await organizationResponse.text());
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    } finally {
      setIsLoadingAthletes(false);
      console.log('Finished loading athletes');
    }
  };

  // Filtered and sorted athletes for search dropdown
  const filteredAthletes = useMemo(() => {
    if (!availableAthletes.length) return [];

    // First filter by search term
    const filtered = filterAthletesByName(availableAthletes, athleteSearchTerm, 'name');

    // Then sort by last name
    const sorted = sortAthletesByLastName(filtered, 'name');

    // Limit results for performance
    return sorted.slice(0, 15);
  }, [availableAthletes, athleteSearchTerm]);

  const fetchAnalyticsData = async () => {
    if (!effectiveOrganizationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const request: AnalyticsRequest = {
        analysisType,
        filters: { ...filters, organizationId: effectiveOrganizationId },
        metrics,
        timeframe,
        athleteId: analysisType === 'individual' ? selectedAthleteId : undefined
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
      setAnalyticsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
      setAnalyticsData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFiltersReset = useCallback(() => {
    setFilters({ organizationId: effectiveOrganizationId || '' });
    setMetrics({ primary: 'FLY10_TIME', additional: [] });
    setTimeframe({ type: 'best', period: 'all_time' });
    setSelectedAthleteId('');
    setAthleteSearchTerm('');
    setSelectedAthlete(null);
  }, [effectiveOrganizationId]);

  const handleExport = useCallback(async () => {
    // TODO: Implement export functionality
    // Export analytics data functionality
  }, [analyticsData]);

  // Chart data based on current selection
  const chartData = useMemo(() => {
    if (!analyticsData) return null;

    switch (selectedChartType) {
      case 'line_chart':
      case 'multi_line':
      case 'connected_scatter':
        return analyticsData.trends;
      case 'radar_chart':
        return analyticsData.multiMetric;
      default:
        return analyticsData.data;
    }
  }, [analyticsData, selectedChartType]);

  const chartConfig = useMemo(() => {
    let title = 'Performance Analytics';
    let subtitle = '';

    switch (analysisType) {
      case 'individual':
        const athleteName = availableAthletes.find(a => a.id === selectedAthleteId)?.name;
        title = athleteName ? `${athleteName} - Performance Analysis` : 'Individual Performance Analysis';
        subtitle = `${metrics.primary} ${timeframe.type === 'best' ? 'Best Values' : 'Trends'} - ${timeframe.period.replace('_', ' ').toUpperCase()}`;
        break;
      case 'intra_group':
        title = 'Intra-Group Comparison';
        subtitle = `Comparing athletes within selected groups - ${metrics.primary}`;
        break;
      case 'inter_group':
        title = 'Inter-Group Comparison';
        subtitle = `Comparing performance across different groups - ${metrics.primary}`;
        break;
    }

    return {
      type: selectedChartType,
      title,
      subtitle,
      showLegend: true,
      showTooltips: true,
      responsive: true,
      aspectRatio: 2
    };
  }, [analysisType, selectedChartType, metrics, timeframe, selectedAthleteId, availableAthletes]);

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
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!analyticsData || isLoading}
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
          <Tabs value={analysisType} onValueChange={(value) => setAnalysisType(value as AnalysisType)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="individual" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Individual Athlete
              </TabsTrigger>
              <TabsTrigger value="intra_group" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Intra-Group Comparison
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
                  <div className="relative">
                    <Input
                      placeholder={
                        isLoadingAthletes
                          ? "Loading athletes..."
                          : availableAthletes.length === 0
                            ? "No athletes available"
                            : "Search and select athlete..."
                      }
                      value={selectedAthlete ? selectedAthlete.name : athleteSearchTerm}
                      onChange={(e) => {
                        setAthleteSearchTerm(e.target.value);
                        if (selectedAthlete && e.target.value !== selectedAthlete.name) {
                          setSelectedAthlete(null);
                          setSelectedAthleteId('');
                        }
                      }}
                      disabled={isLoadingAthletes}
                      className="pl-10"
                    />
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />

                    {athleteSearchTerm && !selectedAthlete && filteredAthletes.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredAthletes.map((athlete) => (
                          <button
                            key={athlete.id}
                            type="button"
                            className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                            onClick={() => {
                              setSelectedAthlete(athlete);
                              setAthleteSearchTerm('');
                              setSelectedAthleteId(athlete.id);
                            }}
                          >
                            <div>
                              <p className="font-medium">{athlete.name}</p>
                              {athlete.teamName && (
                                <p className="text-sm text-gray-500">{athlete.teamName}</p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!isLoadingAthletes && availableAthletes.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No athletes found for your organization. Check that athletes are properly assigned to your organization.
                    </p>
                  )}
                  {!isLoadingAthletes && !selectedAthleteId && availableAthletes.length > 0 && (
                    <p className="text-xs text-orange-600">
                      Please select an athlete to view individual analysis.
                    </p>
                  )}
                  {athleteSearchTerm && !selectedAthlete && filteredAthletes.length === 0 && availableAthletes.length > 0 && (
                    <p className="text-xs text-gray-500">
                      No athletes found matching "{athleteSearchTerm}". Try a different search term.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="intra_group" className="mt-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-medium text-green-900">Intra-Group Comparison</h3>
                <p className="text-sm text-green-700 mt-1">
                  Compare athletes within the same group (team, age group, gender, etc.) to identify 
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

      {/* Analytics Filters - Full Width */}
      <AnalyticsFilters
        filters={filters}
        metrics={metrics}
        timeframe={timeframe}
        analysisType={analysisType}
        availableTeams={availableTeams}
        availableAthletes={availableAthletes}
        onFiltersChange={setFilters}
        onMetricsChange={setMetrics}
        onTimeframeChange={setTimeframe}
        onAnalysisTypeChange={setAnalysisType}
        onReset={handleFiltersReset}
      />

      {/* Chart Controls and Display */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Chart Controls Sidebar */}
        <div className="lg:col-span-1">
          {/* Chart Type Selection */}
          {analyticsData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Chart Type</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedChartType} onValueChange={(value) => setSelectedChartType(value as ChartType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {analyticsData.meta.recommendedCharts.map((chartType) => (
                      <SelectItem key={chartType} value={chartType}>
                        {formatChartTypeName(chartType)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Data Summary */}
          {analyticsData && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Data Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Athletes:</span>
                  <Badge variant="secondary">{analyticsData.meta.totalAthletes}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Measurements:</span>
                  <Badge variant="secondary">{analyticsData.meta.totalMeasurements}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Date Range:</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(analyticsData.meta.dateRange.start).toLocaleDateString()} - {new Date(analyticsData.meta.dateRange.end).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Chart Display */}
        <div className="lg:col-span-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isLoading && (
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

          {!isLoading && !error && analyticsData && chartData && (
            <ChartContainer
              title={chartConfig.title}
              subtitle={chartConfig.subtitle}
              chartType={selectedChartType}
              data={chartData as ChartDataPoint[]}
              trends={analyticsData.trends}
              multiMetric={analyticsData.multiMetric}
              statistics={analyticsData.statistics}
              config={chartConfig}
              highlightAthlete={analysisType === 'individual' ? selectedAthleteId : undefined}
              onExport={handleExport}
            />
          )}

          {!isLoading && !error && !analyticsData && (
            <Card>
              <CardContent className="flex items-center justify-center h-96">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Data Available</h3>
                  <p className="text-muted-foreground mb-4">
                    Configure your analysis parameters and filters to view analytics data.
                  </p>
                  {analysisType === 'individual' && !selectedAthleteId && (
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
    </div>
    </ErrorBoundary>
  );
}

export default CoachAnalytics;