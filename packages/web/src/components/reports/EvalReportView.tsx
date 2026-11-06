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
import { radarSegments } from "@shared/eval-report-radar-geometry";
import { LOAD_LABELS, RESULTS_TITLE, balanceText, formatValue as formatValueWithUnit } from "@shared/eval-report-copy";
import type { EvalReportModelView, EvalMetricResultView, EvalRadarView, EvalRadarAxisView, Report } from "@/types/report-types";

/** "2026-05-01" -> "May 1, 2026" without a timezone shift */
export function formatEvalEventDate(eventDate: string | undefined | null): string {
  if (!eventDate) return "";
  const [y, m, d] = eventDate.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(date.getTime()) ? eventDate : format(date, "MMM d, yyyy");
}

function formatValue(m: EvalMetricResultView): string {
  if (typeof m.value !== "number" || Number.isNaN(m.value)) return "";
  return m.unit ? formatValueWithUnit(m.value, m.unit, m.displayFormat) : String(Math.round(m.value * 100) / 100);
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

const MIN_RADAR_AXES = 3;
const NOT_TESTED = "Not tested";
const SHORT_NAMES: Record<string, string> = { highSpeedRunning: "High-speed", changeOfDirection: "Change of dir.", reactiveStrength: "Reactive", verticalPower: "Vertical", horizontalPower: "Horizontal" };

const axisText = (a: EvalRadarAxisView) =>
  a.value === null ? NOT_TESTED : a.percentile === null ? `${a.displayValue} (not scored)` : `${a.displayValue} (${a.percentile} percentile)`;
const groupText = (a: EvalRadarAxisView) => `vs ${a.cohortLabel}, n=${a.n}`;

/** Inline SVG: radius = percentile / 100; an unscored axis is labelled in the list but has no point and no polygon vertex. */
function PercentileRadar({ radar }: { radar: EvalRadarView }) {
  const W = 420;
  const H = 290;
  const [cx, cy, R] = [W / 2, H / 2, 95];
  const n = radar.axes.length;
  const at = (i: number, r: number): [number, number] => [cx + r * Math.sin((2 * Math.PI * i) / n), cy - r * Math.cos((2 * Math.PI * i) / n)];
  const ring = (f: number) => radar.axes.map((_, i) => at(i, R * f).join(",")).join(" ");
  const pts = radar.axes.map((a, i) => (a.percentile === null ? null : at(i, R * (Math.min(100, Math.max(0, a.percentile)) / 100))));
  const segments = radarSegments(radar.axes.map((a) => a.percentile));
  const allScored = pts.every((p) => p !== null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Percentile profile radar chart. The list below gives each value." className="mx-auto w-full max-w-md">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ring(f)} fill="none" className="stroke-muted-foreground/30" strokeWidth={1} />
      ))}
      {radar.axes.map((a, i) => {
        const [x, y] = at(i, R);
        const [lx, ly] = at(i, R + 12);
        return (
          <g key={a.axis} aria-hidden="true">
            <line x1={cx} y1={cy} x2={x} y2={y} className="stroke-muted-foreground/30" strokeWidth={1} />
            <text x={lx} y={ly + (ly > cy ? 8 : 0)} fontSize={11} textAnchor={Math.abs(lx - cx) < 1 ? "middle" : lx > cx ? "start" : "end"} className="fill-foreground max-sm:hidden">
              {SHORT_NAMES[a.axis] ?? a.label}
            </text>
          </g>
        );
      })}
      {allScored && <polygon points={pts.map((p) => p!.join(",")).join(" ")} className="fill-primary/25 stroke-none" />}
      {segments.map(([i, j]) => (
        <line key={`${i}-${j}`} data-testid={`radar-segment-${i}-${j}`} x1={pts[i]![0]} y1={pts[i]![1]} x2={pts[j]![0]} y2={pts[j]![1]} className="stroke-primary" strokeWidth={2} />
      ))}
      {radar.axes.map((a, i) =>
        pts[i] ? (
          <circle key={a.axis} data-testid={`radar-point-${a.axis}`} cx={pts[i]![0]} cy={pts[i]![1]} r={4} className="fill-primary">
            <title>{`${a.label}: ${a.percentile} percentile`}</title>
          </circle>
        ) : null,
      )}
    </svg>
  );
}

function RadarSection({ radar }: { radar: EvalRadarView }) {
  const enough = radar.scoredCount >= MIN_RADAR_AXES;
  const { movement } = radar;
  return (
    <Card>
      <CardHeader>
        <SectionHeading>{enough ? "Percentile profile" : "Measurements"}</SectionHeading>
      </CardHeader>
      <CardContent className="space-y-4">
        {enough ? (
          <>
            <PercentileRadar radar={radar} />
            <p className="text-center text-xs text-muted-foreground">Farther from the center is a higher percentile within the comparison group.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="radar-table-note">
            A percentile profile needs at least {MIN_RADAR_AXES} scored measurements.
          </p>
        )}
        <ul className="space-y-2" data-testid={enough ? "radar-list" : "radar-table"}>
          {radar.axes.map((a) => (
            <li key={a.axis} className="space-y-0.5" data-testid={`radar-label-${a.axis}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{a.label}</span>
                <span className="tabular-nums" title={a.detail ?? undefined}>
                  {axisText(a)}
                </span>
              </div>
              {a.value !== null && <p className="text-xs text-muted-foreground">{groupText(a)}</p>}
            </li>
          ))}
        </ul>
        <p className="text-sm" data-testid="radar-movement">
          <span className="font-medium">Movement:</span>{" "}
          {movement.total === null ? NOT_TESTED : movement.band === null ? `MQI total ${movement.total} of 24` : `${movement.band} (MQI total ${movement.total} of 24)`}
        </p>
      </CardContent>
    </Card>
  );
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
  // With the percentile radar, Movement is shown beside it instead
  const fhMovement = model.radar ? undefined : fh.movement;
  const hasFh = sel?.freshAndHealthy !== false && (fh.load || fh.balance || fhMovement);
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
          <SectionHeading>{metrics.some((m) => m.comparison) ? "How your athlete compares for their age" : RESULTS_TITLE}</SectionHeading>
        </CardHeader>
        <CardContent className="space-y-4">
          {metrics.map((m) => {
            const text = comparisonText(m);
            const progress = tierProgress(m);
            const college = m.collegeGauge === true ? collegeText(m) : null;
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
                      : `${m.trend.direction === "improved" ? "Improved" : "Declined"} by ${formatValueWithUnit(Math.abs(m.trend.change), m.unit, m.displayFormat)} since the last evaluation`}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {model.radar && <RadarSection radar={model.radar} />}

      {hasFh && (
        <Card>
          <CardHeader>
            <SectionHeading>Fresh &amp; Healthy</SectionHeading>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {fh.load && (
              <p>
                <span className="font-medium">Load:</span> {LOAD_LABELS[fh.load] ?? fh.load}
              </p>
            )}
            {fh.balance && (
              <p>
                <span className="font-medium">Balance:</span> {balanceText(fh.balance)}
              </p>
            )}
            {fhMovement && (
              <p>
                <span className="font-medium">Movement:</span> {fhMovement}
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
