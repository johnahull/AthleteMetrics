/**
 * EventCard - Card component for displaying event summary in lists
 */

import { Link } from "wouter";
import { Calendar, MapPin, Users, Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EventStatusBadge } from "./EventStatusBadge";
import type { EventWithCounts } from "@/lib/events-api";
import { format, formatDistanceToNow, isPast, isFuture } from "date-fns";

interface EventCardProps {
  event: EventWithCounts;
  showManageButton?: boolean;
  showViewButton?: boolean;
  onManage?: (event: EventWithCounts) => void;
}

const eventTypeLabels: Record<string, string> = {
  combine: "Combine",
  camp: "Camp",
  testing_day: "Testing Day",
  tryout: "Tryout",
  custom: "Event",
};

export function EventCard({
  event,
  showManageButton = true,
  showViewButton = true,
  onManage,
}: EventCardProps) {
  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const isUpcoming = isFuture(startDate);
  const isPastEvent = isPast(endDate || startDate);

  const formatDateRange = () => {
    if (!endDate || format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
      return format(startDate, "MMM d, yyyy");
    }
    if (format(startDate, "MMM yyyy") === format(endDate, "MMM yyyy")) {
      return `${format(startDate, "MMM d")}-${format(endDate, "d, yyyy")}`;
    }
    return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
  };

  const getTimeLabel = () => {
    if (isPastEvent) return "Completed";
    if (isUpcoming) return `In ${formatDistanceToNow(startDate)}`;
    return "In Progress";
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="font-semibold text-lg leading-tight">{event.name}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{eventTypeLabels[event.eventType || "custom"] || "Event"}</span>
              <span>•</span>
              <EventStatusBadge status={event.status} />
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <Clock className="inline-block h-4 w-4 mr-1" />
            {getTimeLabel()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Date and Location */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{formatDateRange()}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{event.location}</span>
            </div>
          )}
        </div>

        {/* Registration Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>
              {event.registrationCount ?? 0} registered
              {event.maxRegistrations && ` / ${event.maxRegistrations}`}
            </span>
          </div>
          {(event.waitlistCount ?? 0) > 0 && (
            <span className="text-amber-600">
              {event.waitlistCount} waitlisted
            </span>
          )}
        </div>

        {/* Description preview */}
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {event.description}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {showViewButton && (
            <Link href={`/events/${event.id}`}>
              <Button variant="outline" size="sm">
                View Details
              </Button>
            </Link>
          )}
          {showManageButton && onManage && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onManage(event)}
            >
              Manage
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default EventCard;
