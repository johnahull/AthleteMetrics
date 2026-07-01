import { useState } from "react";
import { useRoute } from "wouter";
import { usePublicReport } from "@/hooks/use-reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/benchmarks/TierBadge";
import { isFly10Metric, formatFly10Dual } from "@/utils/fly10-conversion";
import { format } from "date-fns";
import { captureTrendCharts } from "@/lib/chartExport";
import { Lock } from "lucide-react";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { useToast } from "@/hooks/use-toast";
import { MetricExplanation } from "@/components/reports/MetricExplanation";
import { ReportMetricsGlossary } from "@/components/reports/ReportMetricsGlossary";
import { TrendSection } from "@/components/reports/TrendSection";
import { PercentileRadarSection } from "@/components/reports/PercentileRadarSection";
import { DistributionSection } from "@/components/reports/DistributionSection";
import { resolveChartSelection } from "@shared/report-charts";
import { TierProgressChart } from "@/components/charts/TierProgressChart";
import { BenchmarkStandingBar } from "@/components/charts/BenchmarkStandingBar";
import type { MetricExplanation as MetricExplanationData } from "@shared/metric-explanations";
import type { ReportTrends } from "@shared/report-trends-types";

export default function PublicReport() {
  const labels = useContextualLabels();
  const { toast } = useToast();
  const [, params] = useRoute("/public/reports/:token");
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const token = params?.token || "";

  const { data: snapshot, isLoading, error } = usePublicReport(token);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This report link is invalid, expired, or has been revoked.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { snapshotData } = snapshot;
  const { generatedAt } = snapshotData;
  // `reportType` is a TOP-LEVEL field on the stored snapshot (the verbatim return
  // of generateTeamReport / generateIndividualReport). It is NOT on reportConfig.
  const reportType = snapshotData.reportType as 'team' | 'individual' | undefined;
  const metricExplanations = (snapshotData.metricExplanations ?? {}) as Record<string, MetricExplanationData>;
  const metricLabels = (snapshotData.metricLabels ?? {}) as Record<string, string>;
  const metricUnits = (snapshotData.metricUnits ?? {}) as Record<string, string>;
  const trends = snapshotData.trends as ReportTrends | undefined;
  const sel = resolveChartSelection(snapshotData.reportConfig);

  // Real produced shapes (mirror IndividualReportView / TeamReportView).
  const athlete = snapshotData.athlete as any;
  const teamStatistics = (snapshotData.teamStatistics ?? []) as any[];
  const athleteRankings = (snapshotData.athleteRankings ?? []) as any[];

  // Glossary order recomputed from the real data (was previously read from a
  // stale `dataSnapshot` shape that the producer no longer emits).
  const glossaryOrder =
    reportType === 'individual'
      ? Object.keys(athlete?.measurements ?? {})
      : teamStatistics.map((s) => s.metric);

  // Team: collect all unique benchmark names across metrics (mirrors TeamReportView).
  const allBenchmarkNames = new Set<string>();
  teamStatistics.forEach((stat) => {
    if (Array.isArray(stat.benchmarks)) {
      stat.benchmarks.forEach((b: any) => allBenchmarkNames.add(b.name));
    }
  });
  const benchmarkColumns = Array.from(allBenchmarkNames);

  const hasComposite =
    Array.isArray(athleteRankings) &&
    athleteRankings.some((a) => a?.compositeIndex !== undefined);

  async function handleDownloadPdf() {
    if (isPdfDownloading) return;
    setIsPdfDownloading(true);
    try {
      const chartImages = await captureTrendCharts();
      const res = await fetch(`/api/public/reports/${token}/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'visual', chartImages }),
      });
      if (!res.ok) {
        throw new Error('Failed to download PDF');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'report.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: 'Could not download the report PDF. Please try again.',
      });
    } finally {
      setIsPdfDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 space-y-6">
        {/* Watermark */}
        <div className="flex justify-between items-center border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold">AthleteMetrics — Performance Report</h1>
            <p className="text-sm text-muted-foreground">
              Generated on {format(new Date(generatedAt), "PPP")} · {snapshotData.orgBranding?.tagline ?? "Athletic Performance Report"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={isPdfDownloading}>
              {isPdfDownloading ? 'Downloading…' : 'Download PDF'}
            </Button>
            <Badge variant="outline">AthleteMetrics</Badge>
          </div>
        </div>

        {/* Coach / Team Report View */}
        {reportType === 'team' && (
          <>
            {/* Performance Snapshot */}
            {teamStatistics.length > 0 && (
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
                      {teamStatistics.map((stat: any) => {
                        const benchmarkMap = new Map<string, any>();
                        if (Array.isArray(stat.benchmarks)) {
                          stat.benchmarks.forEach((b: any) => benchmarkMap.set(b.name, b));
                        }
                        const units = stat.units || '';
                        return (
                          <TableRow key={stat.metric}>
                            <TableCell className="font-medium align-top">
                              <MetricExplanation
                                label={metricLabels[stat.metric] || stat.metric}
                                explanation={metricExplanations[stat.metric]}
                              />
                            </TableCell>
                            <TableCell>
                              {stat.average !== null && stat.average !== undefined
                                ? (isFly10Metric(stat.metric)
                                    ? formatFly10Dual(stat.average)
                                    : `${stat.average.toFixed(2)} ${units}`)
                                : "N/A"}
                            </TableCell>
                            {benchmarkColumns.map((name) => {
                              const b = benchmarkMap.get(name);
                              if (!b) return <TableCell key={name}>-</TableCell>;
                              if (b.minValue != null && b.maxValue != null) {
                                return (
                                  <TableCell key={name}>
                                    <span style={b.tierColor ? { color: b.tierColor } : undefined}>
                                      {`${b.minValue.toFixed(2)} - ${b.maxValue.toFixed(2)} ${units}`}
                                    </span>
                                  </TableCell>
                                );
                              }
                              if (b.value != null) {
                                return (
                                  <TableCell key={name}>
                                    {`${b.value.toFixed(2)} ${units}`}
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
                                          : `${stat.topPerformer.value.toFixed(2)} ${units}`)
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
                                    : `${stat.min.toFixed(2)} - ${stat.max.toFixed(2)} ${units}`)
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

            {/* Composite Index Rankings — only when composite is enabled */}
            {hasComposite && (
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
                      {athleteRankings.map((a: any, idx: number) => (
                        <TableRow key={a.userId}>
                          <TableCell>
                            <Badge variant={idx < 3 ? "default" : "secondary"}>
                              #{idx + 1}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{a.userName}</TableCell>
                          <TableCell>{a.compositeIndex?.toFixed(2) ?? "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Glossary of metrics (Team) */}
            {Object.keys(metricExplanations).length > 0 && (
              <ReportMetricsGlossary
                explanations={metricExplanations}
                metricOrder={glossaryOrder}
              />
            )}
          </>
        )}

        {/* Individual Report View */}
        {reportType === "individual" && athlete && (
          <>
            {/* Athlete Info */}
            <Card>
              <CardHeader>
                <CardTitle>Athlete Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <h3 className="text-lg font-semibold">{athlete.userName}</h3>
                  {athlete.teams && athlete.teams.length > 0 && (
                    <p className="text-muted-foreground">{athlete.teams[0]}</p>
                  )}
                  {athlete.age && (
                    <p className="text-muted-foreground">Age: {athlete.age}</p>
                  )}
                  {athlete.gender && (
                    <p className="text-muted-foreground">Gender: {athlete.gender}</p>
                  )}
                </div>
              </CardContent>
            </Card>

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
                        <TableHead>{labels.team} Average</TableHead>
                        <TableHead>Percentile</TableHead>
                        <TableHead>Benchmark Comparisons</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(athlete.measurements).map(([metricCode, value]) => {
                        const percentile = athlete.percentiles?.[metricCode];
                        const teamAverage = athlete.teamAverages?.[metricCode];
                        const benchmarks = athlete.benchmarkComparisons?.[metricCode] || [];
                        const metricLabel = metricLabels[metricCode] || metricCode;
                        const unit = metricUnits[metricCode] || '';

                        return (
                          <TableRow key={metricCode}>
                            <TableCell className="font-medium align-top">
                              <MetricExplanation
                                label={metricLabel}
                                explanation={metricExplanations[metricCode]}
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
                              {typeof teamAverage === 'number'
                                ? (isFly10Metric(metricCode)
                                    ? formatFly10Dual(teamAverage)
                                    : `${teamAverage.toFixed(2)}${unit ? ` ${unit}` : ''}`)
                                : "N/A"}
                            </TableCell>
                            <TableCell>
                              {typeof percentile === 'number' ? (
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
                          label={metricLabels[code] || code}
                          metricCode={code}
                          comparison={tiered}
                          unit={metricUnits[code]}
                        />
                      );
                    }
                    return list.map((c: any, i: number) => (
                      <BenchmarkStandingBar
                        key={`${code}-${i}`}
                        label={metricLabels[code] || code}
                        metricCode={code}
                        comparison={c}
                        unit={metricUnits[code]}
                      />
                    ));
                  })}
                </CardContent>
              </Card>
            )}

            {sel.distribution && snapshotData.distributions && Object.keys(snapshotData.distributions).length > 0 && (
              <DistributionSection
                athleteName={snapshotData.athlete.userName}
                distributions={snapshotData.distributions}
                metricLabels={metricLabels}
                metricUnits={metricUnits}
                percentiles={snapshotData.athlete.percentiles}
                comparisonLabel={snapshotData.comparisonLabel}
              />
            )}

            {/* Glossary of metrics (Individual) */}
            {Object.keys(metricExplanations).length > 0 && (
              <ReportMetricsGlossary
                explanations={metricExplanations}
                metricOrder={glossaryOrder}
              />
            )}
          </>
        )}

        {/* Time-series trends — gated on the real top-level snapshot reportType */}
        {reportType === "individual" && sel.trends && trends && Object.keys(trends).length > 0 && (
          <TrendSection
            trends={trends}
            metricLabels={metricLabels}
            metricUnits={metricUnits}
          />
        )}
      </div>
    </div>
  );
}
