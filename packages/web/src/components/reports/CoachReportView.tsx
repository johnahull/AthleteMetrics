import { useState, useEffect } from "react";
import { useGenerateReport } from "@/hooks/use-reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { FileDown, Share2 } from "lucide-react";
import { ShareReportDialog } from "./ShareReportDialog";
import { format } from "date-fns";
import type { Report, CoachReportData, TeamStatistic, AthleteRanking } from "@/types/report-types";

interface CoachReportViewProps {
  report: Report;
}

export function CoachReportView({ report }: CoachReportViewProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const generateReport = useGenerateReport(report.id);
  const [reportData, setReportData] = useState<CoachReportData | null>(null);

  useEffect(() => {
    // Generate report data on mount
    // Coach reports don't need athleteId - pass empty object
    generateReport.mutate({}, {
      onSuccess: (response) => {
        console.log('[CoachReportView] Report generated successfully:', response);
        // Extract the actual report data from the response
        if (response && typeof response === 'object' && 'data' in response) {
          setReportData(response.data as CoachReportData);
        } else {
          setReportData(response as CoachReportData);
        }
      },
    });
  }, [report.id]);

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`/api/reports/${report.id}/pdf`, {
        method: "POST",
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
    console.error('[CoachReportView] Report generation failed:', generateReport.error);

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

  const { teamStatistics, athleteRankings, generatedAt } = reportData;

  console.log('[CoachReportView] Rendering with data:', {
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

  // Helper function: Determine if lower values are better for a metric
  const isLowerBetter = (metricCode: string): boolean => {
    const lowerBetterMetrics = ['FLY10_TIME', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD'];
    return lowerBetterMetrics.some(metric => metricCode.includes(metric));
  };

  // Helper function: Sort athletes by metric performance (best to worst)
  const sortAthletesByMetric = (athletes: AthleteRanking[], metricCode: string): AthleteRanking[] => {
    if (!Array.isArray(athletes)) return [];
    const lowerIsBetter = isLowerBetter(metricCode);
    return [...athletes]
      .filter(athlete => athlete?.measurements?.[metricCode] !== undefined)
      .sort((a, b) => {
        const aVal = a.measurements[metricCode];
        const bVal = b.measurements[metricCode];

        // Defensive check (should not be needed due to filter, but safe)
        if (aVal === undefined || bVal === undefined) return 0;

        return lowerIsBetter ? aVal - bVal : bVal - aVal;
      });
  };

  // Helper function: Get performance color class based on percentile
  const getPerformanceColor = (percentile: number | undefined): string => {
    if (percentile === undefined) return 'text-muted-foreground';
    if (percentile >= 75) return 'text-green-600';
    if (percentile >= 50) return 'text-yellow-600';
    if (percentile >= 25) return 'text-orange-600';
    return 'text-red-600';
  };

  // Helper function: Get benchmark comparison label for an athlete
  const getBenchmarkLabel = (athlete: AthleteRanking, metricCode: string): string | null => {
    const comparisons = athlete.benchmarkComparisons?.[metricCode];
    if (!comparisons || comparisons.length === 0) return null;

    // Find the highest tier benchmark the athlete meets or exceeds
    const lowerIsBetter = isLowerBetter(metricCode);
    const sortedComparisons = [...comparisons].sort((a, b) => {
      // Sort by benchmark value (higher tier benchmarks are more stringent)
      return lowerIsBetter ? a.benchmarkValue - b.benchmarkValue : b.benchmarkValue - a.benchmarkValue;
    });

    for (const comparison of sortedComparisons) {
      if (comparison.meetsOrExceeds) {
        return comparison.benchmarkName;
      }
    }

    return null;
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
              <Button variant="outline" onClick={handleDownloadPDF}>
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button variant="outline" onClick={() => setShowShareDialog(true)}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

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
                      <TableCell className="font-medium">{stat.metric}</TableCell>
                      <TableCell>
                        {stat.average !== null && stat.average !== undefined
                          ? `${stat.average.toFixed(2)} ${stat.units || ''}`
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
                                ? `${stat.topPerformer.value.toFixed(2)} ${stat.units || ''}`
                                : "N/A"}
                            </div>
                          </div>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        {stat.min !== null && stat.min !== undefined && stat.max !== null && stat.max !== undefined
                          ? `${stat.min.toFixed(2)} - ${stat.max.toFixed(2)} ${stat.units || ''}`
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

      {/* Athlete Rankings - Only show if composite index is enabled */}
      {Array.isArray(athleteRankings) && athleteRankings.length > 0 && athleteRankings.some((a: any) => a.compositeIndex !== undefined) && (
        <Card>
          <CardHeader>
            <CardTitle>Composite Index Rankings</CardTitle>
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
                  <CardTitle>{stat.metric}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Rank</TableHead>
                        <TableHead>Athlete</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Percentile</TableHead>
                        <TableHead>Benchmark</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAthletes.map((athlete: AthleteRanking, idx: number) => {
                        const value = athlete.measurements[stat.metric];
                        const percentile = athlete.percentiles?.[stat.metric];
                        const benchmarkLabel = getBenchmarkLabel(athlete, stat.metric);
                        const percentileColor = getPerformanceColor(percentile);

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
                            <TableCell className="font-medium">{athlete.userName}</TableCell>
                            <TableCell>
                              {value !== null && value !== undefined
                                ? `${value.toFixed(2)} ${stat.units || ''}`
                                : "N/A"}
                            </TableCell>
                            <TableCell>
                              {percentile !== undefined ? (
                                <span className={`font-semibold ${percentileColor}`}>
                                  {percentile.toFixed(0)}th
                                </span>
                              ) : (
                                "N/A"
                              )}
                            </TableCell>
                            <TableCell>
                              {benchmarkLabel ? (
                                <Badge variant="outline" className="bg-blue-50">
                                  {benchmarkLabel}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
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
