/**
 * WorkoutStatusBadge
 *
 * Displays a colored badge indicating the status of a scheduled workout day.
 * Used in AthleteScheduleView and my-training page.
 *
 * Status colors:
 *   completed  → green
 *   partial    → yellow
 *   skipped    → gray
 *   upcoming   → blue
 *   overdue    → red
 */

import { Badge } from "@/components/ui/badge";

export type WorkoutStatus = "completed" | "partial" | "skipped" | "upcoming" | "overdue";

interface WorkoutStatusBadgeProps {
  status: WorkoutStatus;
  className?: string;
}

const STATUS_CONFIG: Record<WorkoutStatus, { label: string; className: string }> = {
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
  },
  partial: {
    label: "Partial",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100",
  },
  skipped: {
    label: "Skipped",
    className: "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100",
  },
  upcoming: {
    label: "Upcoming",
    className: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100",
  },
  overdue: {
    label: "Overdue",
    className: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100",
  },
};

export function WorkoutStatusBadge({ status, className }: WorkoutStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge
      variant="outline"
      className={`${config.className} ${className ?? ""}`}
      data-testid={`workout-status-badge-${status}`}
    >
      {config.label}
    </Badge>
  );
}
