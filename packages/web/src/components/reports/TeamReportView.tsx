import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGenerateReport } from "@/hooks/use-reports";
import { useReportPdf } from "@/hooks/use-report-pdf";
import { useToast } from "@/hooks/use-toast";
import { useMetricLabels } from "@/hooks/use-metric-labels";
import { useTeams } from "@/hooks/use-teams";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportLoadingState } from "./ReportLoadingState";
import { ReportErrorState } from "./ReportErrorState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { TierBadgeCompact } from "@/components/benchmarks/TierBadge";
import { FileDown, Share2, Users, Calendar, TrendingUp, Activity, ChevronDown, Send } from "lucide-react";
import { ShareReportDialog } from "./ShareReportDialog";
import { SendReportToMultipleAthletesDialog } from "./SendReportToMultipleAthletesDialog";
import { CoachingInsightsCard } from "./CoachingInsightsCard";
import { MetricExplanation } from "./MetricExplanation";
import { ReportMetricsGlossary } from "./ReportMetricsGlossary";
import { format } from "date-fns";
import {
  getPerformanceColor,
  getQuartileBadge,
  formatDateRange,
  getTeamNames,
  getMetricsList,
  getCompositeIndexDescription,
  calculateBenchmarkAchievements,
  calculateDeviationStats,
  calculateTierDistributions,
} from "./report-utils";
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from "@/lib/report-utils";
import { isFly10Metric, formatFly10Dual } from "@/utils/fly10-conversion";
import type { Report, TeamReportData, TeamStatistic, AthleteRanking, PdfFormat, TeamReportConfig } from "@/types/report-types";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { resolveTeamChartSelection } from "@shared/report-charts";
import { TeamTrendSection } from "./TeamTrendSection";
import { TeamBenchmarkStandingSection } from "./TeamBenchmarkStandingSection";
import { TeamBoxSwarmSection } from "./TeamBoxSwarmSection";
import { LeaderboardBarSection } from "./LeaderboardBarSection";
import { TierDistributionChartSection } from "./TierDistributionChartSection";

interface TeamReportViewProps {
  report: Report;
}

export function TeamReportView({ report }: TeamReportViewProps) {
  const labels = useContextualLabels();
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showMultiSendDialog, setShowMultiSendDialog] = useState(false);
  const generateReport = useGenerateReport(report.id);
  const [reportData, setReportData] = useState<TeamReportData | null>(null);
  const { toast } = useToast();

  // Fetch teams for team name display
  const { data: teams } = useTeams({ organizationId: report.organizationId });

  // Determine if AI is enabled for this organization
  const { data: organization } = useQuery<{ aiEnabled?: boolean; aiEnabledBySiteAdmin?: boolean }>({
    queryKey: ['organizations', report.organizationId, 'details'],
    enabled: !!report.organizationId,
  });

  const aiEnabled = organization?.aiEnabled && organization?.aiEnabledBySiteAdmin;

  // Error handler for PDF download
  const handlePdfError = useCallback((error: Error) => {
    toast({
      variant: "destructive",
      title: "Download Failed",
      description: error.message || "Failed to download PDF. Please try again.",
    });
  }, [toast]);

  // PDF download hook
  const { downloadPdf, isDownloading: isPdfDownloading } = useReportPdf({
    reportId: report.id,
    reportName: report.name,
    onError: handlePdfError,
  });

  useEffect(() => {
    // Generate report data on mount
    // Team reports don't need athleteId - pass empty object
    generateReport.mutate({}, {
      onSuccess: (response) => {
        // Extract the actual report data from the response
        if (response && typeof response === 'object' && 'data' in response) {
          setReportData(response.data as TeamReportData);
        } else {
          setReportData(response as TeamReportData);
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id]);

  const handleDownloadPDF = (format: PdfFormat) => {
    downloadPdf({ format });
  };

  // Memoize tier distribution calculation (must be before early returns for hook ordering)
  const tierDistributions = useMemo(
    () => calculateTierDistributions(reportData?.athleteRankings || []),
    [reportData?.athleteRankings]
  );

  // Backstop label resolution with the org's currently-active metric labels in
  // case the report payload omits a code (e.g. custom org metric added after
  // the report ran but before it rendered). Must be called before the early
  // returns below (Rules of Hooks) — calling it after them meant this hook
  // only ran once reportData was loaded, so the hook count changed between
  // the "loading" and "loaded" renders and React threw "Rendered more hooks
  // than during the previous render."
  const { getLabel } = useMetricLabels();

  if (generateReport.isPending || !reportData) {
    return <ReportLoadingState message="Generating report..." />;
  }

  if (generateReport.isError) {
    console.error('[TeamReportView] Report generation failed:', generateReport.error);
    return (
      <ReportErrorState
        message="Failed to generate report. Please try again."
        onRetry={() => generateReport.mutate({})}
      />
    );
  }

  const { teamStatistics, athleteRankings, generatedAt, metricLabels, metricUnits, metricExplanations, teamTrends, teamDistributions } = reportData;
  const resolveLabel = (code: string) => metricLabels?.[code] ?? getLabel(code);
  const teamMetricCodes = Array.isArray(teamStatistics) ? teamStatistics.map((s: TeamStatistic) => s.metric) : [];
  const sel = resolveTeamChartSelection(report.config as TeamReportConfig);

  // Collect all unique benchmark names across all metrics
  const allBenchmarkNames = new Set<string>();
  if (Array.isArray(teamStatistics)) {
    teamStatistics.forEach((stat: TeamStatistic) => {
      if (stat.benchmarks && Array.isArray(stat.benchmarks)) {
        stat.benchmarks.forEach((benchmark) => {
          allBenchmarkNames.add(benchmark.name);
        });
      }
    });
  }
  const benchmarkColumns = Array.from(allBenchmarkNames);

  // Extract composite index weights for description
  const compositeConfig = report.config as { compositeIndex?: { weights?: Record<string, number> } };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{report.name}</CardTitle>
              {report.description && (
                <p className="text-muted-foreground mt-2">{report.description}</p>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Generated on {format(new Date(generatedAt), "PPP")}
              </p>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={isPdfDownloading}>
                    <FileDown className="h-4 w-4 mr-2" />
                    {isPdfDownloading ? "Downloading..." : "Export PDF"}
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>PDF Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDownloadPDF('visual')}>
                    <span className="font-medium">Visual (Match UI)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownloadPDF('simplified')}>
                    <span className="font-medium">Simplified (Print-Friendly)</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" onClick={() => setShowShareDialog(true)}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" onClick={() => setShowMultiSendDialog(true)} data-testid="send-to-athletes-button">
                <Send className="h-4 w-4 mr-2" />
                Send to Athletes
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Report Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Report Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Team Names */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{labels.teams}</p>
                <p className="text-base font-semibold mt-1 break-words">{getTeamNames(report.config as { filters?: { teamIds?: string[] } }, teams, labels.teams)}</p>
              </div>
            </div>

            {/* Testing Period */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Testing Period</p>
                <p className="text-base font-semibold mt-1">{formatDateRange(report.config.timeframe)}</p>
              </div>
            </div>

            {/* Athletes Tested */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{labels.athletes} Tested</p>
                <p className="text-base font-semibold mt-1">
                  {reportData.athleteCount} {reportData.athleteCount === 1 ? labels.athlete.toLowerCase() : labels.athletes.toLowerCase()}
                </p>
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Activity className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Metrics</p>
                <p className="text-base font-semibold mt-1 break-words">{getMetricsList(teamStatistics, metricLabels)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coaching Insights */}
      <CoachingInsightsCard
        reportId={report.id}
        initialInsights={report.coachingInsights}
        generatedAt={report.coachingInsightsGeneratedAt}
        model={report.coachingInsightsModel}
        aiEnabled={aiEnabled || false}
      />

      {/* Team Statistics */}
      {Array.isArray(teamStatistics) && teamStatistics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>{labels.team} Average</TableHead>
                  {benchmarkColumns.map((benchmarkName) => (
                    <TableHead key={benchmarkName}>{benchmarkName}</TableHead>
                  ))}
                  <TableHead>Top Performer</TableHead>
                  <TableHead>Range</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamStatistics.map((stat: TeamStatistic) => {
                  // Create a map of benchmark data for this metric (supports both single-value and range benchmarks)
                  const benchmarkMap = new Map<string, { value: number | null; minValue?: number | null; maxValue?: number | null; tierColor?: string }>();
                  if (stat.benchmarks && Array.isArray(stat.benchmarks)) {
                    stat.benchmarks.forEach((benchmark) => {
                      benchmarkMap.set(benchmark.name, {
                        value: benchmark.value,
                        minValue: benchmark.minValue,
                        maxValue: benchmark.maxValue,
                        tierColor: benchmark.tierColor,
                      });
                    });
                  }

                  return (
                    <TableRow key={stat.metric}>
                      <TableCell className="font-medium align-top">
                        <MetricExplanation
                          label={resolveLabel(stat.metric)}
                          explanation={metricExplanations?.[stat.metric]}
                        />
                      </TableCell>
                      <TableCell>
                        {stat.average !== null && stat.average !== undefined
                          ? (isFly10Metric(stat.metric)
                              ? formatFly10Dual(stat.average)
                              : `${stat.average.toFixed(2)} ${stat.units || ''}`)
                          : "N/A"}
                      </TableCell>
                      {benchmarkColumns.map((benchmarkName) => {
                        const benchmarkData = benchmarkMap.get(benchmarkName);
                        if (!benchmarkData) {
                          return <TableCell key={benchmarkName}>-</TableCell>;
                        }
                        // Range benchmark: display "min - max" with optional color
                        if (benchmarkData.minValue != null && benchmarkData.maxValue != null) {
                          return (
                            <TableCell key={benchmarkName}>
                              <span style={benchmarkData.tierColor ? { color: benchmarkData.tierColor } : undefined}>
                                {`${benchmarkData.minValue.toFixed(2)} - ${benchmarkData.maxValue.toFixed(2)} ${stat.units || ''}`}
                              </span>
                            </TableCell>
                          );
                        }
                        // Single-value benchmark
                        if (benchmarkData.value != null) {
                          return (
                            <TableCell key={benchmarkName}>
                              {`${benchmarkData.value.toFixed(2)} ${stat.units || ''}`}
                            </TableCell>
                          );
                        }
                        return <TableCell key={benchmarkName}>-</TableCell>;
                      })}
                      <TableCell>
                        {stat.topPerformer ? (
                          <div>
                            <div className="font-medium">{stat.topPerformer.userName}</div>
                            <div className="text-sm text-muted-foreground">
                              {stat.topPerformer.value !== null && stat.topPerformer.value !== undefined
                                ? (isFly10Metric(stat.metric)
                                    ? formatFly10Dual(stat.topPerformer.value)
                                    : `${stat.topPerformer.value.toFixed(2)} ${stat.units || ''}`)
                                : "N/A"}
                            </div>
                          </div>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        {stat.min !== null && stat.min !== undefined && stat.max !== null && stat.max !== undefined
                          ? (isFly10Metric(stat.metric)
                              ? `${formatFly10Dual(stat.min)} - ${formatFly10Dual(stat.max)}`
                              : `${stat.min.toFixed(2)} - ${stat.max.toFixed(2)} ${stat.units || ''}`)
                          : "N/A"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Benchmark Achievement Summary */}
      {(() => {
        const achievements = calculateBenchmarkAchievements(athleteRankings);
        return achievements.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Benchmark Achievement Summary</CardTitle>
              <CardDescription>
                Number of {labels.athletes.toLowerCase()} meeting each benchmark ({labels.athletes.toLowerCase()} may meet multiple benchmarks)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {achievements.map((achievement) => (
                  <div key={achievement.tier} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {achievement.count} {achievement.count === 1 ? labels.athlete.toLowerCase() : labels.athletes.toLowerCase()} met{' '}
                        <Badge variant={achievement.tier === 'No benchmark met' ? 'outline' : 'secondary'}>
                          {achievement.tier}
                        </Badge>
                      </span>
                      <span className="text-muted-foreground">
                        {achievement.percentage.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2.5">
                      <div
                        className="bg-primary h-2.5 rounded-full transition-all"
                        style={{ width: `${achievement.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}

      {/* Tier Distribution Summary */}
      {tierDistributions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Tier Distribution</CardTitle>
              <CardDescription>
                How {labels.athletes.toLowerCase()} are distributed across benchmark tiers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Tier Group</TableHead>
                    <TableHead>Distribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tierDistributions.map(({ metricCode, tierGroupName, tiers }) => (
                    <TableRow key={`${metricCode}:${tierGroupName}`}>
                      <TableCell className="font-medium">{resolveLabel(metricCode)}</TableCell>
                      <TableCell>{tierGroupName}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {tiers.map(({ tierName, tierColor, count }) => (
                            <div key={tierName} className="flex items-center gap-1">
                              <TierBadgeCompact tierName={tierName} tierColor={tierColor} />
                              <span className="text-sm text-muted-foreground">{count}</span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
      )}

      {/* Athlete Rankings - Only show if composite index is enabled */}
      {Array.isArray(athleteRankings) && athleteRankings.length > 0 && athleteRankings.some((a: any) => a.compositeIndex !== undefined) && (
        <Card>
          <CardHeader>
            <CardTitle>Composite Index Rankings</CardTitle>
            <CardDescription>{getCompositeIndexDescription(compositeConfig.compositeIndex?.weights, metricLabels)}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Athlete</TableHead>
                  <TableHead>Composite Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {athleteRankings.map((athlete: AthleteRanking, idx: number) => (
                  <TableRow key={athlete.userId}>
                    <TableCell>
                      <Badge variant={idx < 3 ? "default" : "secondary"}>
                        #{idx + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{athlete.userName}</TableCell>
                    <TableCell>{athlete.compositeIndex?.toFixed(2) || "N/A"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Individual Performance by Metric */}
      {Array.isArray(teamStatistics) && teamStatistics.length > 0 && Array.isArray(athleteRankings) && athleteRankings.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Individual Performance by Metric</h2>
          {teamStatistics.map((stat: TeamStatistic) => {
            const sortedAthletes = sortAthletesByMetric(athleteRankings, stat.metric);

            if (sortedAthletes.length === 0) return null;

            return (
              <Card key={stat.metric}>
                <CardHeader>
                  <CardTitle>{resolveLabel(stat.metric)}</CardTitle>
                  <CardDescription>
                    {labels.team} Average: {stat.average !== null ? `${stat.average.toFixed(2)} ${stat.units || ''}` : 'N/A'}
                    {stat.standardDeviation !== null && ` | SD: ±${stat.standardDeviation.toFixed(2)} ${stat.units || ''}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Rank</TableHead>
                        <TableHead>Athlete</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Percentile</TableHead>
                        <TableHead>Deviation from Avg</TableHead>
                        <TableHead>Z-Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAthletes.map((athlete: AthleteRanking, idx: number) => {
                        const value = athlete.measurements[stat.metric];
                        const percentile = athlete.percentiles?.[stat.metric];
                        const percentileColor = getPerformanceColor(percentile);
                        const quartileBadge = getQuartileBadge(percentile);

                        // Get benchmark label and metric direction
                        const benchmarkLabel = getBenchmarkLabel(athlete, stat.metric);
                        const lowerIsBetter = isLowerBetter(stat.metric);

                        // Calculate deviation statistics
                        const { deviation, percentDiff, zScore, deviationColor, zScoreColor } =
                          calculateDeviationStats(value, stat.average, stat.standardDeviation, lowerIsBetter);

                        return (
                          <TableRow key={athlete.userId}>
                            <TableCell>
                              <Badge
                                variant={idx === 0 ? "default" : idx === 1 ? "secondary" : idx === 2 ? "outline" : "secondary"}
                                className={
                                  idx === 0 ? "bg-yellow-500 text-white" :
                                  idx === 1 ? "bg-gray-400 text-white" :
                                  idx === 2 ? "bg-orange-600 text-white" : ""
                                }
                              >
                                #{idx + 1}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span>{athlete.userName}</span>
                                {(() => {
                                  // Check for tier benchmark comparison first
                                  const comps = athlete.benchmarkComparisons?.[stat.metric];
                                  const tierComp = comps?.find((c: any) => c.tierName);
                                  if (tierComp) {
                                    return <TierBadgeCompact tierName={tierComp.tierName!} tierColor={tierComp.tierColor || 'gray'} />;
                                  }
                                  if (benchmarkLabel) {
                                    return (
                                      <Badge variant="secondary" className="text-xs font-normal">
                                        {benchmarkLabel}
                                      </Badge>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </TableCell>
                            <TableCell>
                              {value !== null && value !== undefined
                                ? (isFly10Metric(stat.metric)
                                    ? formatFly10Dual(value)
                                    : `${value.toFixed(2)} ${stat.units || ''}`)
                                : "N/A"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {percentile !== undefined ? (
                                  <span className={`font-semibold ${percentileColor}`}>
                                    {percentile.toFixed(0)}th
                                  </span>
                                ) : (
                                  "N/A"
                                )}
                                {quartileBadge && (
                                  <Badge variant={quartileBadge.variant} className="text-xs">
                                    {quartileBadge.label}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {deviation !== null && percentDiff !== null ? (
                                <span className={`font-semibold ${deviationColor}`}>
                                  {deviation > 0 ? '+' : ''}{deviation.toFixed(2)} {stat.units || ''}
                                  <span className="text-xs ml-1">
                                    ({percentDiff > 0 ? '+' : ''}{percentDiff.toFixed(1)}%)
                                  </span>
                                </span>
                              ) : (
                                "N/A"
                              )}
                            </TableCell>
                            <TableCell>
                              {zScore !== null ? (
                                <span className={`font-semibold ${zScoreColor}`}>
                                  {zScore > 0 ? '+' : ''}{zScore.toFixed(2)}σ
                                </span>
                              ) : (
                                "N/A"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Charts (additive — gated by resolveTeamChartSelection; tables above stay as-is) */}
      {sel.benchmarkStanding && (
        <TeamBenchmarkStandingSection
          teamStatistics={teamStatistics}
          metricLabels={metricLabels}
          metricUnits={metricUnits}
          metricDirections={reportData.metricDirections}
          athleteRankings={athleteRankings}
          timeframe={report.config.timeframe}
        />
      )}

      {sel.trends && teamTrends && Object.keys(teamTrends).length > 0 && (
        <TeamTrendSection trends={teamTrends} metricLabels={metricLabels} metricUnits={metricUnits} />
      )}

      {sel.boxSwarm && teamDistributions && Object.keys(teamDistributions).length > 0 && (
        <TeamBoxSwarmSection
          distributions={teamDistributions}
          metricLabels={metricLabels}
          generatedAt={generatedAt}
        />
      )}

      {sel.leaderboard && (
        <LeaderboardBarSection
          athleteRankings={athleteRankings}
          teamStatistics={teamStatistics}
          metricLabels={metricLabels}
          generatedAt={generatedAt}
        />
      )}

      {sel.tierDistribution && tierDistributions.length > 0 && (
        <TierDistributionChartSection tierDistributions={tierDistributions} metricLabels={metricLabels} />
      )}

      {metricExplanations && (
        <ReportMetricsGlossary
          explanations={metricExplanations}
          metricOrder={teamMetricCodes}
        />
      )}

      {showShareDialog && (
        <ShareReportDialog
          reportId={report.id}
          open={showShareDialog}
          onClose={() => setShowShareDialog(false)}
        />
      )}

      {/* Multi-athlete send dialog */}
      <SendReportToMultipleAthletesDialog
        open={showMultiSendDialog}
        onOpenChange={setShowMultiSendDialog}
        reportId={report.id}
        reportName={report.name}
        organizationId={report.organizationId}
      />
    </div>
  );
}
