/**
 * My Events - Athlete's view of their event registrations
 * Shows upcoming events they're registered for and past event results
 */

import { Link } from "wouter";
import { useMyEvents, useCancelRegistration } from "@/lib/events-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Calendar, MapPin, Clock, Search, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format, formatDistanceToNow, isFuture, isPast } from "date-fns";
import type { EventRegistration } from "@shared/schema";

// Extended registration type with event data
interface RegistrationWithEvent extends EventRegistration {
  event?: {
    id: string;
    name: string;
    startDate: string;
    endDate?: string | null;
    location?: string | null;
    status: string;
    resultsPublishedAt?: string | null;
  };
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  approved: {
    label: "Registered",
    icon: CheckCircle,
    className: "bg-green-100 text-green-700 border-green-300",
  },
  pending: {
    label: "Pending Approval",
    icon: AlertCircle,
    className: "bg-yellow-100 text-yellow-700 border-yellow-300",
  },
  waitlisted: {
    label: "Waitlisted",
    icon: Clock,
    className: "bg-orange-100 text-orange-700 border-orange-300",
  },
  checked_in: {
    label: "Checked In",
    icon: CheckCircle,
    className: "bg-blue-100 text-blue-700 border-blue-300",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle,
    className: "bg-purple-100 text-purple-700 border-purple-300",
  },
  declined: {
    label: "Declined",
    icon: XCircle,
    className: "bg-red-100 text-red-700 border-red-300",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-gray-100 text-gray-700 border-gray-300",
  },
};

function RegistrationCard({ registration, onCancel }: { registration: RegistrationWithEvent; onCancel?: (eventId: string) => void }) {
  const event = registration.event;
  if (!event) return null;

  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const isUpcoming = isFuture(startDate);
  const isPastEvent = isPast(endDate || startDate);

  const formatDateRange = () => {
    if (!endDate || format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
      return format(startDate, "EEEE, MMMM d, yyyy");
    }
    return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
  };

  const statusInfo = statusConfig[registration.status] || statusConfig.pending;
  const StatusIcon = statusInfo.icon;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">{event.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={statusInfo.className}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusInfo.label}
              </Badge>
              {registration.registrationNumber && (
                <span className="text-sm text-muted-foreground">
                  #{registration.registrationNumber}
                </span>
              )}
            </div>
          </div>
          {isUpcoming && (
            <div className="text-right text-sm text-muted-foreground">
              <Clock className="inline-block h-4 w-4 mr-1" />
              In {formatDistanceToNow(startDate)}
            </div>
          )}
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
        </div>

        <div className="flex gap-2">
          <Link href={`/events/${event.id}`}>
            <Button variant="outline" size="sm">
              View Details
            </Button>
          </Link>
          {isPastEvent && event.resultsPublishedAt && (
            <Link href={`/events/${event.id}/results`}>
              <Button variant="default" size="sm">
                View Results
              </Button>
            </Link>
          )}
          {isUpcoming && registration.status !== "cancelled" && onCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={() => onCancel(event.id)}
            >
              Cancel Registration
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyEvents() {
  const { data: registrations, isLoading } = useMyEvents();
  const { toast } = useToast();
  const cancelMutation = useCancelRegistration();

  // Handle cancel registration
  const handleCancelRegistration = async (eventId: string) => {
    if (!window.confirm("Are you sure you want to cancel your registration?")) {
      return;
    }

    try {
      await cancelMutation.mutateAsync(eventId);
      toast({
        title: "Registration Cancelled",
        description: "Your registration has been cancelled.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel registration",
      });
    }
  };

  // Type cast and filter registrations
  const typedRegistrations = (registrations as RegistrationWithEvent[]) || [];

  // Separate into upcoming and past
  const upcomingRegistrations = typedRegistrations.filter((r) => {
    if (!r.event) return false;
    const eventDate = new Date(r.event.endDate || r.event.startDate);
    return isFuture(eventDate) && r.status !== "cancelled" && r.status !== "declined";
  });

  const pastRegistrations = typedRegistrations.filter((r) => {
    if (!r.event) return false;
    const eventDate = new Date(r.event.endDate || r.event.startDate);
    return isPast(eventDate);
  });

  const pendingRegistrations = upcomingRegistrations.filter(
    (r) => r.status === "pending" || r.status === "waitlisted"
  );

  const confirmedRegistrations = upcomingRegistrations.filter(
    (r) => r.status === "approved" || r.status === "checked_in"
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">My Events</h1>
        <Link href="/events/join">
          <Button variant="outline">
            <Search className="h-4 w-4 mr-2" />
            Find Events
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Registrations */}
          {pendingRegistrations.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                Pending ({pendingRegistrations.length})
              </h2>
              <div className="grid gap-4">
                {pendingRegistrations.map((registration) => (
                  <RegistrationCard
                    key={registration.id}
                    registration={registration}
                    onCancel={handleCancelRegistration}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming Events */}
          {confirmedRegistrations.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-4">
                Upcoming Events ({confirmedRegistrations.length})
              </h2>
              <div className="grid gap-4">
                {confirmedRegistrations.map((registration) => (
                  <RegistrationCard
                    key={registration.id}
                    registration={registration}
                    onCancel={handleCancelRegistration}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Past Events */}
          {pastRegistrations.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-4 text-muted-foreground">
                Past Events ({pastRegistrations.length})
              </h2>
              <div className="grid gap-4">
                {pastRegistrations.map((registration) => (
                  <RegistrationCard key={registration.id} registration={registration} />
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {typedRegistrations.length === 0 && (
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Events Yet</h3>
                <p className="text-gray-600 text-center mb-4">
                  You haven't registered for any events yet. Find and join upcoming events!
                </p>
                <Link href="/events/join">
                  <Button>
                    <Search className="h-4 w-4 mr-2" />
                    Browse Events
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
