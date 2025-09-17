import React, { useState, useCallback, useMemo } from 'react';
import { createAnalyticsContext, hasOrgAccess } from '../lib/types/user';
import { useAnalyticsData, useAnalyticsCacheWarming } from '../hooks/useAnalyticsData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, Trophy, TrendingUp, Target } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { ChartContainer, getRecommendedChartType } from '@/components/charts/ChartContainer';

import type {
  AnalyticsFilters as FilterType,
  MetricSelection,
  TimeframeConfig,
  AnalyticsRequest,
  AnalyticsResponse,
  ChartType,
  ChartDataPoint
} from '@shared/analytics-types';

import { useAuth } from '@/lib/auth';

export function AthleteAnalytics() {
  const { user } = useAuth();

  // Ensure user is authenticated
  if (!user) {
    return <div className="p-6">Loading...</div>;
  }

  // Create proper analytics context
  const analyticsContext = useMemo(() => 
    createAnalyticsContext(user, user?.currentOrganization?.id), 
    [user]
  );
  
  // Core state
  const [activeView, setActiveView] = useState<'progress' | 'comparison' | 'goals'>('progress');
  const [filters, setFilters] = useState<FilterType>({
    organizationId: analyticsContext?.organizationId || '',
    athleteIds: user?.id ? [user.id] : []
  });
  const [metrics, setMetrics] = useState<MetricSelection>({
    primary: 'FLY10_TIME',
    additional: []
  });
  const [timeframe, setTimeframe] = useState<TimeframeConfig>({
    type: 'trends',
    period: 'last_90_days'
  });

  // Chart configuration
  const [selectedChartType, setSelectedChartType] = useState<ChartType>('line_chart');

  // Optimized analytics data fetching with caching
  const analyticsRequest = useMemo(() => ({
    analysisType: activeView === 'comparison' ? 'inter_group' as const : 'individual' as const,
    filters: {
      organizationId: analyticsContext?.organizationId || '',
      athleteIds: analyticsContext?.userId ? [analyticsContext.userId] : []
    },
    metrics,
    timeframe,
    athleteId: analyticsContext?.userId
  }), [activeView, analyticsContext, metrics, timeframe]);

  const { 
    data: analyticsData, 
    chartData: hookChartData,
    isLoading, 
    isError,
    error,
    refetch 
  } = useAnalyticsData({
    request: analyticsRequest,
    enabled: !!analyticsContext?.userId && !!analyticsContext?.organizationId
  });

  // Cache warming for better UX
  const { warmCache } = useAnalyticsCacheWarming(
    analyticsContext?.organizationId || '',
    analyticsContext?.userId
  );

  // Update chart type recommendation when analysis parameters change
  useMemo(() => {
    const analysisType = activeView === 'comparison' ? 'inter_group' : 'individual';
    const recommended = getRecommendedChartType(
      analysisType,
      metrics.additional.length + 1,
      timeframe.type
    );
    setSelectedChartType(recommended);
  }, [activeView, metrics, timeframe]);

  // Initialize cache warming on component mount
  React.useEffect(() => {
    if (analyticsContext?.organizationId && analyticsContext?.userId) {
      warmCache();
    }
  }, [analyticsContext?.organizationId, analyticsContext?.userId, warmCache]);

  const handleMetricsChange = useCallback((newMetrics: MetricSelection) => {
    setMetrics(newMetrics);
  }, []);

  const handleTimeframeChange = useCallback((newTimeframe: TimeframeConfig) => {
    setTimeframe(newTimeframe);
  }, []);

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
    let title = 'My Performance Analytics';
    let subtitle = '';

    switch (activeView) {
      case 'progress':
        title = 'Personal Progress';
        subtitle = `${metrics.primary} progress over time`;
        break;
      case 'comparison':
        title = 'Performance vs Peers';
        subtitle = `How you compare to other athletes in your group`;
        break;
      case 'goals':
        title = 'Goal Tracking';
        subtitle = 'Progress towards your performance targets';
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
  }, [activeView, selectedChartType, metrics]);

  // Calculate personal insights
  const personalInsights = useMemo(() => {
    if (!analyticsData || !user?.id) return null;

    const userTrends = analyticsData.trends?.filter(trend => trend.athleteId === user.id) || [];
    const userStats = analyticsData.statistics[metrics.primary];
    
    if (!userStats || userTrends.length === 0) return null;

    const primaryTrend = userTrends.find(trend => trend.metric === metrics.primary);
    const personalBests = primaryTrend?.data.filter(point => point.isPersonalBest) || [];
    
    return {
      personalBests: personalBests.length,
      recentImprovement: primaryTrend && primaryTrend.data.length > 1 ? 
        primaryTrend.data[primaryTrend.data.length - 1].value - primaryTrend.data[0].value : 0,
      groupPercentile: userStats && userStats.max > 0 ? 
        Math.round((userStats.mean / userStats.max) * 100) : 50
    };
  }, [analyticsData, user, metrics]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Analytics</h1>
          <p className="text-muted-foreground">
            Track your performance progress and compare with peers
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
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

      {/* Quick Stats */}
      {personalInsights && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Trophy className="h-8 w-8 text-yellow-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Personal Bests</p>
                  <p className="text-2xl font-bold">{personalInsights.personalBests}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Recent Progress</p>
                  <p className="text-2xl font-bold">
                    {personalInsights.recentImprovement > 0 ? '+' : ''}
                    {personalInsights.recentImprovement.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Target className="h-8 w-8 text-blue-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Group Ranking</p>
                  <p className="text-2xl font-bold">{personalInsights.groupPercentile}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Analysis Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis View</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeView} onValueChange={(value) => setActiveView(value as 'progress' | 'comparison' | 'goals')}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="progress" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Personal Progress
              </TabsTrigger>
              <TabsTrigger value="comparison" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Peer Comparison
              </TabsTrigger>
              <TabsTrigger value="goals" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Goal Tracking
              </TabsTrigger>
            </TabsList>

            <TabsContent value="progress" className="mt-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-blue-900">Personal Progress Tracking</h3>
                <p className="text-sm text-blue-700 mt-1">
                  View your performance improvements over time, identify personal bests, 
                  and track trends in your athletic development.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="comparison" className="mt-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-medium text-green-900">Peer Comparison</h3>
                <p className="text-sm text-green-700 mt-1">
                  See how your performance compares to other athletes in your group, 
                  team, or age category to understand your relative strengths.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="goals" className="mt-4">
              <div className="p-4 bg-purple-50 rounded-lg">
                <h3 className="font-medium text-purple-900">Goal Tracking</h3>
                <p className="text-sm text-purple-700 mt-1">
                  Monitor progress towards your performance goals and targets 
                  set by yourself or your coach.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Controls and Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Primary Metric</CardTitle>
          </CardHeader>
          <CardContent>
            <Select 
              value={metrics.primary} 
              onValueChange={(value) => handleMetricsChange({ ...metrics, primary: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FLY10_TIME">10-Yard Fly Time</SelectItem>
                <SelectItem value="VERTICAL_JUMP">Vertical Jump</SelectItem>
                <SelectItem value="AGILITY_505">5-0-5 Agility</SelectItem>
                <SelectItem value="AGILITY_5105">5-10-5 Agility</SelectItem>
                <SelectItem value="T_TEST">T-Test Agility</SelectItem>
                <SelectItem value="DASH_40YD">40-Yard Dash</SelectItem>
                <SelectItem value="RSI">Reactive Strength Index</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Time Period */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Time Period</CardTitle>
          </CardHeader>
          <CardContent>
            <Select 
              value={timeframe.period} 
              onValueChange={(value) => handleTimeframeChange({ ...timeframe, period: value as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="last_90_days">Last 90 Days</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Chart Type */}
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
                      {chartType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main Chart */}
      <div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error?.message || String(error)}</AlertDescription>
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
            highlightAthlete={user?.id}
            onExport={handleExport}
          />
        )}

        {!isLoading && !error && !analyticsData && (
          <Card>
            <CardContent className="flex items-center justify-center h-96">
              <div className="text-center">
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Performance Data</h3>
                <p className="text-muted-foreground mb-4">
                  You don't have any performance measurements yet. 
                  Ask your coach to record your test results to start tracking your progress.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Performance Summary */}
      {analyticsData && analyticsData.statistics[metrics.primary] && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="font-medium">Personal Best</div>
                <div className="text-lg font-bold text-green-600">
                  {analyticsData.statistics[metrics.primary].max.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="font-medium">Recent Average</div>
                <div className="text-lg font-bold text-blue-600">
                  {analyticsData.statistics[metrics.primary].mean.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="font-medium">Group Average</div>
                <div className="text-lg font-bold text-gray-600">
                  {analyticsData.statistics[metrics.primary].median.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="font-medium">Measurements</div>
                <div className="text-lg font-bold text-purple-600">
                  {analyticsData.statistics[metrics.primary].count}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AthleteAnalytics;