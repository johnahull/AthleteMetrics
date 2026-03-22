import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGenerateReport } from "@/hooks/use-reports";
import { useReportPdf } from "@/hooks/use-report-pdf";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { FileDown, Share2, Send, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ShareReportDialog } from "./ShareReportDialog";
import { SendReportToAthleteDialog } from "./SendReportToAthleteDialog";
import { CoachingInsightsCard } from "./CoachingInsightsCard";
import { format } from "date-fns";
import { isFly10Metric, formatFly10Dual } from "@/utils/fly10-conversion";
import { extractAthleteId } from "./report-utils";
import type { Report, ProgressComparisonEntry, TrendDataPoint } from "@/types/report-types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface IndividualReportViewProps {
  report: Report;
}

export function IndividualReportView({ report }: IndividualReportViewProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const generateReport = useGenerateReport(report.id);
  const [reportData, setReportData] = useState<any>(null);
  const { toast } = useToast();

  // Determine if AI is enabled for this organization
  const { data: organization } = useQuery<{ aiEnabled?: boolean; aiEnabledBySiteAdmin?: boolean }>({
    queryKey: ['organizations', report.organizationId, 'details'],
    enabled: !!report.organizationId,
  });

  const aiEnabled = organization?.aiEnabled && organization?.aiEnabledBySiteAdmin;

  // Extract athleteId from config using shared utility
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
        setReportData(data);
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
    const status = generateReport.isPending
      ? "Pending"
      : "Waiting for data";
    return <ReportLoadingState message="Generating report..." status={status} />;
  }

  if (generateReport.isError) {
    return (
      <ReportErrorState
        message="Failed to generate report. Please try again."
        errorDetails={generateReport.error?.message || 'Unknown error'}
      />
    );
  }

  const { athlete, metricLabels, metricUnits, trendData } = reportData;
  const hasProgressComparison = athlete.progressComparison && Object.keys(athlete.progressComparison).length > 0;

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
              <Button variant="outline" onClick={handleDownloadPDF} disabled={isPdfDownloading}>
                <FileDown className="h-4 w-4 mr-2" />
                {isPdfDownloading ? "Downloading..." : "Export PDF"}
              </Button>
              <Button variant="outline" onClick={() => setShowShareDialog(true)}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" onClick={() => setShowSendDialog(true)} data-testid="send-to-athlete-button">
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
                  {hasProgressComparison && <TableHead>Progress</TableHead>}
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
                  const progress = athlete.progressComparison?.[metricCode];

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
                      {hasProgressComparison && (
                        <TableCell>
                          {progress ? (
                            <div className="flex items-center gap-1">
                              {progress.direction === 'improved' ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : progress.direction === 'declined' ? (
                                <TrendingDown className="h-4 w-4 text-red-600" />
                              ) : (
                                <Minus className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className={
                                progress.direction === 'improved' ? 'text-green-600 text-sm' :
                                progress.direction === 'declined' ? 'text-red-600 text-sm' :
                                'text-muted-foreground text-sm'
                              }>
                                {progress.absoluteChange > 0 ? '+' : ''}{progress.absoluteChange.toFixed(2)}
                                {' '}({progress.percentageChange.toFixed(1)}%)
                              </span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      )}
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


      {/* Trend Charts */}
      {trendData && Object.keys(trendData).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(trendData).map(([metricCode, points]) => {
                const pointsArr = points as TrendDataPoint[];
                if (pointsArr.length < 2) return null;
                const metricLabel = metricLabels?.[metricCode] || metricCode;
                const unit = metricUnits?.[metricCode] || '';

                const chartData = pointsArr.map((p) => ({
                  date: format(new Date(p.date), "MMM d"),
                  value: p.value,
                  eventName: p.eventName,
                }));

                return (
                  <div key={metricCode}>
                    <h4 className="text-sm font-medium mb-2">{metricLabel} {unit ? `(${unit})` : ''}</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                        <Tooltip
                          formatter={(value: any) => [`${Number(value).toFixed(2)} ${unit}`, metricLabel]}
                          labelFormatter={(label: any, payload: any) => {
                            const entry = payload?.[0]?.payload;
                            return entry?.eventName ? `${label} — ${entry.eventName}` : String(label);
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ r: 4, fill: "hsl(var(--primary))" }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
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
