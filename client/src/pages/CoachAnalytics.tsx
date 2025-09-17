import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, Users, User, BarChart3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { ChartContainer, getRecommendedChartType } from '@/components/charts/ChartContainer';

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

export function CoachAnalytics() {
  const { user } = useAuth();

  // Role-based access control - only coaches and org admins
  if (!user) {
    return <div className="p-6">Loading...</div>;
  }

  const userRole = (user as any)?.role;
  const isSiteAdmin = (user as any)?.isSiteAdmin;
  
  if (!isSiteAdmin && userRole !== 'coach' && userRole !== 'org_admin') {
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
  const [filters, setFilters] = useState<FilterType>({
    organizationId: (user as any)?.organizationId || ''
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
  const [error, setError] = useState<string | null>(null);

  // Chart configuration
  const [selectedChartType, setSelectedChartType] = useState<ChartType>('box_plot');

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, [user]);

  // Auto-refresh when key parameters change
  useEffect(() => {
    if ((user as any)?.organizationId) {
      fetchAnalyticsData();
    }
  }, [analysisType, filters, metrics, timeframe, selectedAthleteId]);

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
    if (!(user as any)?.organizationId) return;

    try {
      // Load teams
      const teamsResponse = await fetch('/api/teams');
      if (teamsResponse.ok) {
        const teams = await teamsResponse.json();
        setAvailableTeams(teams.map((team: any) => ({
          id: team.id,
          name: team.name
        })));
      }

      // Load athletes
      const athletesResponse = await fetch('/api/users');
      if (athletesResponse.ok) {
        const athletes = await athletesResponse.json();
        setAvailableAthletes(athletes
          .filter((athlete: any) => athlete.organizationId === (user as any).organizationId)
          .map((athlete: any) => ({
            id: athlete.id,
            name: `${athlete.firstName} ${athlete.lastName}`,
            teamName: athlete.teamName
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  const fetchAnalyticsData = async () => {
    if (!(user as any)?.organizationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const request: AnalyticsRequest = {
        analysisType,
        filters: { ...filters, organizationId: (user as any).organizationId },
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
    setFilters({ organizationId: (user as any)?.organizationId || '' });
    setMetrics({ primary: 'FLY10_TIME', additional: [] });
    setTimeframe({ type: 'best', period: 'all_time' });
    setSelectedAthleteId('');
  }, [user]);

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
                
                {availableAthletes.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Athlete</label>
                    <Select value={selectedAthleteId} onValueChange={setSelectedAthleteId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an athlete to analyze" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAthletes.map((athlete) => (
                          <SelectItem key={athlete.id} value={athlete.id}>
                            {athlete.name} {athlete.teamName && `(${athlete.teamName})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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

      {/* Main Analytics Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters Panel */}
        <div className="lg:col-span-1">
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

          {/* Chart Type Selection */}
          {analyticsData && (
            <Card className="mt-4">
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
                        {chartType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
                    {analyticsData.meta.dateRange.start.toLocaleDateString()} - {analyticsData.meta.dateRange.end.toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Chart Display */}
        <div className="lg:col-span-2">
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
  );
}

export default CoachAnalytics;