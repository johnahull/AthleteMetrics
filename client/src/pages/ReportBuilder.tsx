/**
 * Report Builder Page
 * Interactive UI for creating and customizing reports
 */

import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, BarChart3, Download, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { GenerateReportRequest } from "@shared/report-types";
import { MetricsSelector } from "@/components/analytics/MetricsSelector";
import { TimeframeSelector } from "@/components/analytics/TimeframeSelector";
import type { MetricSelection, TimeframeConfig } from "@shared/analytics-types";

export function ReportBuilder() {
  const { user, organizationContext, setOrganizationContext, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [reportType, setReportType] = useState<string>("individual");
  const [title, setTitle] = useState("");
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [generatePdf, setGeneratePdf] = useState(true);
  const [localOrgContext, setLocalOrgContext] = useState<string | null>(organizationContext);
  const [metrics, setMetrics] = useState<MetricSelection>({
    primary: "FLY10_TIME",
    additional: []
  });
  const [timeframe, setTimeframe] = useState<TimeframeConfig>({
    type: "best",
    period: "all_time"
  });

  // Use localOrgContext or organizationContext
  const activeOrgContext = localOrgContext || organizationContext;

  // Fetch organizations (for site admins)
  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const res = await fetch(`/api/organizations`);
      if (!res.ok) throw new Error("Failed to fetch organizations");
      return res.json();
    },
    enabled: !!user?.isSiteAdmin,
  });

  // Check PDF generation capability
  const { data: capabilities } = useQuery({
    queryKey: ["report-capabilities"],
    queryFn: async () => {
      const res = await fetch(`/api/reports/capabilities`);
      if (!res.ok) return { pdfGeneration: false };
      return res.json();
    },
    staleTime: Infinity, // Cache indefinitely
  });

  // Update local context when organizationContext changes
  React.useEffect(() => {
    if (organizationContext && !localOrgContext) {
      setLocalOrgContext(organizationContext);
    }
  }, [organizationContext, localOrgContext]);

  // Disable PDF generation if not available
  React.useEffect(() => {
    if (capabilities && !capabilities.pdfGeneration) {
      setGeneratePdf(false);
    }
  }, [capabilities]);

  // Fetch athletes for selection
  const { data: athletes, error: athletesError, isLoading: athletesLoading } = useQuery({
    queryKey: ["athletes", activeOrgContext],
    queryFn: async () => {
      if (!activeOrgContext) return [];
      const res = await fetch(`/api/athletes?organizationId=${activeOrgContext}`);
      if (!res.ok) throw new Error("Failed to fetch athletes");
      const data = await res.json();
      return data;
    },
    enabled: !!activeOrgContext,
  });

  // Fetch teams for selection
  const { data: teams, error: teamsError, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", activeOrgContext],
    queryFn: async () => {
      if (!activeOrgContext) return [];
      const res = await fetch(`/api/teams?organizationId=${activeOrgContext}`);
      if (!res.ok) throw new Error("Failed to fetch teams");
      const data = await res.json();
      return data;
    },
    enabled: !!activeOrgContext,
  });

  // Generate report mutation
  const generateReportMutation = useMutation({
    mutationFn: async (request: GenerateReportRequest) => {
      console.log("Sending report request:", request);
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        console.error("Report generation failed:", error);
        throw new Error(error.message || "Failed to generate report");
      }

      const data = await res.json();
      console.log("Report response received:", data);
      return data;
    },
    onSuccess: (data) => {
      console.log("Report generated successfully:", data);
      console.log("PDF URL:", data.pdfUrl);
      console.log("Share URL:", data.shareUrl);

      // If PDF was generated, open it in a new tab
      if (data.pdfUrl) {
        console.log("Opening PDF in new tab:", data.pdfUrl);
        window.open(data.pdfUrl, "_blank");
      }

      // Always redirect to report history after generation
      console.log("Redirecting to report history");
      setTimeout(() => {
        setLocation("/reports/history");
      }, 500);
    },
    onError: (error) => {
      console.error("Report generation error:", error);
      alert(`Failed to generate report: ${error.message}`);
    },
  });

  const handleGenerateReport = () => {
    if (!activeOrgContext) return;

    const request: GenerateReportRequest = {
      reportType: reportType as any,
      title: title || `${reportType.replace("_", " ")} Report`,
      organizationId: activeOrgContext,
      athleteIds: selectedAthletes.length > 0 ? selectedAthletes : undefined,
      teamIds: selectedTeams.length > 0 ? selectedTeams : undefined,
      config: {
        metrics,
        timeframeType: timeframe.type,
        dateRange: {
          type: timeframe.period === "last_7_days" ? "last_30_days" : timeframe.period,
          startDate: timeframe.startDate?.toISOString(),
          endDate: timeframe.endDate?.toISOString(),
        },
      },
      options: {
        generatePdf,
      },
    };

    generateReportMutation.mutate(request);
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!user) {
    return <div className="p-6">Please log in to access report builder.</div>;
  }

  // If site admin without org context selected, show org selector
  if (!activeOrgContext && user.isSiteAdmin) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Report Builder</h1>
          <Card>
            <CardHeader>
              <CardTitle>Select Organization</CardTitle>
              <CardDescription>Choose an organization to create reports for</CardDescription>
            </CardHeader>
            <CardContent>
              <Select onValueChange={(value) => setLocalOrgContext(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose organization..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations?.map((org: any) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // If coach/org admin without org context, show error
  if (!activeOrgContext && (user.role === 'coach' || user.role === 'org_admin')) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Report Builder</h1>
          <p className="text-red-600">
            No organization found for your account. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Report Builder</h1>
          <p className="text-gray-600">
            Create customized performance reports for athletes, teams, and groups
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation("/reports/history")}
        >
          <FileText className="mr-2 h-4 w-4" />
          View Report History
        </Button>
      </div>

      <div className="grid gap-6">
        {/* Report Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Report Type</CardTitle>
            <CardDescription>Choose the type of report you want to generate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ReportTypeCard
                icon={<FileText />}
                title="Individual"
                description="Single athlete report"
                selected={reportType === "individual"}
                onClick={() => setReportType("individual")}
              />
              <ReportTypeCard
                icon={<BarChart3 />}
                title="Team"
                description="Team performance summary"
                selected={reportType === "team"}
                onClick={() => setReportType("team")}
              />
              <ReportTypeCard
                icon={<FileText />}
                title="Multi-Athlete"
                description="Compare multiple athletes"
                selected={reportType === "multi_athlete"}
                onClick={() => setReportType("multi_athlete")}
              />
              <ReportTypeCard
                icon={<FileText />}
                title="Recruiting"
                description="Recruiting package"
                selected={reportType === "recruiting"}
                onClick={() => setReportType("recruiting")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Report Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Report Configuration</CardTitle>
            <CardDescription>Customize your report settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Report Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Report Title</Label>
              <Input
                id="title"
                placeholder={`${reportType.replace("_", " ")} Report`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Athlete Selection (for individual/multi-athlete/recruiting) */}
            {["individual", "multi_athlete", "recruiting"].includes(reportType) && (
              <div className="space-y-2">
                <Label>Select Athletes</Label>
                <Select
                  onValueChange={(value) => {
                    if (!selectedAthletes.includes(value)) {
                      setSelectedAthletes([...selectedAthletes, value]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose athletes..." />
                  </SelectTrigger>
                  <SelectContent>
                    {athletes?.map((athlete: any) => (
                      <SelectItem key={athlete.id} value={athlete.id}>
                        {athlete.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedAthletes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedAthletes.map((id) => {
                      const athlete = athletes?.find((a: any) => a.id === id);
                      return (
                        <div
                          key={id}
                          className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                        >
                          {athlete?.name}
                          <button
                            onClick={() =>
                              setSelectedAthletes(selectedAthletes.filter((a) => a !== id))
                            }
                            className="text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Team Selection (for team reports) */}
            {reportType === "team" && (
              <div className="space-y-2">
                <Label>Select Teams</Label>
                <Select
                  onValueChange={(value) => {
                    if (!selectedTeams.includes(value)) {
                      setSelectedTeams([...selectedTeams, value]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose teams..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teams?.map((team: any) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTeams.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedTeams.map((id) => {
                      const team = teams?.find((t: any) => t.id === id);
                      return (
                        <div
                          key={id}
                          className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                        >
                          {team?.name}
                          <button
                            onClick={() =>
                              setSelectedTeams(selectedTeams.filter((t) => t !== id))
                            }
                            className="text-green-600 hover:text-green-800"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* PDF Generation Option */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="generatePdf"
                  checked={generatePdf}
                  disabled={!capabilities?.pdfGeneration}
                  onCheckedChange={(checked) => setGeneratePdf(checked as boolean)}
                />
                <Label
                  htmlFor="generatePdf"
                  className={capabilities?.pdfGeneration ? "cursor-pointer" : "cursor-not-allowed opacity-50"}
                >
                  Generate PDF (for download and sharing)
                </Label>
              </div>
              {!capabilities?.pdfGeneration && (
                <p className="text-xs text-amber-600">
                  PDF generation is not available in this environment. Reports will be generated as web pages only.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Metrics Selection */}
        <MetricsSelector
          metrics={metrics}
          onMetricsChange={setMetrics}
          analysisType="individual"
        />

        {/* Timeframe Selection */}
        <TimeframeSelector
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          analysisType="individual"
        />

        {/* Generate Button */}
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerateReport}
            disabled={
              generateReportMutation.isPending ||
              (reportType !== "team" && selectedAthletes.length === 0) ||
              (reportType === "team" && selectedTeams.length === 0)
            }
          >
            {generateReportMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generate Report
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Helper component for report type selection
interface ReportTypeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

function ReportTypeCard({
  icon,
  title,
  description,
  selected,
  onClick,
}: ReportTypeCardProps) {
  return (
    <button
      onClick={onClick}
      className={`p-4 border-2 rounded-lg text-left transition-all ${
        selected
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="mb-2 text-gray-700">{icon}</div>
      <div className="font-semibold text-sm mb-1">{title}</div>
      <div className="text-xs text-gray-600">{description}</div>
    </button>
  );
}

export default ReportBuilder;