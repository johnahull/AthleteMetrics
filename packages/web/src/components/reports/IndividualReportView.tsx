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
import { TierBadge } from "@/components/benchmarks/TierBadge";
import { FileDown, Share2, Send } from "lucide-react";
import { LlmExportButton } from "@/components/athletes/LlmExportButton";
import { useAuth } from "@/lib/auth";
import { ShareReportDialog } from "./ShareReportDialog";
import { SendReportToAthleteDialog } from "./SendReportToAthleteDialog";
import { CoachingInsightsCard } from "./CoachingInsightsCard";
import { MetricExplanation } from "./MetricExplanation";
import { ReportMetricsGlossary } from "./ReportMetricsGlossary";
import { TrendSection } from "@/components/reports/TrendSection";
import { PercentileRadarSection } from "@/components/reports/PercentileRadarSection";
import { DistributionSection } from "@/components/reports/DistributionSection";
import { resolveChartSelection } from "@shared/report-charts";
import { TierProgressChart } from "@/components/charts/TierProgressChart";
import { BenchmarkStandingBar } from "@/components/charts/BenchmarkStandingBar";
import { format } from "date-fns";
import { isFly10Metric, formatFly10Dual } from "@/utils/fly10-conversion";
import { extractAthleteId } from "./report-utils";
import type { Report } from "@/types/report-types";

interface IndividualReportViewProps {
  report: Report;
}

export function IndividualReportView({ report }: IndividualReportViewProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const generateReport = useGenerateReport(report.id);
  const [reportData, setReportData] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // LLM export is a coaching tool — athletes don't see the button even on their own report.
  const canExportForLlm =
    !!user && (user.isSiteAdmin || user.role === "coach" || user.role === "org_admin");

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

  const { athlete, metricLabels, metricUnits, metricExplanations, trends, distributions } = reportData;
  const measurementCodes = athlete?.measurements ? Object.keys(athlete.measurements) : [];
  const sel = resolveChartSelection(reportData.reportConfig);

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
            <div className="flex gap-2 flex-wrap">
              {canExportForLlm && athleteId && (
                <LlmExportButton
                  athleteId={athleteId}
                  // The `AthletePerformance` DTO's `userName` is mapped from
                  // the underlying user's `fullName` in report-service.ts:549
                  // — it is the athlete's display name, not a login handle,
                  // despite the field name suggesting otherwise.
                  athleteName={athlete?.userName}
                />
              )}
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
                  const metricLabel = metricLabels?.[metricCode] || metricCode;
                  const unit = metricUnits?.[metricCode] || '';

                  return (
                    <TableRow key={metricCode}>
                      <TableCell className="font-medium align-top">
                        <MetricExplanation
                          label={metricLabel}
                          explanation={metricExplanations?.[metricCode]}
                        />
                      </TableCell>
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
                          <div className="space-y-2">
                            {benchmarks.map((b: any, idx: number) => (
                              <div key={idx}>
                                {b.tierName ? (
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{b.tierGroupName || b.benchmarkName}:</span>
                                      <TierBadge
                                        tierName={b.tierName}
                                        tierColor={b.tierColor || 'gray'}
                                        tierOrder={b.tierOrder}
                                        nextTierName={b.nextTierName}
                                        distanceToNextTier={b.distanceToNextTier}
                                        unit={unit}
                                        showProgress={true}
                                      />
                                    </div>
                                    {b.coachingNote && (
                                      <p className="mt-1 text-xs italic text-muted-foreground">
                                        {b.coachingNote}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-sm">
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
                                )}
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

      {sel.radar && athlete?.percentiles && Object.keys(athlete.percentiles).length >= 3 && (
        <PercentileRadarSection
          athleteId={athlete.userId}
          athleteName={athlete.userName}
          percentiles={athlete.percentiles}
          measurements={athlete.measurements}
        />
      )}

      {sel.benchmarkStanding && athlete?.benchmarkComparisons &&
        Object.values(athlete.benchmarkComparisons).some((cs: any) =>
          cs && cs.length > 0
        ) && (
        <Card>
          <CardHeader><CardTitle>Benchmark Standing</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(athlete.benchmarkComparisons).map(([code, comps]: [string, any]) => {
              const list = comps || [];
              const tiered = list.find((c: any) => c.allTiers && c.allTiers.length > 0);
              if (tiered) {
                return (
                  <TierProgressChart
                    key={code}
                    label={metricLabels?.[code] || code}
                    metricCode={code}
                    comparison={tiered}
                    unit={metricUnits?.[code]}
                  />
                );
              }
              return list.map((c: any, i: number) => (
                <BenchmarkStandingBar
                  key={`${code}-${i}`}
                  label={metricLabels?.[code] || code}
                  metricCode={code}
                  comparison={c}
                  unit={metricUnits?.[code]}
                />
              ));
            })}
          </CardContent>
        </Card>
      )}

      {sel.trends && trends && Object.keys(trends).length > 0 && (
        <TrendSection trends={trends} metricLabels={metricLabels} metricUnits={metricUnits} />
      )}

      {sel.distribution && distributions && Object.keys(distributions).length > 0 && (
        <DistributionSection
          athleteName={athlete.userName}
          distributions={distributions}
          metricLabels={metricLabels}
          metricUnits={metricUnits}
          percentiles={athlete.percentiles}
          comparisonLabel={reportData.comparisonLabel}
        />
      )}

      {metricExplanations && (
        <ReportMetricsGlossary
          explanations={metricExplanations}
          metricOrder={measurementCodes}
        />
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
