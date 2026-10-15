/**
 * EventEvalReportsCard - entry point for eval reports (AM-FEAT-019 P5).
 * Lists the athletes who have at least one measurement in the event, each with a "Generate eval report" action.
 * Shown to coaches, org admins and site admins only.
 */

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useEventMeasurements } from "@/lib/events-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EvalReportDialog } from "./EvalReportDialog";

interface EventEvalReportsCardProps {
  eventId: string;
  organizationId: string | undefined;
  /** Coach, org admin or site admin of the event's organization */
  canManage: boolean;
}

interface MeasuredAthlete {
  id: string;
  name: string;
  count: number;
}

export function EventEvalReportsCard({ eventId, organizationId, canManage }: EventEvalReportsCardProps) {
  const enabled = canManage && !!organizationId;
  const { data: measurements, isLoading } = useEventMeasurements(enabled ? eventId : undefined);
  const [active, setActive] = useState<MeasuredAthlete | null>(null);

  const athletes = useMemo(() => {
    const byId = new Map<string, MeasuredAthlete>();
    for (const m of measurements ?? []) {
      const name = m.user?.fullName || [m.user?.firstName, m.user?.lastName].filter(Boolean).join(" ") || m.userFullName;
      const entry = byId.get(m.userId) ?? { id: m.userId, name: name || "Unnamed athlete", count: 0 };
      entry.count += 1;
      byId.set(m.userId, entry);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [measurements]);

  if (!enabled) return null;

  return (
    <Card data-testid="eval-reports-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" aria-hidden="true" />
          Eval reports
        </CardTitle>
        <CardDescription>Choose what goes in, preview it, and download a PDF for an athlete's evaluation.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div data-testid="eval-reports-loading" className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : athletes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Enter measurements for an athlete to generate an eval report.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {athletes.map((athlete) => (
              <li key={athlete.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{athlete.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {athlete.count} {athlete.count === 1 ? "measurement" : "measurements"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActive(athlete)}
                  aria-label={`Generate eval report for ${athlete.name}`}
                >
                  Generate eval report
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {active && organizationId && (
        <EvalReportDialog
          open
          onOpenChange={(open) => !open && setActive(null)}
          eventId={eventId}
          organizationId={organizationId}
          athleteId={active.id}
          athleteName={active.name}
        />
      )}
    </Card>
  );
}
