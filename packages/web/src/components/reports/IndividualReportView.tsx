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

interface IndividualReportViewProps {
  report: Report;
}

export function IndividualReportView({ report }: IndividualReportViewProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const generateReport = useGenerateReport(report.id);
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    // Generate report data on mount
    generateReport.mutate(undefined, {
      onSuccess: (data) => {
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

  const { data } = reportData;

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
              {data.athlete && (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold">
                    {data.athlete.firstName} {data.athlete.lastName}
                  </h3>
                  {data.athlete.teamName && (
                    <p className="text-muted-foreground">{data.athlete.teamName}</p>
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
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Performance Table */}
      {data.performance && (
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
                  <TableHead>Team Rank</TableHead>
                  <TableHead>Percentile</TableHead>
                  <TableHead>Benchmarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.performance.map((metric: any) => (
                  <TableRow key={metric.metricCode}>
                    <TableCell className="font-medium">{metric.metricName}</TableCell>
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
                      {metric.percentile ? `${metric.percentile.toFixed(0)}th` : "N/A"}
                    </TableCell>
                    <TableCell>
                      {metric.benchmarks && metric.benchmarks.length > 0 ? (
                        <div className="space-y-1">
                          {metric.benchmarks.map((b: any, idx: number) => (
                            <div key={idx} className="text-sm">
                              <span className="font-medium">{b.name}:</span> {b.value}{" "}
                              {metric.unit}
                              {b.comparison && (
                                <Badge
                                  variant={
                                    b.comparison === "above" ? "default" : "secondary"
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

      {/* Test History */}
      {data.testHistory && data.testHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(
                data.testHistory.reduce((acc: any, test: any) => {
                  if (!acc[test.metricCode]) {
                    acc[test.metricCode] = [];
                  }
                  acc[test.metricCode].push(test);
                  return acc;
                }, {})
              ).map(([metricCode, tests]: any) => (
                <div key={metricCode}>
                  <h4 className="font-medium mb-2">{tests[0].metricName}</h4>
                  <div className="space-y-2">
                    {tests
                      .sort(
                        (a: any, b: any) =>
                          new Date(b.testDate).getTime() -
                          new Date(a.testDate).getTime()
                      )
                      .slice(0, 5)
                      .map((test: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-sm border-b pb-2"
                        >
                          <span className="text-muted-foreground">
                            {format(new Date(test.testDate), "MMM d, yyyy")}
                          </span>
                          <span className="font-medium">
                            {test.value} {tests[0].unit}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
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
    </div>
  );
}
