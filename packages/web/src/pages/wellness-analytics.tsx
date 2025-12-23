import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWellnessAnalytics } from '@/hooks/use-wellness-analytics';
import { WellnessSummaryCard } from '@/components/wellness/WellnessSummaryCard';
import { AtRiskAthletesCard } from '@/components/wellness/AtRiskAthletesCard';
import { InjurySummaryCard } from '@/components/wellness/InjurySummaryCard';
import { WellnessTrendChart } from '@/components/wellness/WellnessTrendChart';
import { TeamHeatmap } from '@/components/wellness/TeamHeatmap';
import { WellnessFilters } from '@/components/wellness/WellnessFilters';
import { TeamComparisonCard } from '@/components/wellness/TeamComparisonCard';
import { QuestionAnalyticsTable } from '@/components/wellness/QuestionAnalyticsTable';
import { StatusTrendChart } from '@/components/wellness/StatusTrendChart';
import { InjuryTrendChart } from '@/components/wellness/InjuryTrendChart';
import { InjuryBodyMapHeatmap } from '@/components/wellness/InjuryBodyMapHeatmap';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';

/**
 * Wellness Analytics Dashboard
 *
 * Displays comprehensive wellness analytics including:
 * - Summary metrics (average wellness, at-risk athletes, injuries)
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
    scaleOrientation,
    isLoading,
  } = useWellnessAnalytics({
    organizationId: effectiveOrganizationId || '',
    filters,
    enabled: !!effectiveOrganizationId,
  });

  // Extract scale from first template's first scale question
  const getTemplateScale = (templateData?: Record<string, { template: WellnessTemplate; responses: WellnessResponse[] }>) => {
    if (!templateData || Object.keys(templateData).length === 0) {
      return 10; // Default to 10 if no templates
    }

    // Get first template
    const firstTemplateData = Object.values(templateData)[0];
    const template = firstTemplateData?.template;

    if (!template) {
      return 10;
    }

    // Find first scale question
    const scaleQuestion = template.config.questions.find(q => q.type === 'scale');
    if (scaleQuestion && scaleQuestion.type === 'scale') {
      return scaleQuestion.scaleMax;
    }

    // No scale questions found, default to 10
    return 10;
  };

  const scaleMax = getTemplateScale(responsesByTemplate);

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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
      <div data-testid="summary-cards-section" className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
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
              scaleMax={scaleMax}
              data-testid="card-average-wellness"
            />
            <AtRiskAthletesCard
              responses={responses || []}
              responsesByTemplate={responsesByTemplate || {}}
              onAthleteClick={(athleteId) => setSelectedAthleteId(athleteId)}
              data-testid="card-at-risk-athletes"
            />
            <InjurySummaryCard
              responses={responses || []}
              responsesByTemplate={responsesByTemplate || {}}
              data-testid="card-injury-summary"
            />
          </>
        )}
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1">
          <TabsTrigger value="overview" className="min-h-[44px] py-3">Overview</TabsTrigger>
          <TabsTrigger value="teams" className="min-h-[44px] py-3">Teams</TabsTrigger>
          <TabsTrigger value="questions" className="min-h-[44px] py-3">Questions</TabsTrigger>
          <TabsTrigger value="status" className="min-h-[44px] py-3">Status Trends</TabsTrigger>
          <TabsTrigger value="injuries" className="min-h-[44px] py-3">Injuries</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
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
                  <CardContent className="overflow-hidden">
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

          {/* Individual Athlete Trend Chart */}
          <div data-testid="section-trend-chart">
            <Card>
              <CardHeader>
                <CardTitle data-testid="chart-title">Individual Wellness Trend</CardTitle>
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
              scaleMax={scaleMax}
              scaleOrientation={scaleOrientation}
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
              scaleOrientation={scaleOrientation}
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
