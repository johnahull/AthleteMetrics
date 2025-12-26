/**
 * Event Edit - Edit an existing event
 * Uses the EventForm multi-step wizard with pre-filled data
 */

import { useLocation, useParams, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEvent, useUpdateEvent, addEventMetric } from "@/lib/events-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { EventForm, type EventFormData } from "@/components/events";
import { ArrowLeft, AlertCircle } from "lucide-react";
import type { EventStatus } from "@shared/schema";

export default function EventEdit() {
  const { eventId } = useParams<{ eventId: string }>();
  const [, navigate] = useLocation();
  const { organizationContext } = useAuth();
  const { toast } = useToast();

  // Fetch existing event data
  const { data: event, isLoading, error } = useEvent(eventId);
  const updateMutation = useUpdateEvent();

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !event) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href={eventId ? `/events/${eventId}` : "/events"}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-800">
              Event not found. The event may have been deleted or you may not have permission to edit it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (data: EventFormData, isDraft: boolean) => {
    try {
      // Extract selectedMetrics from form data
      // Note: In edit mode, metrics are managed via the Metrics tab on the detail page
      // We don't update metrics here to avoid conflicts
      const { selectedMetrics, ...formData } = data;

      const status: EventStatus = isDraft ? "draft" : event.status === "draft" ? "published" : event.status;
      const eventData = {
        ...formData,
        status,
        // Convert date strings to Date objects
        startDate: new Date(formData.startDate),
        endDate: formData.endDate ? new Date(formData.endDate) : null,
        registrationOpensAt: formData.registrationOpensAt ? new Date(formData.registrationOpensAt) : null,
        registrationClosesAt: formData.registrationClosesAt ? new Date(formData.registrationClosesAt) : null,
      };

      await updateMutation.mutateAsync({
        eventId: event.id,
        data: eventData,
      });

      toast({
        title: "Event Updated",
        description: "Your changes have been saved.",
      });

      // Navigate back to the event detail page
      navigate(`/events/${event.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update event",
      });
    }
  };

  const handleCancel = () => {
    navigate(`/events/${event.id}`);
  };

  // Prepare initial data for the form
  // Convert null values to undefined for form compatibility
  const initialData = {
    name: event.name,
    eventType: event.eventType || undefined,
    location: event.location || undefined,
    description: event.description || undefined,
    startDate: event.startDate,
    endDate: event.endDate || undefined,
    visibility: event.visibility,
    registrationMode: event.registrationMode,
    maxRegistrations: event.maxRegistrations || undefined,
    resultsVisibility: event.resultsVisibility,
    registrationOpensAt: event.registrationOpensAt || undefined,
    registrationClosesAt: event.registrationClosesAt || undefined,
    createdBy: event.createdBy || undefined,
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/events/${event.id}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Event
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Edit Event</h1>
        <p className="text-muted-foreground mt-1">
          Editing "{event.name}"
        </p>
      </div>

      {/* Event Form in Edit Mode */}
      <EventForm
        initialData={initialData}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={updateMutation.isPending}
        organizationId={event.organizationId || organizationContext || undefined}
        mode="edit"
      />
    </div>
  );
}
