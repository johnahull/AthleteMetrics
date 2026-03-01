/**
 * TrainingComplianceTable
 *
 * Sortable table showing athlete training consistency.
 * Columns: Athlete, Consistency %, Last Session, Today's Status.
 * Sortable by consistency %. Each athlete name links to /training/athletes/:athleteId.
 * UI uses "Consistency" language (not "Compliance").
 */

import { useState } from "react";
import { Link } from "wouter";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkoutStatusBadge, type WorkoutStatus } from "./WorkoutStatusBadge";

export interface AthleteComplianceRow {
  athleteId: string;
  athleteName: string;
  consistencyPercent: number;
  lastSessionDate: string | null;
  todayStatus: WorkoutStatus | null;
  completedWorkouts: number;
  totalScheduled: number;
}

interface TrainingComplianceTableProps {
  rows: AthleteComplianceRow[];
  isLoading?: boolean;
}

type SortDirection = "asc" | "desc" | null;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function TrainingComplianceTable({ rows, isLoading = false }: TrainingComplianceTableProps) {
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  function toggleSort() {
    setSortDirection((prev) => {
      if (prev === "desc") return "asc";
      if (prev === "asc") return null;
      return "desc";
    });
  }

  const sorted = [...rows].sort((a, b) => {
    if (sortDirection === "desc") return b.consistencyPercent - a.consistencyPercent;
    if (sortDirection === "asc") return a.consistencyPercent - b.consistencyPercent;
    return 0;
  });

  const SortIcon = sortDirection === "desc"
    ? ArrowDown
    : sortDirection === "asc"
    ? ArrowUp
    : ArrowUpDown;

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Loading consistency data...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No athletes with active training assignments.
      </div>
    );
  }

  return (
    <div className="rounded-md border" data-testid="training-compliance-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Athlete</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-3 h-8 gap-1 font-medium"
                onClick={toggleSort}
                data-testid="compliance-sort-consistency"
              >
                Consistency %
                <SortIcon className="h-3.5 w-3.5" />
              </Button>
            </TableHead>
            <TableHead>Last Session</TableHead>
            <TableHead>Today</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.athleteId} data-testid={`compliance-row-${row.athleteId}`}>
              <TableCell>
                <Link
                  href={`/training/athletes/${row.athleteId}`}
                  className="font-medium text-primary hover:underline"
                  data-testid={`compliance-athlete-link-${row.athleteId}`}
                >
                  {row.athleteName}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold tabular-nums ${
                      row.consistencyPercent >= 80
                        ? "text-green-600"
                        : row.consistencyPercent >= 60
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}
                    data-testid={`compliance-percent-${row.athleteId}`}
                  >
                    {Math.round(row.consistencyPercent)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({row.completedWorkouts}/{row.totalScheduled})
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {formatDate(row.lastSessionDate)}
                </span>
              </TableCell>
              <TableCell>
                {row.todayStatus ? (
                  <WorkoutStatusBadge status={row.todayStatus} />
                ) : (
                  <span className="text-xs text-muted-foreground">No session</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
