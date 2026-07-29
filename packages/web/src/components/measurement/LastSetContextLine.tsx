import { useQuery } from "@tanstack/react-query";
import { useFormContext } from "react-hook-form";
import { History } from "lucide-react";
import type { AvailableMetric } from "@/hooks/use-available-metrics";

interface LastSetContextLineProps {
  athleteId: string | undefined;
  metric: AvailableMetric;
}

interface ApiMeasurementsResponse {
  measurements: Array<{
    id: string;
    date: string;
    value: string;
    units: string | null;
    auxiliaryValue: string | null;
    isCalculated: boolean;
    calculationMetadata: {
      formula?: string;
      sourceValues?: Record<string, number>;
    } | null;
  }>;
}

/**
 * Renders an inline "Last <metric>: ..." line above the measurement inputs
 * showing the athlete's most recent measurement for the selected metric. Click
 * the line to copy the values back into the form (athlete batch entry pattern).
 *
 * Per plan §6 — turns the form from "blank data entry" into "data entry with
 * context": coaches see at a glance whether the athlete is matching, beating,
 * or regressing from their previous session before they enter the new set.
 */
export function LastSetContextLine({ athleteId, metric }: LastSetContextLineProps) {
  const form = useFormContext();

  // Fetch the most recent measurement for this athlete + metric.
  // Returns the full paginated shape but we only need the first row.
  const { data, isLoading } = useQuery<ApiMeasurementsResponse>({
    queryKey: ["last-set-context", athleteId, metric.code],
    queryFn: async () => {
      const params = new URLSearchParams({
        userId: athleteId!,
        metric: metric.code,
        limit: "1",
      });
      const res = await fetch(`/api/measurements?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch last measurement");
      return res.json();
    },
    enabled: Boolean(athleteId && metric.code),
    staleTime: 60_000, // 1 minute — coach-facing freshness is fine here
  });

  if (isLoading || !data?.measurements?.length) return null;

  const last = data.measurements[0];
  const formattedDate = formatRelativeOrShortDate(last.date);

  // Paired-input metric: show "3 reps @ 315 lbs → est. 346.5 lbs"
  // (or fall back to single-value display if sourceValues is malformed).
  const isPairedInput = Boolean(metric.auxiliaryInputConfig);
  const sourceLoad = last.calculationMetadata?.sourceValues?.load;
  const sourceReps = last.calculationMetadata?.sourceValues?.reps;
  const canShowPairedFormat =
    isPairedInput && typeof sourceLoad === "number" && typeof sourceReps === "number";

  // Click handler: copy the SOURCE values back into the form (not the computed
  // 1RM as the load — the original load is what coaches lifted last time).
  const handleClick = () => {
    if (canShowPairedFormat) {
      form.setValue("value", sourceLoad, { shouldValidate: true });
      form.setValue("auxiliaryValue", sourceReps, { shouldValidate: true });
    } else {
      form.setValue("value", parseFloat(last.value) || 0, { shouldValidate: true });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="last-set-context"
      className="w-full text-left text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded px-2 py-1.5 -mx-1 flex items-center gap-2 transition-colors"
      title="Click to copy these values into the form"
    >
      <History className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
      <span>
        Last{" "}
        <span className="font-medium text-gray-700">{metric.label}</span>:{" "}
        {canShowPairedFormat ? (
          <>
            <span className="font-medium tabular-nums">{sourceReps} reps</span>{" "}
            @{" "}
            <span className="font-medium tabular-nums">
              {sourceLoad} {metric.auxiliaryInputConfig?.primaryInputUnit ?? metric.unit}
            </span>{" "}
            <span className="text-gray-400">
              → est. {parseFloat(last.value).toFixed(1)} {last.units ?? metric.unit}
            </span>
          </>
        ) : (
          <span className="font-medium tabular-nums">
            {parseFloat(last.value).toFixed(2)} {last.units ?? metric.unit}
          </span>
        )}{" "}
        <span className="text-gray-400">on {formattedDate}</span>
      </span>
    </button>
  );
}

/**
 * Format a measurement date as "today" / "yesterday" / "Apr 15" — relative
 * within a week, short month-day after. Coaches care about recency at a glance.
 */
function formatRelativeOrShortDate(isoDate: string): string {
  const date = new Date(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateMidnight = new Date(date);
  dateMidnight.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((today.getTime() - dateMidnight.getTime()) / 86400000);

  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "yesterday";
  if (dayDiff > 0 && dayDiff < 7) return `${dayDiff} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
