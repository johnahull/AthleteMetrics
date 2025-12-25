/**
 * EventReportsTab - Generate and manage event reports
 * Allows creating team/individual reports with event percentiles and AI insights
 */

import { useState } from "react";
import { Link } from "wouter";
import {
  useEventReports,
  useGenerateQuickEventReport,
  useExportEventReportPDF,
  type EventReport,
} from "@/lib/events-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FileText,
  Users,
  User,
  Download,
  Plus,
  ExternalLink,
  Share2,
  Sparkles,
  Lock,
  AlertCircle,
  FileBarChart,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

interface EventReportsTabProps {
  eventId: string;
  eventName: string;
  isFrozen?: boolean;
}

export function EventReportsTab({
  eventId,
  eventName,
  isFrozen = false,
}: EventReportsTabProps) {
  const { toast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch existing reports for this event
  const { data: reports, isLoading } = useEventReports(eventId);

  // Quick report generation
  const generateQuickReport = useGenerateQuickEventReport();
  const exportPDF = useExportEventReportPDF();

  // Handle quick team report
  const handleQuickTeamReport = async () => {
    try {
      const result = await generateQuickReport.mutateAsync({
        eventId,
        reportType: 'team',
      });
      toast({
        title: "Team Report Generated",
        description: `Report "${result.report.name}" has been created.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate report.",
      });
    }
  };

  // Handle quick individual report (opens modal for athlete selection)
  const handleIndividualReport = () => {
    setShowCreateModal(true);
  };

  // Handle PDF export
  const handleExportPDF = async (reportId: string, reportName: string) => {
    try {
      const blob = await exportPDF.mutateAsync({ reportId });
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "PDF Downloaded",
        description: "Report has been exported successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to export PDF.",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Reports
              {isFrozen && (
                <Badge variant="outline" className="ml-2 bg-blue-100 text-blue-700">
                  <Lock className="h-3 w-3 mr-1" />
                  Frozen
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Generate and manage performance reports for this event
            </CardDescription>
          </div>
          <Link href={`/events/${eventId}/reports/new`}>
            <Button size="sm" disabled={isFrozen}>
              <Plus className="h-4 w-4 mr-2" />
              New Report
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isFrozen && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">
              This event is frozen. You can still view existing reports but cannot create new ones.
            </span>
          </div>
        )}

        {/* Quick Actions */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Quick Actions</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Team Summary Report */}
            <button
              onClick={handleQuickTeamReport}
              disabled={isFrozen || generateQuickReport.isPending}
              className="flex flex-col items-center p-4 border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2 rounded-full bg-blue-100 mb-2">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <span className="font-medium text-sm">Team Summary</span>
              <span className="text-xs text-muted-foreground text-center">
                Generate report for all participants
              </span>
              {generateQuickReport.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mt-2" />
              )}
            </button>

            {/* Individual Reports */}
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
              <DialogTrigger asChild>
                <button
                  disabled={isFrozen}
                  className="flex flex-col items-center p-4 border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="p-2 rounded-full bg-green-100 mb-2">
                    <User className="h-5 w-5 text-green-600" />
                  </div>
                  <span className="font-medium text-sm">Individual</span>
                  <span className="text-xs text-muted-foreground text-center">
                    Select athletes for reports
                  </span>
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Individual Reports</DialogTitle>
                  <DialogDescription>
                    Coming soon: Select specific athletes to generate individual reports with event percentiles.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                    Close
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Export Raw Data */}
            <Link href={`/events/${eventId}/data-entry`}>
              <button
                disabled={isFrozen}
                className="flex flex-col items-center p-4 border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
              >
                <div className="p-2 rounded-full bg-purple-100 mb-2">
                  <Download className="h-5 w-5 text-purple-600" />
                </div>
                <span className="font-medium text-sm">Export Data</span>
                <span className="text-xs text-muted-foreground text-center">
                  View raw measurement data
                </span>
              </button>
            </Link>
          </div>
        </div>

        {/* Report Features Info */}
        <div className="p-4 rounded-lg border bg-muted/30">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Event Reports Include</p>
              <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                <li>• <strong>Event Percentiles:</strong> Compare athletes within this event</li>
                <li>• <strong>AI Insights:</strong> Personalized coaching recommendations</li>
                <li>• <strong>Team Statistics:</strong> Averages, medians, and rankings</li>
                <li>• <strong>PDF Export:</strong> Share reports with athletes and parents</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Existing Reports */}
        <div className="space-y-3 pt-4 border-t">
          <h4 className="text-sm font-medium">
            Reports for this Event
            {reports && reports.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {reports.length}
              </Badge>
            )}
          </h4>

          {!reports || reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileBarChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No reports generated yet</p>
              <p className="text-sm">Use the quick actions above to create your first report</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onExportPDF={() => handleExportPDF(report.id, report.name)}
                  isPDFExporting={exportPDF.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Individual report card component
 */
interface ReportCardProps {
  report: EventReport;
  onExportPDF: () => void;
  isPDFExporting: boolean;
}

function ReportCard({ report, onExportPDF, isPDFExporting }: ReportCardProps) {
  const isTeamReport = report.reportType === 'team';
  const hasAiInsights = !!report.coachingInsights;

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${isTeamReport ? 'bg-blue-100' : 'bg-green-100'}`}>
          {isTeamReport ? (
            <Users className="h-4 w-4 text-blue-600" />
          ) : (
            <User className="h-4 w-4 text-green-600" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{report.name}</span>
            {hasAiInsights && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                <Sparkles className="h-3 w-3 mr-1" />
                AI
              </Badge>
            )}
            {report.config.includeEventPercentiles && (
              <Badge variant="outline" className="text-xs">
                Event %
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isTeamReport ? 'Team Report' : 'Individual Report'} •{' '}
            {format(new Date(report.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/reports/${report.id}`}>
          <Button variant="ghost" size="sm" aria-label={`View ${report.name}`}>
            <ExternalLink className="h-4 w-4" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={onExportPDF}
          disabled={isPDFExporting}
          aria-label={`Download ${report.name} as PDF`}
        >
          {isPDFExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="sm">
          <Share2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default EventReportsTab;
