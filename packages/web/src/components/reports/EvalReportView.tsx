/**
 * EvalReportView - renders a saved eval report (reports.reportType = 'eval', AM-FEAT-019).
 *
 * An eval report is drawn from its frozen model; it never calls /generate. The model carries no
 * pre-test survey data, so none is shown here. `EvalReportBody` is shared with the public snapshot page.
 */
import { useState } from "react";
import { format } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { exportEventReportPDF } from "@/lib/events-api";
import type { EvalReportModelView, EvalMetricResultView, Report } from "@/types/report-types";

/** "2026-05-01" -> "May 1, 2026" without a timezone shift */
export function formatEvalEventDate(eventDate: string | undefined | null): string {
  if (!eventDate) return "";
  const [y, m, d] = eventDate.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(date.getTime()) ? eventDate : format(date, "MMM d, yyyy");
}

function formatValue(m: EvalMetricResultView): string {
  if (typeof m.value !== "number" || Number.isNaN(m.value)) return "";
  const value = Number.isInteger(m.value) ? String(m.value) : m.value.toFixed(2);
  return m.unit ? `${value} ${m.unit}` : value;
}

/** Percent of the way to the best tier for a tier comparison; null when there is nothing to draw */
function tierProgress(m: EvalMetricResultView): number | null {
  const c = m.comparison;
  if (!c || c.kind !== "tiers") return null;
  const tiers = c.comparison.allTiers;
  const order = c.comparison.tierOrder;
  if (!tiers || tiers.length === 0 || order === undefined) return null;
  return Math.max(0, Math.min(100, Math.round(((tiers.length - order + 1) / tiers.length) * 100)));
}

/** Neutral wording: the benchmark row's own name is not printed, so it can never contradict the athlete's age. */
function comparisonText(m: EvalMetricResultView): string | null {
  const c = m.comparison;
  if (!c) return null;
  if (c.kind === "tiers") return c.comparison.tierName || null;
  return c.status === "at_or_better" ? "At or better than the age-group average" : "Below the age-group average";
}

function collegeText(m: EvalMetricResultView): string | null {
  const c = m.collegeStandard;
  if (!c) return null;
  return c.status === "at_or_better" ? "At or better than the college average" : "Below the college average";
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-semibold leading-none tracking-tight">{children}</h2>;
}

export function EvalReportBody({ model }: { model: EvalReportModelView }) {
  const sel = model.selection;
  const metrics = model.metrics ?? [];
  const fh = model.freshAndHealthy ?? {};
  const labelOf = (k: string) => metrics.find((m) => m.key === k)?.label ?? k;
  const strengths = (model.strengths ?? []).map(labelOf);
  const development = (model.developmentAreas ?? []).map(labelOf);
  const limiter = model.limiter ? labelOf(model.limiter) : null;
  const hasFh = sel?.freshAndHealthy !== false && (fh.load || fh.balance || fh.movement);
  const showStrengths = sel?.strengths !== false && (strengths.length > 0 || development.length > 0 || !!limiter);
  const showNote = sel?.coachNote !== false && !!model.coachNote;
  const athlete = model.athlete;

  const noteCard = showNote && (
    <Card>
      <CardHeader>
        <SectionHeading>What we saw</SectionHeading>
      </CardHeader>
      {/* React escapes the coach's free text */}
      <CardContent className="whitespace-pre-wrap text-sm">{model.coachNote}</CardContent>
    </Card>
  );
  // The middle school preset puts the coach's note first
  const noteFirst = sel?.noteFirst === true;

  return (
    <div className="space-y-6" data-testid="eval-report-body">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold leading-none tracking-tight">{athlete?.name ?? "Athlete"}</h1>
            <Badge variant="outline">Eval report</Badge>
            <span className="text-sm text-muted-foreground" data-testid="eval-event-date">
              {formatEvalEventDate(model.eventDate)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {[
              athlete?.age != null ? `Age ${athlete.age}` : null,
              athlete?.graduationYear ? `Class of ${athlete.graduationYear}` : null,
              athlete?.sport,
              athlete?.team,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </CardHeader>
      </Card>

      {noteFirst && noteCard}

      <Card>
        <CardHeader>
          <SectionHeading>How your athlete compares for their age</SectionHeading>
        </CardHeader>
        <CardContent className="space-y-4">
          {metrics.map((m) => {
            const text = comparisonText(m);
            const progress = tierProgress(m);
            const college = sel?.collegeGauge || m.collegeGauge ? collegeText(m) : null;
            return (
              <div key={m.code} className="space-y-1" data-testid={`eval-metric-${m.code}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{m.label}</span>
                  <span className="tabular-nums">{formatValue(m)}</span>
                </div>
                {text && <p className="text-sm text-muted-foreground">{text}</p>}
                {progress !== null && (
                  <>
                    <Progress
                      value={progress}
                      className="h-2 bg-muted"
                      aria-label={`${m.label}: compared with the age group`}
                      aria-valuetext={`${progress} percent of the way to the top group`}
                    />
                    <p className="text-xs text-muted-foreground">Compared with the age group</p>
                  </>
                )}
                {college && <p className="text-sm text-muted-foreground">{college}</p>}
                {m.trend && sel?.retestTrend !== false && (
                  <p className="text-xs text-muted-foreground">
                    {m.trend.direction === "unchanged"
                      ? "Unchanged since the last evaluation"
                      : `${m.trend.direction === "improved" ? "Improved" : "Declined"} by ${Math.abs(m.trend.change)} ${m.unit} since the last evaluation`}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {hasFh && (
        <Card>
          <CardHeader>
            <SectionHeading>Fresh &amp; Healthy</SectionHeading>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {fh.load && (
              <p>
                <span className="font-medium">Load:</span> <span className="capitalize">{fh.load}</span>
              </p>
            )}
            {fh.balance && (
              <p>
                <span className="font-medium">Balance:</span> {fh.balance.label}
              </p>
            )}
            {fh.movement && (
              <p>
                <span className="font-medium">Movement:</span> {fh.movement}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {showStrengths && (
        <Card>
          <CardHeader>
            <SectionHeading>Strengths</SectionHeading>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {strengths.length > 0 && <p>{strengths.join(", ")}</p>}
            {development.length > 0 && (
              <p>
                <span className="font-medium">Areas to develop:</span> {development.join(", ")}
              </p>
            )}
            {limiter && (
              <p>
                <span className="font-medium">Biggest opportunity:</span> {limiter}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!noteFirst && noteCard}
    </div>
  );
}

interface EvalReportViewProps {
  report: Report;
  /** Athletes reach their eval through a share and cannot call the coach-only PDF route */
  showDownload?: boolean;
}

export function EvalReportView({ report, showDownload = true }: EvalReportViewProps) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const model = (report.config as { model?: EvalReportModelView }).model;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const blob = await exportEventReportPDF(report.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Failed to download PDF. Please try again.",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (!model) {
    return <p className="text-destructive">This eval report has no saved content.</p>;
  }

  return (
    <div className="space-y-4">
      {showDownload && (
        <div className="flex justify-end">
          <Button onClick={handleDownload} disabled={isDownloading} data-testid="eval-download-pdf">
            {isDownloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
        </div>
      )}
      <EvalReportBody model={model} />
    </div>
  );
}
