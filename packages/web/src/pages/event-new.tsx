/**
 * Event New - Create a new event page
 * Uses the EventForm multi-step wizard
 */

import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useCreateEvent } from "@/lib/events-api";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { EventForm } from "@/components/events";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function EventNew() {
  const [, navigate] = useLocation();
  const { organizationContext, userOrganizations, user } = useAuth();
  const { toast } = useToast();
  const createMutation = useCreateEvent();

  // Get effective organization ID
  const getEffectiveOrganizationId = () => {
    if (organizationContext) return organizationContext;
    const isSiteAdmin = user?.isSiteAdmin || false;
    if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
      return userOrganizations[0].organizationId;
    }
    return null;
  };

  const effectiveOrganizationId = getEffectiveOrganizationId();

  if (!effectiveOrganizationId) {
    return (
      <div className="p-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              Please select an organization to create an event.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (data: any, isDraft: boolean) => {
    try {
      const eventData = {
        ...data,
        organizationId: effectiveOrganizationId,
        status: isDraft ? "draft" : "published",
        // Convert date strings to Date objects
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        registrationOpensAt: data.registrationOpensAt ? new Date(data.registrationOpensAt) : null,
        registrationClosesAt: data.registrationClosesAt ? new Date(data.registrationClosesAt) : null,
      };

      const event = await createMutation.mutateAsync(eventData);

      toast({
        title: isDraft ? "Draft Saved" : "Event Created",
        description: isDraft
          ? "Your event has been saved as a draft."
          : "Your event has been published and is now live.",
      });

      // Navigate to the event detail page
      navigate(`/events/${event.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create event",
      });
    }
  };

  const handleCancel = () => {
    navigate("/events");
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/events">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Events
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Create New Event</h1>
        <p className="text-muted-foreground mt-1">
          Set up a combine, camp, testing day, or other athletic event
        </p>
      </div>

      {/* Event Form */}
      <EventForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}
