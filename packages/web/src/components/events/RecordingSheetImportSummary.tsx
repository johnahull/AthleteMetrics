/**
 * Result of loading a filled recording sheet: counts, refused rows / values with reasons,
 * ignored columns, and bulk conflict choices. Receives focus when a file is loaded.
 */
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SheetImportPlan } from "@/lib/recording-sheet-import";

interface RecordingSheetImportSummaryProps {
  fileName: string;
  plan: SheetImportPlan;
  /** Conflicts still waiting for a choice in the grid */
  conflictsLeft: number;
  /** Unsaved file values or conflicts are still in the grid */
  hasPendingImport: boolean;
  metricLabels: Map<string, string>;
  athleteNames: Map<string, string>;
  onResolveAll: (choice: "saved" | "file") => void;
  onDiscard: () => void;
  onClose: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function RecordingSheetImportSummary({
  fileName,
  plan,
  conflictsLeft,
  hasPendingImport,
  metricLabels,
  athleteNames,
  onResolveAll,
  onDiscard,
  onClose,
}: RecordingSheetImportSummaryProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [plan]);

  const count = (kind: string) => plan.cells.filter((c) => c.kind === kind).length;
  const problems = [
    ...plan.rejections.map((r) => `Row ${r.row}: ${r.message}`),
    ...plan.cellErrors.map(
      (e) =>
        `Row ${e.row}, ${athleteNames.get(e.userId) ?? e.userId}, ${metricLabels.get(e.metricCode) ?? e.metricCode}: ` +
        `${e.raw ? `"${e.raw}": ` : ""}${e.message}`,
    ),
  ];

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <section aria-labelledby="recording-sheet-summary-title" className="space-y-3">
          <h2 id="recording-sheet-summary-title" ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">
            {plan.fileError ? "Sheet not loaded" : "Sheet loaded"}: {fileName}
          </h2>

          {plan.fileError ? (
            <p role="alert" className="text-sm text-red-700">
              {plan.fileError}
            </p>
          ) : (
            <p role="status" className="text-sm">
              {plural(count("imported"), "value")} loaded (not saved yet) · {plural(count("conflict"), "conflict")} with
              saved values · {count("unchanged")} unchanged · {plural(plan.rejections.length, "row")} rejected ·{" "}
              {plural(plan.cellErrors.length, "invalid value")}
            </p>
          )}

          {problems.length > 0 && (
            <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">Not loaded:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 break-words">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground break-words">
              {plan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {conflictsLeft > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={() => onResolveAll("saved")}>
                  Keep all saved
                </Button>
                <Button size="sm" variant="outline" onClick={() => onResolveAll("file")}>
                  Use all file values
                </Button>
              </>
            )}
            {hasPendingImport && (
              <Button size="sm" variant="ghost" onClick={onDiscard}>
                Discard file values
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
