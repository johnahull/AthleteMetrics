import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGenerateReport } from "@/hooks/use-reports";
import { useTeams } from "@/hooks/use-teams";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
import { FileDown, Share2, Users, Calendar, TrendingUp, Activity, ChevronDown } from "lucide-react";
import { ShareReportDialog } from "./ShareReportDialog";
import { CoachingInsightsCard } from "./CoachingInsightsCard";
import { format } from "date-fns";
import { getMetricDisplayName } from "@/lib/metrics";
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from "@/lib/report-utils";
import { isFly10Metric, formatFly10Dual } from "@/utils/fly10-conversion";
import { useAuth } from "@/lib/auth";
import type { Report, TeamReportData, TeamStatistic, AthleteRanking, PdfFormat } from "@/types/report-types";

interface TeamReportViewProps {
  report: Report;
}

export function TeamReportView({ report }: TeamReportViewProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [pdfFormat, setPdfFormat] = useState<PdfFormat>('simplified');
  const generateReport = useGenerateReport(report.id);
  const [reportData, setReportData] = useState<TeamReportData | null>(null);
  const { user } = useAuth();

  // Fetch teams for team name display
  const { data: teams } = useTeams({ organizationId: report.organizationId });

  // Determine if AI is enabled for this organization
  const { data: organization } = useQuery<{ aiEnabled?: boolean; aiEnabledBySiteAdmin?: boolean }>({
    queryKey: [`/api/organizations/${report.organizationId}`],
    enabled: !!report.organizationId,
  });

  const aiEnabled = organization?.aiEnabled && organization?.aiEnabledBySiteAdmin;

  useEffect(() => {
    // Generate report data on mount
    // Team reports don't need athleteId - pass empty object
    generateReport.mutate({}, {
      onSuccess: (response) => {
        console.log('[TeamReportView] Report generated successfully:', response);
        // Extract the actual report data from the response
        if (response && typeof response === 'object' && 'data' in response) {
          setReportData(response.data as TeamReportData);
        } else {
          setReportData(response as TeamReportData);
        }
      },
    });
  }, [report.id]);

  const handleDownloadPDF = async (format: PdfFormat) => {
    try {
      const response = await fetch(`/api/reports/${report.id}/pdf?format=${format}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to download PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading PDF:", error);
    }
  };

  if (generateReport.isPending || !reportData) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner />
            <p className="text-muted-foreground">Generating report...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (generateReport.isError) {
    console.error('[TeamReportView] Report generation failed:', generateReport.error);

    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-4">
            <p className="text-destructive text-center">
              Failed to generate report. Please try again.
            </p>
            <Button
              onClick={() => generateReport.mutate({})}
              variant="outline"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { teamStatistics, athleteRankings, generatedAt, metricLabels } = reportData;

  console.log('[TeamReportView] Rendering with data:', {
    teamStatistics,
    athleteRankings,
    teamStatsIsArray: Array.isArray(teamStatistics),
    athleteRankingsIsArray: Array.isArray(athleteRankings),
    teamStatsLength: teamStatistics?.length,
    athleteRankingsLength: athleteRankings?.length,
    generatedAt,
    fullReportData: reportData
  });

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

  // Helper function: Get performance color class based on percentile
  const getPerformanceColor = (percentile: number | undefined): string => {
    if (percentile === undefined) return 'text-muted-foreground';
    if (percentile >= 75) return 'text-green-600';
    if (percentile >= 50) return 'text-yellow-600';
    if (percentile >= 25) return 'text-orange-600';
    return 'text-red-600';
  };

  // Helper function: Get quartile badge from percentile
  const getQuartileBadge = (percentile: number | undefined): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } | null => {
    if (percentile === undefined) return null;
    if (percentile >= 75) return { label: "Top 25%", variant: "default" };
    if (percentile >= 50) return { label: "Above Avg", variant: "secondary" };
    if (percentile >= 25) return { label: "Below Avg", variant: "outline" };
    return { label: "Bottom 25%", variant: "destructive" };
  };

  // Helper function: Format date range from timeframe config
  const formatDateRange = (): string => {
    const timeframe = report.config.timeframe;

    if (timeframe.type === 'custom') {
      const start = timeframe.customStart ? format(new Date(timeframe.customStart), 'MMM d, yyyy') : '';
      const end = timeframe.customEnd ? format(new Date(timeframe.customEnd), 'MMM d, yyyy') : '';
      return `${start} - ${end}`;
    }

    switch (timeframe.preset) {
      case 'season':
        return 'Current Season';
      case 'year':
        return 'Past Year';
      case 'all_time':
        return 'All Time';
      default:
        return 'All Time';
    }
  };

  // Helper function: Get team names from team IDs
  const getTeamNames = (): string => {
    const config = report.config as { filters?: { teamIds?: string[] } };
    const teamIds = config.filters?.teamIds;

    if (!teamIds || teamIds.length === 0) {
      return 'All Teams';
    }

    if (!teams || teams.length === 0) {
      return 'Loading...';
    }

    const teamNames = teamIds
      .map((id: string) => teams.find(t => t.id === id)?.name)
      .filter(Boolean);

    return teamNames.length > 0 ? teamNames.join(', ') : 'All Teams';
  };

  // Helper function: Get user-friendly metric names
  const getMetricsList = (): string => {
    if (!teamStatistics || teamStatistics.length === 0) {
      return 'No metrics';
    }

    return teamStatistics
      .map(stat => metricLabels?.[stat.metric] || getMetricDisplayName(stat.metric))
      .join(', ');
  };

  // Helper function: Get composite index description with weights
  const getCompositeIndexDescription = (): string => {
    const config = report.config as { compositeIndex?: { weights?: Record<string, number> } };
    const weights = config.compositeIndex?.weights;

    if (!weights || Object.keys(weights).length === 0) {
      return 'Weighted average of percentiles';
    }

    const weightDescriptions = Object.entries(weights)
      .map(([metricCode, weight]) => {
        const metricName = metricLabels?.[metricCode] || getMetricDisplayName(metricCode);
        const percentage = ((weight as number) * 100).toFixed(0);
        return `${metricName} (${percentage}%)`;
      })
      .join(', ');

    return `Weighted average of percentiles: ${weightDescriptions}`;
  };

  // Helper function: Calculate benchmark achievement statistics
  const calculateBenchmarkAchievements = () => {
    if (!athleteRankings || athleteRankings.length === 0) {
      return [];
    }

    // Get all unique benchmark names across all metrics
    const allBenchmarkNames = new Set<string>();
    athleteRankings.forEach((athlete: AthleteRanking) => {
      if (athlete.benchmarkComparisons) {
        Object.values(athlete.benchmarkComparisons).forEach((comparisons) => {
          comparisons.forEach((comp) => allBenchmarkNames.add(comp.benchmarkName));
        });
      }
    });

    // Count how many athletes meet each benchmark
    const benchmarkCounts: Record<string, number> = {};
    Array.from(allBenchmarkNames).forEach((benchmarkName) => {
      benchmarkCounts[benchmarkName] = 0;
    });

    // Track which athletes meet at least one benchmark
    const athletesWithBenchmarks = new Set<string>();

    athleteRankings.forEach((athlete: AthleteRanking) => {
      if (athlete.benchmarkComparisons) {
        // Check all metrics and all benchmarks
        Object.values(athlete.benchmarkComparisons).forEach((comparisons) => {
          comparisons.forEach((comp) => {
            if (comp.meetsOrExceeds) {
              benchmarkCounts[comp.benchmarkName]++;
              athletesWithBenchmarks.add(athlete.userId);
            }
          });
        });
      }
    });

    // Convert to array format for rendering, sorted by count descending
    const achievements = Array.from(allBenchmarkNames)
      .map((benchmarkName) => ({
        tier: benchmarkName,
        count: benchmarkCounts[benchmarkName],
        percentage: (benchmarkCounts[benchmarkName] / athleteRankings.length) * 100,
      }))
      .filter((achievement) => achievement.count > 0) // Only show benchmarks that are met
      .sort((a, b) => b.count - a.count); // Sort by count descending

    // Count athletes who didn't meet any benchmark
    const noTierCount = athleteRankings.length - athletesWithBenchmarks.size;

    // Add "no benchmark met" if applicable
    if (noTierCount > 0) {
      achievements.push({
        tier: 'No benchmark met',
        count: noTierCount,
        percentage: (noTierCount / athleteRankings.length) * 100,
      });
    }

    return achievements;
  };

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
                  <Button variant="outline">
                    <FileDown className="h-4 w-4 mr-2" />
                    Export PDF
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
                <p className="text-sm font-medium text-muted-foreground">Teams</p>
                <p className="text-base font-semibold mt-1 break-words">{getTeamNames()}</p>
              </div>
            </div>

            {/* Testing Period */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Testing Period</p>
                <p className="text-base font-semibold mt-1">{formatDateRange()}</p>
              </div>
            </div>

            {/* Athletes Tested */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Athletes Tested</p>
                <p className="text-base font-semibold mt-1">
                  {reportData.athleteCount} {reportData.athleteCount === 1 ? 'athlete' : 'athletes'}
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
                <p className="text-base font-semibold mt-1 break-words">{getMetricsList()}</p>
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
                  <TableHead>Team Average</TableHead>
                  {benchmarkColumns.map((benchmarkName) => (
                    <TableHead key={benchmarkName}>{benchmarkName}</TableHead>
                  ))}
                  <TableHead>Top Performer</TableHead>
                  <TableHead>Range</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamStatistics.map((stat: TeamStatistic) => {
                  // Create a map of benchmark values for this metric
                  const benchmarkMap = new Map<string, number>();
                  if (stat.benchmarks && Array.isArray(stat.benchmarks)) {
                    stat.benchmarks.forEach((benchmark) => {
                      benchmarkMap.set(benchmark.name, benchmark.value);
                    });
                  }

                  return (
                    <TableRow key={stat.metric}>
                      <TableCell className="font-medium">{metricLabels?.[stat.metric] || stat.metric}</TableCell>
                      <TableCell>
                        {stat.average !== null && stat.average !== undefined
                          ? (isFly10Metric(stat.metric)
                              ? formatFly10Dual(stat.average)
                              : `${stat.average.toFixed(2)} ${stat.units || ''}`)
                          : "N/A"}
                      </TableCell>
                      {benchmarkColumns.map((benchmarkName) => (
                        <TableCell key={benchmarkName}>
                          {benchmarkMap.has(benchmarkName)
                            ? `${benchmarkMap.get(benchmarkName)!.toFixed(2)} ${stat.units || ''}`
                            : "-"}
                        </TableCell>
                      ))}
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
        const achievements = calculateBenchmarkAchievements();
        return achievements.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Benchmark Achievement Summary</CardTitle>
              <CardDescription>
                Number of athletes meeting each benchmark (athletes may meet multiple benchmarks)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {achievements.map((achievement) => (
                  <div key={achievement.tier} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {achievement.count} athlete{achievement.count !== 1 ? 's' : ''} met{' '}
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

      {/* Athlete Rankings - Only show if composite index is enabled */}
      {Array.isArray(athleteRankings) && athleteRankings.length > 0 && athleteRankings.some((a: any) => a.compositeIndex !== undefined) && (
        <Card>
          <CardHeader>
            <CardTitle>Composite Index Rankings</CardTitle>
            <CardDescription>{getCompositeIndexDescription()}</CardDescription>
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
                  <CardTitle>{metricLabels?.[stat.metric] || getMetricDisplayName(stat.metric)}</CardTitle>
                  <CardDescription>
                    Team Average: {stat.average !== null ? `${stat.average.toFixed(2)} ${stat.units || ''}` : 'N/A'}
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

                        // Calculate deviation from average
                        const deviation = value !== undefined && stat.average !== null
                          ? value - stat.average
                          : null;
                        const percentDiff = deviation !== null && stat.average !== null && stat.average !== 0
                          ? (deviation / Math.abs(stat.average)) * 100
                          : null;

                        // Calculate Z-score
                        const zScore = value !== undefined && stat.average !== null && stat.standardDeviation !== null && stat.standardDeviation > 0
                          ? (value - stat.average) / stat.standardDeviation
                          : null;

                        // Get benchmark label for this athlete and metric
                        const benchmarkLabel = getBenchmarkLabel(athlete, stat.metric);

                        // Determine if lower is better for this metric
                        const lowerIsBetter = isLowerBetter(stat.metric);

                        // Color for deviation (green if better, red if worse)
                        const deviationColor = deviation === null ? '' :
                          (lowerIsBetter ? (deviation < 0 ? 'text-green-600' : 'text-red-600') :
                           (deviation > 0 ? 'text-green-600' : 'text-red-600'));

                        // Color for z-score (same logic as deviation)
                        const zScoreColor = zScore === null ? '' :
                          (lowerIsBetter ? (zScore < 0 ? 'text-green-600' : 'text-red-600') :
                           (zScore > 0 ? 'text-green-600' : 'text-red-600'));

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
                                {benchmarkLabel && (
                                  <Badge variant="secondary" className="text-xs font-normal">
                                    {benchmarkLabel}
                                  </Badge>
                                )}
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

      {showShareDialog && (
        <ShareReportDialog
          reportId={report.id}
          open={showShareDialog}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </div>
  );
}
