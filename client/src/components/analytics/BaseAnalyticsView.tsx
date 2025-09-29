/**
 * Base Analytics View Component
 * Abstract composition component providing common analytics functionality
 */

import React, { useEffect, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AthleteSelector } from '@/components/ui/athlete-selector';
import { AthleteSelector as AthleteSelectionEnhanced } from '@/components/ui/athlete-selector-enhanced';
import { DateSelector } from '@/components/ui/date-selector';
import { ChartContainer } from '@/components/charts/ChartContainer';

import { AnalyticsProvider, useAnalyticsContext } from '@/contexts/AnalyticsContext';
import { useAnalyticsOperations } from '@/hooks/useAnalyticsOperations';
import { useGroupComparison } from '@/hooks/useGroupComparison';
import { FilterPanel } from './FilterPanel';
import { MetricsSelector } from './MetricsSelector';
import { TimeframeSelector } from './TimeframeSelector';
import { AnalyticsToolbar } from './AnalyticsToolbar';
import { GroupSelector } from './GroupSelector';

import type { AnalysisType } from '@shared/analytics-types';
import { User, Users, BarChart3 } from 'lucide-react';
import { devLog } from '@/utils/dev-logger';

interface BaseAnalyticsViewProps {
  // Required props
  title: string;
  description: string;

  // Analytics configuration
  defaultAnalysisType?: AnalysisType;
  allowedAnalysisTypes?: AnalysisType[];
  organizationId?: string;
  userId?: string;

  // Role-based access
  requireRole?: string[];

  // Customization
  showAnalysisTypeTabs?: boolean;
  showIndividualAthleteSelection?: boolean;
  showMultiAthleteSelection?: boolean;
  showDateSelection?: boolean;

  // Layout
  headerActions?: React.ReactNode;
  additionalFilters?: React.ReactNode;
  customToolbar?: React.ReactNode;

  // Callbacks
  onAnalyticsDataChange?: (data: any) => void;
  onError?: (error: string) => void;

  className?: string;
  children?: React.ReactNode;
}

// Internal component that uses the analytics context
function BaseAnalyticsViewContent({
  title,
  description,
  defaultAnalysisType = 'individual',
  allowedAnalysisTypes = ['individual', 'intra_group', 'multi_group'],
  showAnalysisTypeTabs = true,
  showIndividualAthleteSelection = true,
  showMultiAthleteSelection = true,
  showDateSelection = true,
  headerActions,
  additionalFilters,
  customToolbar,
  onAnalyticsDataChange,
  onError,
  className,
  children
}: Omit<BaseAnalyticsViewProps, 'organizationId' | 'userId' | 'requireRole'>) {
  const { state, isDataReady, shouldFetchData, chartData: memoizedChartData } = useAnalyticsContext();
  const {
    fetchAnalyticsData,
    chartConfig,
    formatChartTypeName,
    handleExport,
    canExport,
    setAnalysisType,
    selectAthlete,
    setSelectedAthleteIds,
    setSelectedDates,
    updateFilters,
    updateMetrics,
    updateTimeframe,
    setChartType,
    setShowAllCharts,
    resetFilters,
    effectiveOrganizationId
  } = useAnalyticsOperations();

  // Group comparison functionality for multi-group analysis
  const {
    selectedGroups,
    setSelectedGroups,
    groupComparisonData,
    chartData: groupChartData,
    isLoading: isGroupLoading,
    error: groupError,
    isDataReady: isGroupDataReady
  } = useGroupComparison({
    organizationId: effectiveOrganizationId || '',
    metrics: state.metrics,
    athletes: state.availableAthletes.map(athlete => ({
      id: athlete.id,
      name: athlete.name,
      team: athlete.teamName
    })),
    analyticsData: state.analyticsData,
    isMainAnalyticsLoading: state.isLoading
  });

  // Fetch data when conditions are met
  useEffect(() => {
    if (shouldFetchData && effectiveOrganizationId) {
      fetchAnalyticsData();
    }
  }, [shouldFetchData, effectiveOrganizationId, fetchAnalyticsData]);

  // Notify parent of data changes
  useEffect(() => {
    if (state.analyticsData && onAnalyticsDataChange) {
      onAnalyticsDataChange(state.analyticsData);
    }
  }, [state.analyticsData, onAnalyticsDataChange]);

  // Notify parent of errors
  useEffect(() => {
    if (state.error && onError) {
      onError(state.error);
    }
  }, [state.error, onError]);

  // Prepare athletes for selector
  const athletesForSelector = state.availableAthletes.map(athlete => ({
    ...athlete,
    fullName: athlete.name || 'Unknown'
  }));

  const getAnalysisTypeIcon = (type: AnalysisType) => {
    switch (type) {
      case 'individual': return <User className="h-4 w-4" />;
      case 'intra_group': return <Users className="h-4 w-4" />;
      case 'multi_group': return <BarChart3 className="h-4 w-4" />;
    }
  };

  const getAnalysisTypeLabel = (type: AnalysisType) => {
    switch (type) {
      case 'individual': return 'Individual Athlete';
      case 'intra_group': return 'Multi-Athlete';
      case 'multi_group': return 'Multi-Group';
    }
  };

  const getAnalysisTypeDescription = (type: AnalysisType) => {
    switch (type) {
      case 'individual':
        return 'Analyze a single athlete\'s performance over time, compare against group averages, and track personal records and improvement trends.';
      case 'intra_group':
        return 'Compare multiple athletes within the same group (team, age group, gender, etc.) to identify top performers, outliers, and distribution patterns.';
      case 'multi_group':
        return 'Compare performance metrics across different groups (teams vs teams, age groups, gender differences) to identify group-level patterns and benchmarks.';
    }
  };

  // Chart data is already processed and memoized in the analytics context
  // Using memoizedChartData directly to avoid duplicate processing


  return (
    <ErrorBoundary>
      <div className={`space-y-6 p-6 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          {headerActions}
        </div>

        {/* Analysis Type Selection */}
        {showAnalysisTypeTabs && allowedAnalysisTypes.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Analysis Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs
                value={state.analysisType}
                onValueChange={(value) => setAnalysisType(value as AnalysisType)}
              >
                <TabsList className={`grid w-full grid-cols-${allowedAnalysisTypes.length}`}>
                  {allowedAnalysisTypes.map(type => (
                    <TabsTrigger key={type} value={type} className="flex items-center gap-2">
                      {getAnalysisTypeIcon(type)}
                      {getAnalysisTypeLabel(type)}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {allowedAnalysisTypes.map(type => (
                  <TabsContent key={type} value={type} className="mt-4">
                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg ${
                        type === 'individual' ? 'bg-blue-50' :
                        type === 'intra_group' ? 'bg-green-50' : 'bg-purple-50'
                      }`}>
                        <h3 className={`font-medium ${
                          type === 'individual' ? 'text-blue-900' :
                          type === 'intra_group' ? 'text-green-900' : 'text-purple-900'
                        }`}>
                          {getAnalysisTypeLabel(type)}
                        </h3>
                        <p className={`text-sm mt-1 ${
                          type === 'individual' ? 'text-blue-700' :
                          type === 'intra_group' ? 'text-green-700' : 'text-purple-700'
                        }`}>
                          {getAnalysisTypeDescription(type)}
                        </p>
                      </div>

                      {/* Individual Athlete Selection */}
                      {type === 'individual' && showIndividualAthleteSelection && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Select Athlete *</label>
                          <AthleteSelector
                            athletes={athletesForSelector}
                            selectedAthlete={state.selectedAthlete ? {
                              ...state.selectedAthlete,
                              fullName: state.selectedAthlete.name
                            } : null}
                            onSelect={(athlete) => {
                              selectAthlete(
                                athlete?.id || '',
                                athlete ? {
                                  id: athlete.id,
                                  name: athlete.fullName || athlete.name || 'Unknown',
                                  teamName: athlete.teamName
                                } : null
                              );
                            }}
                            placeholder={
                              state.availableAthletes.length === 0
                                ? "No athletes available"
                                : "Select athlete..."
                            }
                            searchPlaceholder="Search athletes by name or team..."
                            showTeamInfo={true}
                            disabled={state.isLoading || state.availableAthletes.length === 0}
                          />

                          {state.availableAthletes.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              No athletes found for your organization.
                            </p>
                          )}
                          {!state.selectedAthleteId && state.availableAthletes.length > 0 && (
                            <p className="text-xs text-orange-600">
                              Please select an athlete to view individual analysis.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Multi-Group Selection */}
                      {type === 'multi_group' && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Create Groups for Comparison</label>
                          <GroupSelector
                            organizationId={effectiveOrganizationId || ''}
                            athletes={state.availableAthletes.map(athlete => ({
                              id: athlete.id,
                              name: athlete.name,
                              team: athlete.teamName
                            }))}
                            selectedGroups={selectedGroups}
                            onGroupSelectionChange={setSelectedGroups}
                            maxGroups={8}
                          />

                          {selectedGroups.length === 0 && (
                            <p className="text-xs text-orange-600">
                              Please create at least 2 groups to compare performance across different categories.
                            </p>
                          )}
                          {selectedGroups.length === 1 && (
                            <p className="text-xs text-orange-600">
                              Please create at least one more group for comparison.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Unified Filter Panel - Hidden for Multi-Group analysis */}
        {state.analysisType !== 'multi_group' && (
          <FilterPanel
            filters={state.filters}
            metrics={state.metrics}
            timeframe={state.timeframe}
            analysisType={state.analysisType}
            availableTeams={state.availableTeams}
            availableAthletes={state.availableAthletes}
            onFiltersChange={updateFilters}
            onMetricsChange={updateMetrics}
            onTimeframeChange={updateTimeframe}
            onReset={() => resetFilters(effectiveOrganizationId || '')}
            effectiveOrganizationId={effectiveOrganizationId || undefined}
          />
        )}

        {/* Metrics and Timeframe for Multi-Group */}
        {state.analysisType === 'multi_group' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MetricsSelector
              metrics={state.metrics}
              onMetricsChange={updateMetrics}
            />
            <TimeframeSelector
              timeframe={state.timeframe}
              onTimeframeChange={updateTimeframe}
              analysisType={state.analysisType}
            />
          </div>
        )}

        {/* Additional Filters Slot */}
        {additionalFilters}

        {/* Analytics Toolbar */}
        {(isDataReady || state.isLoading) && (
          <>
            {customToolbar || (
              <AnalyticsToolbar
                selectedChartType={state.selectedChartType}
                availableChartTypes={state.analyticsData?.meta?.recommendedCharts || [state.selectedChartType]}
                onChartTypeChange={setChartType}
                formatChartTypeName={formatChartTypeName}
                showAllCharts={state.showAllCharts}
                onShowAllChartsChange={setShowAllCharts}
                analyticsData={state.analyticsData}
                isLoading={state.isLoading}
                onRefresh={fetchAnalyticsData}
                onExport={canExport ? handleExport : undefined}
              />
            )}

            {/* Multi-Athlete Selection for Line Charts */}
            {showMultiAthleteSelection &&
              !state.isLoading &&
              !state.error &&
              state.analyticsData &&
              memoizedChartData &&
              state.analysisType === 'intra_group' &&
              state.selectedChartType === 'line_chart' &&
              state.analyticsData.trends &&
              state.analyticsData.trends.length > 0 && (
                <AthleteSelectionEnhanced
                  data={state.analyticsData.trends}
                  selectedAthleteIds={state.selectedAthleteIds}
                  onSelectionChange={setSelectedAthleteIds}
                  maxSelection={10}
                  metric={state.metrics.primary}
                  className="mb-4"
                />
              )}

            {/* Date Selection for Time-Series Charts */}
            {showDateSelection &&
              !state.isLoading &&
              !state.error &&
              state.analyticsData &&
              memoizedChartData &&
              state.analysisType !== 'individual' &&
              state.selectedChartType === 'time_series_box_swarm' &&
              state.analyticsData.trends &&
              state.analyticsData.trends.length > 0 && (
                <DateSelector
                  data={state.analyticsData.trends}
                  selectedDates={state.selectedDates}
                  onSelectionChange={setSelectedDates}
                  maxSelection={10}
                  className="mb-4"
                />
              )}
          </>
        )}

        {/* Error Display */}
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {/* Loading Display */}
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

        {/* Chart Display */}
        {(() => {
          const shouldShowChart = !state.isLoading && !state.error && (
            state.analysisType === 'multi_group' ? 
              (selectedGroups.length >= 2 && groupChartData) : 
              (memoizedChartData && (state.analysisType === 'individual' ? state.selectedAthleteId : true))
          );

          if (state.analysisType === 'multi_group') {
            devLog.log('Multi-group chart render check:', {
              isLoading: state.isLoading,
              hasError: !!state.error,
              hasMemoizedChartData: !!memoizedChartData,
              selectedGroupsCount: selectedGroups.length,
              hasGroupChartData: !!groupChartData,
              groupChartDataLength: groupChartData?.length || 0,
              shouldShowChart
            });
          }

          return shouldShowChart;
        })() && (
          <>
            {state.showAllCharts ? (
              // Multi-Chart View: Display all available charts vertically
              <div className="space-y-6">
                {(state.analyticsData?.meta?.recommendedCharts || [state.selectedChartType]).map((chartType, index) => (
                  <Suspense key={chartType} fallback={
                    <Card>
                      <CardContent className="flex items-center justify-center h-96">
                        <Skeleton className="h-full w-full" />
                      </CardContent>
                    </Card>
                  }>
                    <ChartContainer
                      title={`${chartConfig.title} - ${formatChartTypeName(chartType)}`}
                      subtitle={chartConfig.subtitle}
                      chartType={chartType}
                      data={state.analysisType === 'multi_group' && groupChartData ? groupChartData : memoizedChartData}
                      rawData={state.analysisType === 'multi_group' && (chartType === 'box_plot' || chartType === 'box_swarm_combo' || chartType === 'violin_plot') ? memoizedChartData : undefined}
                      trends={state.analyticsData?.trends}
                      multiMetric={state.analyticsData?.multiMetric}
                      statistics={state.analyticsData?.statistics}
                      config={{
                        ...chartConfig,
                        title: `${chartConfig.title} - ${formatChartTypeName(chartType)}`
                      }}
                      highlightAthlete={state.analysisType === 'individual' ? state.selectedAthleteId : undefined}
                      selectedAthleteIds={state.analysisType === 'intra_group' && chartType === 'line_chart' ? state.selectedAthleteIds : undefined}
                      onAthleteSelectionChange={state.analysisType === 'intra_group' && chartType === 'line_chart' ? setSelectedAthleteIds : undefined}
                      selectedDates={chartType === 'time_series_box_swarm' ? state.selectedDates : undefined}
                      metric={chartType === 'time_series_box_swarm' ? state.metrics.primary : undefined}
                      onExport={handleExport}
                      selectedGroups={state.analysisType === 'multi_group' ? selectedGroups : undefined}
                    />
                  </Suspense>
                ))}
              </div>
            ) : (
              // Single Chart View: Display selected chart only
              <Suspense fallback={
                <Card>
                  <CardContent className="flex items-center justify-center h-96">
                    <Skeleton className="h-full w-full" />
                  </CardContent>
                </Card>
              }>
                <ChartContainer
                  title={chartConfig.title}
                  subtitle={chartConfig.subtitle}
                  chartType={state.selectedChartType}
                  data={state.analysisType === 'multi_group' && groupChartData ? groupChartData : memoizedChartData}
                  rawData={state.analysisType === 'multi_group' && (state.selectedChartType === 'box_plot' || state.selectedChartType === 'box_swarm_combo' || state.selectedChartType === 'violin_plot') ? memoizedChartData : undefined}
                  trends={state.analyticsData?.trends}
                  multiMetric={state.analyticsData?.multiMetric}
                  statistics={state.analyticsData?.statistics}
                  config={chartConfig}
                  highlightAthlete={state.analysisType === 'individual' ? state.selectedAthleteId : undefined}
                  selectedAthleteIds={state.analysisType === 'intra_group' && state.selectedChartType === 'line_chart' ? state.selectedAthleteIds : undefined}
                  onAthleteSelectionChange={state.analysisType === 'intra_group' && state.selectedChartType === 'line_chart' ? setSelectedAthleteIds : undefined}
                  selectedDates={state.selectedChartType === 'time_series_box_swarm' ? state.selectedDates : undefined}
                  metric={state.selectedChartType === 'time_series_box_swarm' ? state.metrics.primary : undefined}
                  onExport={handleExport}
                  selectedGroups={state.analysisType === 'multi_group' ? selectedGroups : undefined}
                />
              </Suspense>
            )}
          </>
        )}

        {/* No Data Display */}
        {!state.isLoading && !state.error && !isDataReady && !memoizedChartData && (
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
                {state.analysisType === 'multi_group' && selectedGroups.length < 2 && (
                  <p className="text-sm text-muted-foreground">
                    Please create at least 2 groups to compare performance.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Additional Content */}
        {children}
      </div>
    </ErrorBoundary>
  );
}

// Main component with provider wrapper
export function BaseAnalyticsView({
  organizationId,
  userId,
  requireRole,
  defaultAnalysisType = 'individual',
  ...props
}: BaseAnalyticsViewProps) {
  // Role-based access control would be handled here
  // This is a simplified version

  return (
    <AnalyticsProvider
      organizationId={organizationId}
      userId={userId}
      initialAnalysisType={defaultAnalysisType}
    >
      <BaseAnalyticsViewContent
        defaultAnalysisType={defaultAnalysisType}
        {...props}
      />
    </AnalyticsProvider>
  );
}