/**
 * InvitationCard component
 *
 * Displays a pending event invitation with event details
 * and accept/decline actions for the athlete.
 */

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { EventInvitationWithEvent } from "@/lib/events-api";

// Event type display mapping
const eventTypeLabels: Record<string, string> = {
  combine: "Combine",
  camp: "Camp",
  tryout: "Tryout",
  testing_day: "Testing Day",
  custom: "Event",
};

interface InvitationCardProps {
  invitation: EventInvitationWithEvent;
  onDecline?: (token: string) => void;
  isDeclineLoading?: boolean;
}

export function InvitationCard({
  invitation,
  onDecline,
  isDeclineLoading = false,
}: InvitationCardProps) {
  const event = invitation.event;
  if (!event) return null;

  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;

  const formatDateRange = () => {
    if (!endDate || format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
      return format(startDate, "EEEE, MMMM d, yyyy");
    }
    return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
  };

  const eventTypeLabel = event.eventType ? eventTypeLabels[event.eventType] || "Event" : "Event";
  const expiresAt = new Date(invitation.expiresAt);
  const expiresInDays = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <Card className="border-amber-200 bg-amber-50/50 hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">{event.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                {eventTypeLabel}
              </Badge>
              <span className="text-sm text-amber-700">
                Invited
              </span>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <Clock className="inline-block h-4 w-4 mr-1" />
            In {formatDistanceToNow(startDate)}
          </div>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{formatDateRange()}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>{event.location}</span>
            </div>
          )}
          {expiresInDays <= 7 && (
            <div className="text-amber-600 text-xs mt-2">
              Expires in {expiresInDays} {expiresInDays === 1 ? 'day' : 'days'}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Link href={`/events/invite/${invitation.token}`}>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              Accept
            </Button>
          </Link>
          {onDecline && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => onDecline(invitation.token)}
              disabled={isDeclineLoading}
            >
              Decline
            </Button>
          )}
          <Link href={`/events/${event.id}`}>
            <Button variant="outline" size="sm">
              View Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
