/**
 * Report Builder Page
 * Interactive UI for creating and customizing reports
 */

import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
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

export function ReportBuilder() {
  const { user, organizationContext } = useAuth();
  const [reportType, setReportType] = useState<string>("individual");
  const [title, setTitle] = useState("");
  const [timeframeType, setTimeframeType] = useState<"best" | "trends">("trends");
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [generatePdf, setGeneratePdf] = useState(true);

  // Fetch athletes for selection
  const { data: athletes } = useQuery({
    queryKey: ["athletes", organizationContext],
    queryFn: async () => {
      if (!organizationContext) return [];
      const res = await fetch(`/api/organizations/${organizationContext}/athletes`);
      if (!res.ok) throw new Error("Failed to fetch athletes");
      return res.json();
    },
    enabled: !!organizationContext,
  });

  // Fetch teams for selection
  const { data: teams } = useQuery({
    queryKey: ["teams", organizationContext],
    queryFn: async () => {
      if (!organizationContext) return [];
      const res = await fetch(`/api/organizations/${organizationContext}/teams`);
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
    enabled: !!organizationContext,
  });

  // Generate report mutation
  const generateReportMutation = useMutation({
    mutationFn: async (request: GenerateReportRequest) => {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to generate report");
      }

      return res.json();
    },
    onSuccess: (data) => {
      console.log("Report generated:", data);
      // Redirect to report view or download PDF
      if (data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
      }
    },
  });

  const handleGenerateReport = () => {
    if (!organizationContext) return;

    const request: GenerateReportRequest = {
      reportType: reportType as any,
      title: title || `${reportType.replace("_", " ")} Report`,
      organizationId: organizationContext,
      athleteIds: selectedAthletes.length > 0 ? selectedAthletes : undefined,
      teamIds: selectedTeams.length > 0 ? selectedTeams : undefined,
      config: {
        timeframeType,
      },
      options: {
        generatePdf,
      },
    };

    generateReportMutation.mutate(request);
  };

  if (!user) {
    return <div className="p-6">Please log in to access report builder.</div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Report Builder</h1>
        <p className="text-gray-600">
          Create customized performance reports for athletes, teams, and groups
        </p>
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

            {/* Timeframe Type */}
            <div className="space-y-2">
              <Label htmlFor="timeframeType">Timeframe Type</Label>
              <Select value={timeframeType} onValueChange={(value: "best" | "trends") => setTimeframeType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">
                    <div>
                      <div className="font-medium">Best Performances</div>
                      <div className="text-xs text-gray-500">Show personal bests and peak performance data</div>
                    </div>
                  </SelectItem>
                  <SelectItem value="trends">
                    <div>
                      <div className="font-medium">Performance Trends</div>
                      <div className="text-xs text-gray-500">Show progress and development over time</div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="generatePdf"
                checked={generatePdf}
                onCheckedChange={(checked) => setGeneratePdf(checked as boolean)}
              />
              <Label htmlFor="generatePdf" className="cursor-pointer">
                Generate PDF (for download and sharing)
              </Label>
            </div>
          </CardContent>
        </Card>

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