import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWellnessAnalytics } from '@/hooks/use-wellness-analytics';
import { WellnessSummaryCard } from '@/components/wellness/WellnessSummaryCard';
import { CompletionRateCard } from '@/components/wellness/CompletionRateCard';
import { AlertsCard } from '@/components/wellness/AlertsCard';
import { WellnessTrendChart } from '@/components/wellness/WellnessTrendChart';
import { TeamHeatmap } from '@/components/wellness/TeamHeatmap';
import { WellnessFilters } from '@/components/wellness/WellnessFilters';
import { TeamComparisonCard } from '@/components/wellness/TeamComparisonCard';
import { QuestionAnalyticsTable } from '@/components/wellness/QuestionAnalyticsTable';
import { StatusTrendChart } from '@/components/wellness/StatusTrendChart';
import { InjuryTrendChart } from '@/components/wellness/InjuryTrendChart';
import { InjuryBodyMapHeatmap } from '@/components/wellness/InjuryBodyMapHeatmap';
import type { WellnessResponse, WellnessAlert, WellnessResponseData } from '@shared/wellness-types';
import { WELLNESS_CONSTANTS } from '@shared/wellness-constants';

/**
 * Wellness Analytics Dashboard
 *
 * Displays comprehensive wellness analytics including:
 * - Summary metrics (average wellness, completion rates, alerts)
 * - Trend charts showing wellness over time
 * - Team heatmaps visualizing wellness patterns
 * - Filtering by date range, teams, athletes, and questions
 */
export default function WellnessAnalytics() {
  const { organizationContext, userOrganizations, user } = useAuth();

  // Get effective organization ID
  const getEffectiveOrganizationId = () => {
    if (organizationContext) return organizationContext;
    const isSiteAdmin = user?.isSiteAdmin || false;
    if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
      return userOrganizations[0].organizationId;
    }
    return null;
  };

  const effectiveOrganizationId = getEffectiveOrganizationId();

  // Filter state
  const [filters, setFilters] = useState({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    teamIds: [] as string[],
    athleteIds: [] as string[],
    questionIds: [] as string[],
  });

  // Selected athlete for trend chart
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

  // Fetch analytics data
  const {
    summary,
    responses,
    trends,
    templates,
    responsesByTemplate,
    completionRate,
    isLoading,
  } = useWellnessAnalytics({
    organizationId: effectiveOrganizationId || '',
    filters,
    enabled: !!effectiveOrganizationId,
  });

  // Calculate alerts from responses
  const alerts = useMemo(() => {
    if (!responses || responses.length === 0) return [];

    const athleteData: Record<string, WellnessResponse[]> = {};

    // Group responses by athlete
    responses.forEach((response: WellnessResponse) => {
      if (!athleteData[response.userId]) {
        athleteData[response.userId] = [];
      }
      athleteData[response.userId].push(response);
    });

    const detectedAlerts: WellnessAlert[] = [];

    // Detect concerning patterns
    Object.entries(athleteData).forEach(([userId, userResponses]) => {
      // Sort by date
      const sorted = [...userResponses].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Calculate average wellness score
      const scores = sorted.map((r) => {
        const responseData = r.responses as WellnessResponseData;
        const numericScores = Object.values(responseData)
          .filter((v) => typeof v.value === 'number')
          .map((v) => v.value as number);

        return numericScores.length > 0
          ? numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length
          : null;
      }).filter((s): s is number => s !== null);

      if (scores.length < 2) return;

      // Check for significant drop using constant
      const latest = scores[scores.length - 1];
      const previous = scores[scores.length - 2];
      const dropPercentage = ((previous - latest) / previous) * 100;

      if (dropPercentage > WELLNESS_CONSTANTS.ALERT_DROP_PERCENTAGE) {
        detectedAlerts.push({
          id: `drop-${userId}`,
          athleteId: userId,
          athleteName: sorted[0].userFullName,
          questionId: '', // Aggregate alert, not specific to a question
          questionLabel: 'Overall Wellness',
          severity: 'high',
          type: 'wellness_drop',
          message: `Wellness dropped ${dropPercentage.toFixed(0)}% from previous submission`,
          value: latest,
          threshold: previous,
          date: sorted[sorted.length - 1].date,
          acknowledgedAt: null,
          acknowledgedBy: null,
        });
      }

      // Check for sustained low wellness using constants
      let consecutiveLowDays = 0;
      for (const score of scores.slice(-5)) {
        if (score < WELLNESS_CONSTANTS.ALERT_LOW_SCORE_THRESHOLD) {
          consecutiveLowDays++;
        } else {
          consecutiveLowDays = 0;
        }
      }

      if (consecutiveLowDays >= WELLNESS_CONSTANTS.ALERT_CONSECUTIVE_LOW_DAYS) {
        detectedAlerts.push({
          id: `sustained-low-${userId}`,
          athleteId: userId,
          athleteName: sorted[0].userFullName,
          questionId: '', // Aggregate alert, not specific to a question
          questionLabel: 'Overall Wellness',
          severity: 'medium',
          type: 'sustained_low',
          message: `Wellness has been low for ${consecutiveLowDays} consecutive days`,
          value: scores[scores.length - 1],
          threshold: WELLNESS_CONSTANTS.ALERT_LOW_SCORE_THRESHOLD,
          date: sorted[sorted.length - 1].date,
          acknowledgedAt: null,
          acknowledgedBy: null,
        });
      }
    });

    return detectedAlerts;
  }, [responses]);

  // Completion rate is now calculated in useWellnessAnalytics hook

  // Filter functions
  const handleFilterChange = (newFilters: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleClearFilters = () => {
    setFilters({
      dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dateTo: new Date().toISOString().split('T')[0],
      teamIds: [],
      athleteIds: [],
      questionIds: [],
    });
  };

  if (!effectiveOrganizationId) {
    return (
      <div className="p-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              Please select an organization to view wellness analytics.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Wellness Analytics</h1>
      </div>

      {/* Filters Section */}
      <div data-testid="filters-section">
        <WellnessFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          organizationId={effectiveOrganizationId}
        />
      </div>

      {/* Summary Cards */}
      <div data-testid="summary-cards-section" className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <>
            <WellnessSummaryCard
              summary={summary}
              data-testid="card-average-wellness"
            />
            <CompletionRateCard
              completionRate={completionRate}
              data-testid="card-completion-rate"
            />
            <AlertsCard
              alerts={alerts}
              onAlertClick={(athleteId) => setSelectedAthleteId(athleteId)}
              data-testid="card-alerts"
            />
          </>
        )}
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="status">Status Trends</TabsTrigger>
          <TabsTrigger value="injuries">Injuries</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Trend Chart */}
          <div data-testid="section-trend-chart">
            <Card>
              <CardHeader>
                <CardTitle data-testid="chart-title">Wellness Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-96" />
                ) : (
                  <WellnessTrendChart
                    trends={trends || []}
                    responses={responses || []}
                    selectedAthleteId={selectedAthleteId}
                    onAthleteSelect={setSelectedAthleteId}
                    organizationId={effectiveOrganizationId}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Team Heatmaps (one per template) */}
          <div data-testid="section-team-heatmap" className="space-y-6">
            {isLoading ? (
              <Card>
                <CardHeader>
                  <CardTitle data-testid="heatmap-title">Team Wellness Heatmap</CardTitle>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-96" />
                </CardContent>
              </Card>
            ) : responsesByTemplate && Object.keys(responsesByTemplate).length > 0 ? (
              Object.entries(responsesByTemplate).map(([templateId, { template, responses: templateResponses }]) => (
                <Card key={templateId}>
                  <CardHeader>
                    <CardTitle data-testid={`heatmap-title-${templateId}`}>
                      {template.name} - Team Wellness Heatmap
                    </CardTitle>
                    {template.description && (
                      <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <TeamHeatmap
                      responses={templateResponses}
                      template={template}
                      filters={filters}
                      organizationId={effectiveOrganizationId}
                    />
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle data-testid="heatmap-title">Team Wellness Heatmap</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500 text-center py-8">No wellness data available</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Teams Tab */}
        <TabsContent value="teams" className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-96" />
          ) : (
            <TeamComparisonCard
              responses={responses || []}
              responsesByTemplate={responsesByTemplate || {}}
              filters={filters}
              onTeamClick={(teamId) => {
                // Update filters to show only this team
                handleFilterChange({ teamIds: [teamId] });
              }}
            />
          )}
        </TabsContent>

        {/* Questions Tab */}
        <TabsContent value="questions" className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-96" />
          ) : (
            <QuestionAnalyticsTable
              responses={responses || []}
              responsesByTemplate={responsesByTemplate || {}}
            />
          )}
        </TabsContent>

        {/* Status Trends Tab */}
        <TabsContent value="status" className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-96" />
          ) : responsesByTemplate && Object.keys(responsesByTemplate).length > 0 ? (
            Object.entries(responsesByTemplate).map(([templateId, { template, responses: templateResponses }]) => (
              <StatusTrendChart
                key={templateId}
                template={template}
                responses={templateResponses}
                filters={filters}
              />
            ))
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Status Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500 text-center py-8">No status data available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Injuries Tab */}
        <TabsContent value="injuries" className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-96" />
          ) : responsesByTemplate && Object.keys(responsesByTemplate).length > 0 ? (
            Object.entries(responsesByTemplate).map(([templateId, { template, responses: templateResponses }]) => (
              <div key={templateId} className="space-y-6">
                <InjuryTrendChart
                  template={template}
                  responses={templateResponses}
                  filters={filters}
                />
                <InjuryBodyMapHeatmap
                  template={template}
                  responses={templateResponses}
                  filters={filters}
                />
              </div>
            ))
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Injury Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500 text-center py-8">No injury data available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
