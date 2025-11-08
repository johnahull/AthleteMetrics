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

      {/* Performance Snapshot */}
      {data.performanceSnapshot && (
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
                  <TableHead>Benchmarks</TableHead>
                  <TableHead>Top Performer</TableHead>
                  <TableHead>Range</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.performanceSnapshot.map((metric: any) => (
                  <TableRow key={metric.metricCode}>
                    <TableCell className="font-medium">{metric.metricName}</TableCell>
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
                          <div className="font-medium">{metric.topPerformer.name}</div>
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
      {data.metricRankings &&
        Object.entries(data.metricRankings).map(([metricCode, rankings]: any) => (
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
                    <TableHead>Team</TableHead>
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
                      <TableCell className="font-medium">{athlete.name}</TableCell>
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
        ))}

      {/* Composite Index */}
      {data.compositeIndex && (
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
                  <TableHead>Team</TableHead>
                  <TableHead>Composite Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.compositeIndex.rankings.map((athlete: any, idx: number) => (
                  <TableRow key={athlete.userId}>
                    <TableCell>
                      <Badge variant={idx < 3 ? "default" : "secondary"}>
                        #{idx + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{athlete.name}</TableCell>
                    <TableCell>{athlete.teamName || "-"}</TableCell>
                    <TableCell>{athlete.compositeScore?.toFixed(2)}</TableCell>
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
