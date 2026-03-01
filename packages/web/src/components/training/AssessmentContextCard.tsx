/**
 * AssessmentContextCard
 *
 * Reads from useAssessmentContext() hook.
 * Shows: metric name, latest value, D1 benchmark, gap (red if below, green if meeting/exceeding).
 * Returns null if no data — renders nothing when athlete has no measurement history.
 * Read-only.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Target } from "lucide-react";
import { useAssessmentContext } from "@/hooks/useAssessmentContext";

function GapIndicator({
  gap,
  higherIsBetter,
  unit,
}: {
  gap: number | null;
  higherIsBetter: boolean;
  unit: string;
}) {
  if (gap === null) {
    return (
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Minus className="h-3 w-3" />
        No D1 benchmark
      </span>
    );
  }

  // For lower-is-better metrics (like sprint times), a negative gap means you're faster = good
  const isMeetingOrExceeding = higherIsBetter ? gap >= 0 : gap <= 0;
  const absGap = Math.abs(gap).toFixed(2);
  const sign = gap > 0 ? "+" : "-";

  if (isMeetingOrExceeding) {
    return (
      <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
        <TrendingUp className="h-3 w-3" />
        {sign}{absGap} {unit} vs D1
      </span>
    );
  }

  return (
    <span className="text-xs text-red-600 flex items-center gap-1 font-medium">
      <TrendingDown className="h-3 w-3" />
      {sign}{absGap} {unit} from D1
    </span>
  );
}

export function AssessmentContextCard() {
  const { data: context, isLoading } = useAssessmentContext();

  if (isLoading) return null;
  if (!context || context.metrics.length === 0) return null;

  return (
    <Card data-testid="assessment-context-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Assessment Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {context.metrics.map((metric) => (
            <div
              key={metric.metricKey}
              className="space-y-1"
              data-testid={`assessment-metric-${metric.metricKey}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{metric.metricLabel}</p>
                {metric.d1Threshold != null && (
                  <Badge variant="outline" className="text-xs">
                    D1: {metric.d1Threshold} {metric.unit}
                  </Badge>
                )}
              </div>
              <p className="text-2xl font-bold tabular-nums">
                {metric.latestValue}{" "}
                <span className="text-sm font-normal text-muted-foreground">{metric.unit}</span>
              </p>
              <GapIndicator
                gap={metric.gap}
                higherIsBetter={metric.higherIsBetter}
                unit={metric.unit}
              />
            </div>
          ))}
        </div>
        {context.lastMeasuredAt && (
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
            Last assessed{" "}
            {new Date(context.lastMeasuredAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
