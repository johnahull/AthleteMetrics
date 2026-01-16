import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { FileDown, Share2, Send } from "lucide-react";
import { ShareReportDialog } from "./ShareReportDialog";
import { SendReportToAthleteDialog } from "./SendReportToAthleteDialog";
import { CoachingInsightsCard } from "./CoachingInsightsCard";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { isFly10Metric, formatFly10Dual } from "@/utils/fly10-conversion";
import type { Report } from "@/types/report-types";

interface IndividualReportViewProps {
  report: Report;
}

export function IndividualReportView({ report }: IndividualReportViewProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const generateReport = useGenerateReport(report.id);
  const [reportData, setReportData] = useState<any>(null);
  const { user } = useAuth();

  // Determine if AI is enabled for this organization
  const { data: organization } = useQuery<{ aiEnabled?: boolean; aiEnabledBySiteAdmin?: boolean }>({
    queryKey: ['organizations', report.organizationId, 'details'],
    enabled: !!report.organizationId,
  });

  const aiEnabled = organization?.aiEnabled && organization?.aiEnabledBySiteAdmin;

  // Extract athleteId outside useEffect to avoid dependency issues
  // Type guard to ensure we're accessing IndividualReportConfig properties
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
      // Extract athleteId (try singular first, then array)
      const config = report.config as { athleteId?: string; athleteIds?: string[] };
      const athleteId = config?.athleteId || config?.athleteIds?.[0];

      if (!athleteId) {
        console.error('[IndividualReportView] No athleteId found for PDF download');
        return;
      }

      // PDF endpoint uses GET with query parameter, not POST
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
            <p className="text-muted-foreground">Generating report...</p>
            {generateReport.isPending && (
              <p className="text-xs text-muted-foreground">Status: Pending</p>
            )}
            {!reportData && !generateReport.isPending && (
              <p className="text-xs text-muted-foreground">Status: Waiting for data</p>
            )}
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
          <p className="text-sm text-muted-foreground text-center mt-2">
            Error: {generateReport.error?.message || 'Unknown error'}
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
                      Sport{athlete.sports.length > 1 ? 's' : ''}: {athlete.sports.join(', ')}
                    </p>
                  )}
                  {athlete.teams && athlete.teams.length > 0 && (
                    <p className="text-muted-foreground">
                      Team{athlete.teams.length > 1 ? 's' : ''}: {athlete.teams.join(', ')}
                    </p>
                  )}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Generated on {format(new Date(reportData.generatedAt), "PPP")}
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
              <Button variant="outline" onClick={() => setShowSendDialog(true)}>
                <Send className="h-4 w-4 mr-2" />
                Send to Athlete
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Coaching Insights */}
      <CoachingInsightsCard
        reportId={report.id}
        initialInsights={report.coachingInsights}
        generatedAt={report.coachingInsightsGeneratedAt}
        model={report.coachingInsightsModel}
        aiEnabled={aiEnabled || false}
      />

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
                  const unit = metricUnits?.[metricCode] || '';

                  return (
                    <TableRow key={metricCode}>
                      <TableCell className="font-medium">{metricLabel}</TableCell>
                      <TableCell>
                        {typeof value === 'number'
                          ? (isFly10Metric(metricCode)
                              ? formatFly10Dual(value)
                              : `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`)
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {teamAverage !== undefined
                          ? (isFly10Metric(metricCode)
                              ? formatFly10Dual(teamAverage)
                              : `${teamAverage.toFixed(2)}${unit ? ` ${unit}` : ''}`)
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
                                  : `${b.benchmarkValue.toFixed(2)}${unit ? ` ${unit}` : ''}`}
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


      {showShareDialog && (
        <ShareReportDialog
          reportId={report.id}
          open={showShareDialog}
          onClose={() => setShowShareDialog(false)}
        />
      )}

      {athleteId && athlete && (
        <SendReportToAthleteDialog
          open={showSendDialog}
          onOpenChange={setShowSendDialog}
          reportId={report.id}
          reportName={report.name}
          athleteId={athleteId}
          athleteName={athlete.userName || 'Athlete'}
          athleteEmail={athlete.email}
        />
      )}
    </div>
  );
}
