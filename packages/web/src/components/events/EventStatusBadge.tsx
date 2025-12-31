/**
 * EventStatusBadge - Displays the status of an event with appropriate styling
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EventStatus } from "@shared/schema";

interface EventStatusBadgeProps {
  status: EventStatus;
  className?: string;
}

const statusConfig: Record<EventStatus, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700 border-gray-300",
  },
  published: {
    label: "Published",
    className: "bg-blue-100 text-blue-700 border-blue-300",
  },
  active: {
    label: "Active",
    className: "bg-green-100 text-green-700 border-green-300",
  },
  completed: {
    label: "Completed",
    className: "bg-purple-100 text-purple-700 border-purple-300",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-100 text-red-700 border-red-300",
  },
};

export function EventStatusBadge({ status, className }: EventStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}

export default EventStatusBadge;
