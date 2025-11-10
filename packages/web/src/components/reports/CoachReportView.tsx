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

interface Report {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string;
  reportType: "coach" | "individual";
  config: any;
  isTemplate: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface CoachReportViewProps {
  report: Report;
}

export function CoachReportView({ report }: CoachReportViewProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const generateReport = useGenerateReport(report.id);
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    // Generate report data on mount
    // Coach reports don't need athleteId - pass empty object
    generateReport.mutate({}, {
      onSuccess: (data) => {
        console.log('[CoachReportView] Report generated successfully:', data);
        setReportData(data);
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
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-destructive text-center">
            Failed to generate report. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { teamStatistics, athleteRankings, generatedAt } = reportData;

  console.log('[CoachReportView] Rendering with data:', {
    teamStatistics,
    athleteRankings,
    teamStatsLength: teamStatistics?.length,
    athleteRankingsLength: athleteRankings?.length,
    generatedAt,
    fullReportData: reportData
  });

  // Collect all unique benchmark names across all metrics
  const allBenchmarkNames = new Set<string>();
  if (teamStatistics) {
    teamStatistics.forEach((stat: any) => {
      if (stat.benchmarks && Array.isArray(stat.benchmarks)) {
        stat.benchmarks.forEach((benchmark: any) => {
          allBenchmarkNames.add(benchmark.name);
        });
      }
    });
  }
  const benchmarkColumns = Array.from(allBenchmarkNames);

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
      {teamStatistics && teamStatistics.length > 0 && (
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
                {teamStatistics.map((stat: any) => {
                  // Create a map of benchmark values for this metric
                  const benchmarkMap = new Map<string, number>();
                  if (stat.benchmarks && Array.isArray(stat.benchmarks)) {
                    stat.benchmarks.forEach((benchmark: any) => {
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
      {athleteRankings && athleteRankings.length > 0 && athleteRankings.some((a: any) => a.compositeIndex !== undefined) && (
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
                {athleteRankings.map((athlete: any, idx: number) => (
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
