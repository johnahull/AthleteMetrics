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
import { format } from "date-fns";
import { Lock } from "lucide-react";
import { useContextualLabels } from "@/hooks/useContextualLabels";
import { MetricExplanation } from "@/components/reports/MetricExplanation";
import { ReportMetricsGlossary } from "@/components/reports/ReportMetricsGlossary";
import { TrendSection } from "@/components/reports/TrendSection";
import type { MetricExplanation as MetricExplanationData } from "@shared/metric-explanations";
import type { ReportTrends } from "@shared/report-trends-types";

export default function PublicReport() {
  const labels = useContextualLabels();
  const [, params] = useRoute("/public/reports/:token");
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
  const { reportConfig, generatedAt, dataSnapshot } = snapshotData;
  const metricExplanations = (snapshotData.metricExplanations ?? {}) as Record<string, MetricExplanationData>;
  const trends = (snapshotData.trends ?? undefined) as ReportTrends | undefined;
  const trendMetricLabels = (snapshotData.metricLabels ?? {}) as Record<string, string>;
  const trendMetricUnits = (snapshotData.metricUnits ?? {}) as Record<string, string>;
  const glossaryOrderSet = new Set<string>();
  if (Array.isArray(dataSnapshot?.performanceSnapshot)) {
    for (const m of dataSnapshot.performanceSnapshot) {
      if (m?.metricCode) glossaryOrderSet.add(m.metricCode);
    }
  }
  if (Array.isArray(dataSnapshot?.performance)) {
    for (const m of dataSnapshot.performance) {
      if (m?.metricCode) glossaryOrderSet.add(m.metricCode);
    }
  }
  const glossaryOrder = Array.from(glossaryOrderSet);

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
          <Badge variant="outline">AthleteMetrics</Badge>
        </div>

        {/* Coach Report View */}
        {reportConfig.reportType === 'team' && (
          <>
            {/* Performance Snapshot */}
            {dataSnapshot.performanceSnapshot && (
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
                        <TableHead>Benchmarks</TableHead>
                        <TableHead>Top Performer</TableHead>
                        <TableHead>Range</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataSnapshot.performanceSnapshot.map((metric: any) => (
                        <TableRow key={metric.metricCode}>
                          <TableCell className="font-medium align-top">
                            <MetricExplanation
                              label={metric.metricName}
                              explanation={metricExplanations[metric.metricCode]}
                            />
                          </TableCell>
                          <TableCell>
                            {metric.teamAverage?.toFixed(2) || "N/A"} {metric.unit}
                          </TableCell>
                          <TableCell>
                            {metric.benchmarks && metric.benchmarks.length > 0 ? (
                              <div className="space-y-1">
                                {metric.benchmarks.map((b: any, idx: number) => (
                                  <div key={idx} className="text-sm">
                                    {b.name}: {b.value} {metric.unit}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {metric.topPerformer ? (
                              <div>
                                <div className="font-medium">
                                  {metric.topPerformer.name}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {metric.topPerformer.value} {metric.unit}
                                </div>
                              </div>
                            ) : (
                              "N/A"
                            )}
                          </TableCell>
                          <TableCell>
                            {metric.range
                              ? `${metric.range.min} - ${metric.range.max} ${metric.unit}`
                              : "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Metric Rankings */}
            {dataSnapshot.metricRankings &&
              Object.entries(dataSnapshot.metricRankings).map(
                ([metricCode, rankings]: any) => (
                  <Card key={metricCode}>
                    <CardHeader>
                      <CardTitle>{rankings.metricName} Rankings</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Rank</TableHead>
                            <TableHead>Athlete</TableHead>
                            <TableHead>{labels.team}</TableHead>
                            <TableHead>Score</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rankings.rankings.map((athlete: any, idx: number) => (
                            <TableRow key={athlete.userId}>
                              <TableCell>
                                <Badge variant={idx < 3 ? "default" : "secondary"}>
                                  #{idx + 1}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                {athlete.name}
                              </TableCell>
                              <TableCell>{athlete.teamName || "-"}</TableCell>
                              <TableCell>
                                {athlete.value?.toFixed(2)} {rankings.unit}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )
              )}

            {/* Composite Index */}
            {dataSnapshot.compositeIndex && (
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
                        <TableHead>{labels.team}</TableHead>
                        <TableHead>Composite Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataSnapshot.compositeIndex.rankings.map(
                        (athlete: any, idx: number) => (
                          <TableRow key={athlete.userId}>
                            <TableCell>
                              <Badge variant={idx < 3 ? "default" : "secondary"}>
                                #{idx + 1}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {athlete.name}
                            </TableCell>
                            <TableCell>{athlete.teamName || "-"}</TableCell>
                            <TableCell>
                              {athlete.compositeScore?.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Glossary of metrics (Team) */}
        {reportConfig.reportType === 'team' && Object.keys(metricExplanations).length > 0 && (
          <ReportMetricsGlossary
            explanations={metricExplanations}
            metricOrder={glossaryOrder}
          />
        )}

        {/* Individual Report View */}
        {reportConfig.reportType === "individual" && (
          <>
            {/* Athlete Info */}
            {dataSnapshot.athlete && (
              <Card>
                <CardHeader>
                  <CardTitle>Athlete Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {dataSnapshot.athlete.firstName}{" "}
                      {dataSnapshot.athlete.lastName}
                    </h3>
                    {dataSnapshot.athlete.teamName && (
                      <p className="text-muted-foreground">
                        {dataSnapshot.athlete.teamName}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Performance Table */}
            {dataSnapshot.performance && (
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
                        <TableHead>{labels.team} Rank</TableHead>
                        <TableHead>Percentile</TableHead>
                        <TableHead>Benchmarks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataSnapshot.performance.map((metric: any) => (
                        <TableRow key={metric.metricCode}>
                          <TableCell className="font-medium align-top">
                            <MetricExplanation
                              label={metric.metricName}
                              explanation={metricExplanations[metric.metricCode]}
                            />
                          </TableCell>
                          <TableCell>
                            {metric.bestValue?.toFixed(2) || "N/A"} {metric.unit}
                          </TableCell>
                          <TableCell>
                            {metric.teamRank ? (
                              <Badge>#{metric.teamRank}</Badge>
                            ) : (
                              "N/A"
                            )}
                          </TableCell>
                          <TableCell>
                            {metric.percentile
                              ? `${metric.percentile.toFixed(0)}th`
                              : "N/A"}
                          </TableCell>
                          <TableCell>
                            {metric.benchmarks && metric.benchmarks.length > 0 ? (
                              <div className="space-y-1">
                                {metric.benchmarks.map((b: any, idx: number) => (
                                  <div key={idx} className="text-sm">
                                    <span className="font-medium">{b.name}:</span>{" "}
                                    {b.value} {metric.unit}
                                    {b.comparison && (
                                      <Badge
                                        variant={
                                          b.comparison === "above"
                                            ? "default"
                                            : "secondary"
                                        }
                                        className="ml-2"
                                      >
                                        {b.comparison}
                                      </Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Time-series trends */}
            {trends && Object.keys(trends).length > 0 && (
              <TrendSection
                trends={trends}
                metricLabels={trendMetricLabels}
                metricUnits={trendMetricUnits}
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
      </div>
    </div>
  );
}
