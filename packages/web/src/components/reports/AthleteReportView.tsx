/**
 * AthleteReportView - Read-only report view for athletes
 *
 * This component displays reports shared with athletes, showing all report data
 * but EXCLUDING coach-only actions:
 * - NO Share button
 * - NO Send to Athlete button
 * - NO Generate/Edit/Regenerate Coaching Insights buttons
 *
 * Athletes CAN:
 * - View coach message (if provided)
 * - Export PDF
 * - View report data, metrics, and benchmarks
 * - View existing coaching insights (read-only)
 */

import { useState, useEffect, useCallback } from "react";
import { useGenerateReport } from "@/hooks/use-reports";
import { useReportPdf } from "@/hooks/use-report-pdf";
import { useToast } from "@/hooks/use-toast";
import { useMetricLabels } from "@/hooks/use-metric-labels";
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
import { FileDown, Sparkles, Users, Calendar, TrendingUp, Activity, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { isFly10Metric, formatFly10Dual } from "@/utils/fly10-conversion";
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from "@/lib/report-utils";
import {
  getPerformanceColor,
  getQuartileBadge,
  formatDateRange,
  getTeamNames,
  getMetricsList,
  getCompositeIndexDescription,
  calculateBenchmarkAchievements,
  extractAthleteId,
  calculateDeviationStats,
} from "./report-utils";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { useTeams } from "@/hooks/use-teams";
import type { Report, TeamReportData, TeamStatistic, AthleteRanking, PdfFormat, IndividualReportData, BenchmarkComparison } from "@/types/report-types";

interface AthleteReportViewProps {
  report: Report;
}

export function AthleteReportView({ report }: AthleteReportViewProps) {
  // Render appropriate view based on report type
  if (report.reportType === "team") {
    return <AthleteTeamReportView report={report} />;
  }
  return <AthleteIndividualReportView report={report} />;
}

// ============================================================================
// Individual Report View (Read-Only)
// ============================================================================

function AthleteIndividualReportView({ report }: { report: Report }) {
  const generateReport = useGenerateReport(report.id);
  // Note: useGenerateReport returns GeneratedReport with data: any
  // The actual athlete data structure is inside the response
  const [reportData, setReportData] = useState<IndividualReportData | null>(null);
  const { toast } = useToast();

  // Extract athleteId using shared utility
  const athleteId = extractAthleteId(report.config as { athleteId?: string; athleteIds?: string[] });

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
    if (!athleteId) {
      return;
    }

    generateReport.mutate({ athleteId }, {
      onSuccess: (data) => {
        // Cast the response data to our expected structure
        setReportData(data as unknown as IndividualReportData);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, athleteId]);

  const handleDownloadPDF = () => {
    if (athleteId) {
      downloadPdf({ athleteId });
    }
  };

  if (generateReport.isPending || !reportData) {
    return <ReportLoadingState message="Loading report..." />;
  }

  if (generateReport.isError) {
    return (
      <ReportErrorState
        message="Failed to load report. Please try again."
        errorDetails={generateReport.error?.message || "Unknown error"}
      />
    );
  }

  const { athlete, metricLabels, metricUnits } = reportData;
  // Backstop label resolution with the org's currently-active metric labels —
  // see the matching block in AthleteTeamReportView below for rationale.
  const { getLabel } = useMetricLabels();
  const resolveLabel = (code: string) => metricLabels?.[code] ?? getLabel(code);

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
              {athlete && (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold">
                    {athlete.userName}
                  </h3>
                  {athlete.age && (
                    <p className="text-muted-foreground">Age: {athlete.age}</p>
                  )}
                  {athlete.gender && (
                    <p className="text-muted-foreground">Gender: {athlete.gender}</p>
                  )}
                  {athlete.sports && athlete.sports.length > 0 && (
                    <p className="text-muted-foreground">
                      Sport{athlete.sports.length > 1 ? "s" : ""}: {athlete.sports.join(", ")}
                    </p>
                  )}
                  {athlete.teams && athlete.teams.length > 0 && (
                    <p className="text-muted-foreground">
                      Team{athlete.teams.length > 1 ? "s" : ""}: {athlete.teams.join(", ")}
                    </p>
                  )}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Generated on {format(new Date(reportData.generatedAt), "PPP")}
              </p>
            </div>
            {/* Only Export PDF button - NO Share or Send to Athlete */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDownloadPDF} disabled={isPdfDownloading}>
                <FileDown className="h-4 w-4 mr-2" />
                {isPdfDownloading ? "Downloading..." : "Export PDF"}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Read-Only Coaching Insights (if they exist) */}
      {report.coachingInsights && (
        <ReadOnlyCoachingInsights
          insights={report.coachingInsights}
          generatedAt={report.coachingInsightsGeneratedAt}
          model={report.coachingInsightsModel}
        />
      )}

      {/* Performance Table */}
      {athlete.measurements && Object.keys(athlete.measurements).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Best Result</TableHead>
                  <TableHead>Group Average</TableHead>
                  <TableHead>Percentile</TableHead>
                  <TableHead>Benchmark Comparisons</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(athlete.measurements).map(([metricCode, value]) => {
                  const percentile = athlete.percentiles[metricCode];
                  const teamAverage = athlete.teamAverages?.[metricCode];
                  const benchmarks = athlete.benchmarkComparisons[metricCode] || [];
                  const metricLabel = resolveLabel(metricCode);
                  const unit = metricUnits?.[metricCode] || "";

                  return (
                    <TableRow key={metricCode}>
                      <TableCell className="font-medium">{metricLabel}</TableCell>
                      <TableCell>
                        {typeof value === "number"
                          ? (isFly10Metric(metricCode)
                              ? formatFly10Dual(value)
                              : `${value.toFixed(2)}${unit ? ` ${unit}` : ""}`)
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {teamAverage !== undefined
                          ? (isFly10Metric(metricCode)
                              ? formatFly10Dual(teamAverage)
                              : `${teamAverage.toFixed(2)}${unit ? ` ${unit}` : ""}`)
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {percentile !== undefined ? (
                          <Badge>{percentile.toFixed(1)}th percentile</Badge>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        {benchmarks.length > 0 ? (
                          <div className="space-y-1">
                            {benchmarks.map((b: BenchmarkComparison, idx: number) => (
                              <div key={idx} className="text-sm">
                                <span className="font-medium">{b.benchmarkName}:</span>{" "}
                                {isFly10Metric(metricCode)
                                  ? formatFly10Dual(b.benchmarkValue)
                                  : `${b.benchmarkValue.toFixed(2)}${unit ? ` ${unit}` : ""}`}
                                <Badge
                                  variant={b.meetsOrExceeds ? "default" : "secondary"}
                                  className="ml-2"
                                >
                                  {b.meetsOrExceeds ? "✓ Meets" : "✗ Below"}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Team Report View (Read-Only)
// ============================================================================

function AthleteTeamReportView({ report }: { report: Report }) {
  const labels = useContextualLabels();
  const generateReport = useGenerateReport(report.id);
  const [reportData, setReportData] = useState<TeamReportData | null>(null);
  const { toast } = useToast();

  // Fetch teams for team name display
  const { data: teams } = useTeams({ organizationId: report.organizationId });

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
    generateReport.mutate({}, {
      onSuccess: (response) => {
        if (response && typeof response === "object" && "data" in response) {
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

  if (generateReport.isPending || !reportData) {
    return <ReportLoadingState message="Loading report..." />;
  }

  if (generateReport.isError) {
    return (
      <ReportErrorState
        message="Failed to load report. Please try again."
        onRetry={() => generateReport.mutate({})}
      />
    );
  }

  const { teamStatistics, athleteRankings, generatedAt, metricLabels, metricUnits } = reportData;
  // Backstop label resolution with the org's currently-active metric labels in
  // case the report payload omits a code (e.g. custom org metric added after
  // the report ran but before it rendered).
  const { getLabel } = useMetricLabels();
  const resolveLabel = (code: string) => metricLabels?.[code] ?? getLabel(code);

  // Collect all unique benchmark names
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
            {/* Only Export PDF - NO Share button */}
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
                  <DropdownMenuItem onClick={() => handleDownloadPDF("visual")}>
                    <span className="font-medium">Visual (Match UI)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownloadPDF("simplified")}>
                    <span className="font-medium">Simplified (Print-Friendly)</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{labels.teams}</p>
                <p className="text-base font-semibold mt-1 break-words">{getTeamNames(report.config as { filters?: { teamIds?: string[] } }, teams, labels.teams)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Testing Period</p>
                <p className="text-base font-semibold mt-1">{formatDateRange(report.config.timeframe)}</p>
              </div>
            </div>

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

      {/* Read-Only Coaching Insights (if they exist) */}
      {report.coachingInsights && (
        <ReadOnlyCoachingInsights
          insights={report.coachingInsights}
          generatedAt={report.coachingInsightsGeneratedAt}
          model={report.coachingInsightsModel}
        />
      )}

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
                  {benchmarkColumns.map((name) => (
                    <TableHead key={name}>{name}</TableHead>
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
                    stat.benchmarks.forEach((b) => benchmarkMap.set(b.name, {
                      value: b.value,
                      minValue: b.minValue,
                      maxValue: b.maxValue,
                      tierColor: b.tierColor,
                    }));
                  }

                  return (
                    <TableRow key={stat.metric}>
                      <TableCell className="font-medium">{resolveLabel(stat.metric)}</TableCell>
                      <TableCell>
                        {stat.average !== null && stat.average !== undefined
                          ? (isFly10Metric(stat.metric)
                              ? formatFly10Dual(stat.average)
                              : `${stat.average.toFixed(2)} ${stat.units || ""}`)
                          : "N/A"}
                      </TableCell>
                      {benchmarkColumns.map((name) => {
                        const benchmarkData = benchmarkMap.get(name);
                        if (!benchmarkData) {
                          return <TableCell key={name}>-</TableCell>;
                        }
                        // Range benchmark: display "min - max" with optional color
                        if (benchmarkData.minValue != null && benchmarkData.maxValue != null) {
                          return (
                            <TableCell key={name}>
                              <span style={benchmarkData.tierColor ? { color: benchmarkData.tierColor } : undefined}>
                                {`${benchmarkData.minValue.toFixed(2)} - ${benchmarkData.maxValue.toFixed(2)} ${stat.units || ""}`}
                              </span>
                            </TableCell>
                          );
                        }
                        // Single-value benchmark
                        if (benchmarkData.value != null) {
                          return (
                            <TableCell key={name}>
                              {`${benchmarkData.value.toFixed(2)} ${stat.units || ""}`}
                            </TableCell>
                          );
                        }
                        return <TableCell key={name}>-</TableCell>;
                      })}
                      <TableCell>
                        {stat.topPerformer ? (
                          <div>
                            <div className="font-medium">{stat.topPerformer.userName}</div>
                            <div className="text-sm text-muted-foreground">
                              {stat.topPerformer.value !== null && stat.topPerformer.value !== undefined
                                ? (isFly10Metric(stat.metric)
                                    ? formatFly10Dual(stat.topPerformer.value)
                                    : `${stat.topPerformer.value.toFixed(2)} ${stat.units || ""}`)
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
                              : `${stat.min.toFixed(2)} - ${stat.max.toFixed(2)} ${stat.units || ""}`)
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
                Number of {labels.athletes.toLowerCase()} meeting each benchmark
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {achievements.map((achievement) => (
                  <div key={achievement.tier} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {achievement.count} {achievement.count === 1 ? labels.athlete.toLowerCase() : labels.athletes.toLowerCase()} met{" "}
                        <Badge variant={achievement.tier === "No benchmark met" ? "outline" : "secondary"}>
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

      {/* Composite Index Rankings */}
      {Array.isArray(athleteRankings) && athleteRankings.length > 0 && athleteRankings.some((a) => a.compositeIndex !== undefined) && (
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
                    {labels.team} Average: {stat.average !== null ? `${stat.average.toFixed(2)} ${stat.units || ""}` : "N/A"}
                    {stat.standardDeviation !== null && ` | SD: ±${stat.standardDeviation.toFixed(2)} ${stat.units || ""}`}
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
                                    : `${value.toFixed(2)} ${stat.units || ""}`)
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
                                  {deviation > 0 ? "+" : ""}{deviation.toFixed(2)} {stat.units || ""}
                                  <span className="text-xs ml-1">
                                    ({percentDiff > 0 ? "+" : ""}{percentDiff.toFixed(1)}%)
                                  </span>
                                </span>
                              ) : (
                                "N/A"
                              )}
                            </TableCell>
                            <TableCell>
                              {zScore !== null ? (
                                <span className={`font-semibold ${zScoreColor}`}>
                                  {zScore > 0 ? "+" : ""}{zScore.toFixed(2)}σ
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
    </div>
  );
}

// ============================================================================
// Read-Only Coaching Insights Component
// ============================================================================

interface ReadOnlyCoachingInsightsProps {
  insights: string;
  generatedAt?: string | null;
  model?: string | null;
}

function ReadOnlyCoachingInsights({ insights, generatedAt, model }: ReadOnlyCoachingInsightsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Coaching Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{insights}</ReactMarkdown>
        </div>
        <div className="flex items-center gap-2 pt-4 border-t text-sm text-muted-foreground">
          <span>
            Generated on:{" "}
            {generatedAt
              ? new Date(generatedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
              : "Unknown"}
          </span>
          {model && (
            <>
              <span>•</span>
              <Badge variant="secondary">{model}</Badge>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
