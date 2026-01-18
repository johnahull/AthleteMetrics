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

import { useState, useEffect } from "react";
import { useGenerateReport } from "@/hooks/use-reports";
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
import { FileDown, Sparkles, Users, Calendar, TrendingUp, Activity, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { isFly10Metric, formatFly10Dual } from "@/utils/fly10-conversion";
import { getMetricDisplayName } from "@/lib/metrics";
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from "@/lib/report-utils";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { useTeams } from "@/hooks/use-teams";
import type { Report, TeamReportData, TeamStatistic, AthleteRanking, PdfFormat } from "@/types/report-types";

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
  const [reportData, setReportData] = useState<any>(null);

  // Extract athleteId from config
  const config = report.config as { athleteId?: string; athleteIds?: string[] };
  const athleteId = config?.athleteId || config?.athleteIds?.[0];

  useEffect(() => {
    if (!athleteId) {
      return;
    }

    generateReport.mutate({ athleteId }, {
      onSuccess: (data) => {
        setReportData(data);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, athleteId]);

  const handleDownloadPDF = async () => {
    try {
      if (!athleteId) {
        console.error("[AthleteReportView] No athleteId found for PDF download");
        return;
      }

      const response = await fetch(`/api/reports/${report.id}/pdf?athleteId=${athleteId}`);

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
            <p className="text-muted-foreground">Loading report...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (generateReport.isError) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-destructive text-center">
            Failed to load report. Please try again.
          </p>
          <p className="text-sm text-muted-foreground text-center mt-2">
            Error: {generateReport.error?.message || "Unknown error"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { athlete, metricLabels, metricUnits } = reportData;

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
              <Button variant="outline" onClick={handleDownloadPDF}>
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
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
                  <TableHead>Team Average</TableHead>
                  <TableHead>Percentile</TableHead>
                  <TableHead>Benchmark Comparisons</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(athlete.measurements).map(([metricCode, value]) => {
                  const percentile = athlete.percentiles[metricCode];
                  const teamAverage = athlete.teamAverages?.[metricCode];
                  const benchmarks = athlete.benchmarkComparisons[metricCode] || [];
                  const metricLabel = metricLabels?.[metricCode] || metricCode;
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
                            {benchmarks.map((b: any, idx: number) => (
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

  // Fetch teams for team name display
  const { data: teams } = useTeams({ organizationId: report.organizationId });

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
            <p className="text-muted-foreground">Loading report...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (generateReport.isError) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-4">
            <p className="text-destructive text-center">
              Failed to load report. Please try again.
            </p>
            <Button onClick={() => generateReport.mutate({})} variant="outline">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { teamStatistics, athleteRankings, generatedAt, metricLabels, metricUnits } = reportData;

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

  // Helper functions
  const getPerformanceColor = (percentile: number | undefined): string => {
    if (percentile === undefined) return "text-muted-foreground";
    if (percentile >= 75) return "text-green-600";
    if (percentile >= 50) return "text-yellow-600";
    if (percentile >= 25) return "text-orange-600";
    return "text-red-600";
  };

  const getQuartileBadge = (percentile: number | undefined): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } | null => {
    if (percentile === undefined) return null;
    if (percentile >= 75) return { label: "Top 25%", variant: "default" };
    if (percentile >= 50) return { label: "Above Avg", variant: "secondary" };
    if (percentile >= 25) return { label: "Below Avg", variant: "outline" };
    return { label: "Bottom 25%", variant: "destructive" };
  };

  const formatDateRange = (): string => {
    const timeframe = report.config.timeframe;
    if (timeframe.type === "custom") {
      const start = timeframe.customStart ? format(new Date(timeframe.customStart), "MMM d, yyyy") : "";
      const end = timeframe.customEnd ? format(new Date(timeframe.customEnd), "MMM d, yyyy") : "";
      return `${start} - ${end}`;
    }
    switch (timeframe.preset) {
      case "season": return "Current Season";
      case "year": return "Past Year";
      case "all_time": return "All Time";
      default: return "All Time";
    }
  };

  const getTeamNames = (): string => {
    const config = report.config as { filters?: { teamIds?: string[] } };
    const teamIds = config.filters?.teamIds;
    if (!teamIds || teamIds.length === 0) {
      return `All ${labels.teams}`;
    }
    if (!teams || teams.length === 0) {
      return "Loading...";
    }
    const teamNames = teamIds
      .map((id: string) => teams.find(t => t.id === id)?.name)
      .filter(Boolean);
    return teamNames.length > 0 ? teamNames.join(", ") : `All ${labels.teams}`;
  };

  const getMetricsList = (): string => {
    if (!teamStatistics || teamStatistics.length === 0) {
      return "No metrics";
    }
    return teamStatistics
      .map(stat => metricLabels?.[stat.metric] || getMetricDisplayName(stat.metric))
      .join(", ");
  };

  const getCompositeIndexDescription = (): string => {
    const config = report.config as { compositeIndex?: { weights?: Record<string, number> } };
    const weights = config.compositeIndex?.weights;
    if (!weights || Object.keys(weights).length === 0) {
      return "Weighted average of percentiles";
    }
    const weightDescriptions = Object.entries(weights)
      .map(([metricCode, weight]) => {
        const metricName = metricLabels?.[metricCode] || getMetricDisplayName(metricCode);
        const percentage = ((weight as number) * 100).toFixed(0);
        return `${metricName} (${percentage}%)`;
      })
      .join(", ");
    return `Weighted average of percentiles: ${weightDescriptions}`;
  };

  const calculateBenchmarkAchievements = () => {
    if (!athleteRankings || athleteRankings.length === 0) return [];

    const allBenchmarks = new Set<string>();
    athleteRankings.forEach((athlete: AthleteRanking) => {
      if (athlete.benchmarkComparisons) {
        Object.values(athlete.benchmarkComparisons).forEach((comparisons) => {
          comparisons.forEach((comp) => allBenchmarks.add(comp.benchmarkName));
        });
      }
    });

    const benchmarkCounts: Record<string, number> = {};
    Array.from(allBenchmarks).forEach((name) => {
      benchmarkCounts[name] = 0;
    });

    const athletesWithBenchmarks = new Set<string>();
    athleteRankings.forEach((athlete: AthleteRanking) => {
      if (athlete.benchmarkComparisons) {
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

    const achievements = Array.from(allBenchmarks)
      .map((name) => ({
        tier: name,
        count: benchmarkCounts[name],
        percentage: (benchmarkCounts[name] / athleteRankings.length) * 100,
      }))
      .filter((a) => a.count > 0)
      .sort((a, b) => b.count - a.count);

    const noTierCount = athleteRankings.length - athletesWithBenchmarks.size;
    if (noTierCount > 0) {
      achievements.push({
        tier: "No benchmark met",
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
            {/* Only Export PDF - NO Share button */}
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
                <p className="text-base font-semibold mt-1 break-words">{getTeamNames()}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Testing Period</p>
                <p className="text-base font-semibold mt-1">{formatDateRange()}</p>
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
                <p className="text-base font-semibold mt-1 break-words">{getMetricsList()}</p>
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
                  const benchmarkMap = new Map<string, number>();
                  if (stat.benchmarks && Array.isArray(stat.benchmarks)) {
                    stat.benchmarks.forEach((b) => benchmarkMap.set(b.name, b.value));
                  }

                  return (
                    <TableRow key={stat.metric}>
                      <TableCell className="font-medium">{metricLabels?.[stat.metric] || stat.metric}</TableCell>
                      <TableCell>
                        {stat.average !== null && stat.average !== undefined
                          ? (isFly10Metric(stat.metric)
                              ? formatFly10Dual(stat.average)
                              : `${stat.average.toFixed(2)} ${stat.units || ""}`)
                          : "N/A"}
                      </TableCell>
                      {benchmarkColumns.map((name) => (
                        <TableCell key={name}>
                          {benchmarkMap.has(name)
                            ? `${benchmarkMap.get(name)!.toFixed(2)} ${stat.units || ""}`
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
        const achievements = calculateBenchmarkAchievements();
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

                        const deviation = value !== undefined && stat.average !== null
                          ? value - stat.average
                          : null;
                        const percentDiff = deviation !== null && stat.average !== null && stat.average !== 0
                          ? (deviation / Math.abs(stat.average)) * 100
                          : null;

                        const zScore = value !== undefined && stat.average !== null && stat.standardDeviation !== null && stat.standardDeviation > 0
                          ? (value - stat.average) / stat.standardDeviation
                          : null;

                        const benchmarkLabel = getBenchmarkLabel(athlete, stat.metric);
                        const lowerIsBetter = isLowerBetter(stat.metric);

                        const deviationColor = deviation === null ? "" :
                          (lowerIsBetter ? (deviation < 0 ? "text-green-600" : "text-red-600") :
                            (deviation > 0 ? "text-green-600" : "text-red-600"));

                        const zScoreColor = zScore === null ? "" :
                          (lowerIsBetter ? (zScore < 0 ? "text-green-600" : "text-red-600") :
                            (zScore > 0 ? "text-green-600" : "text-red-600"));

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
