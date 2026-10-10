/**
 * Event New - Create a new event page
 * Uses the EventForm multi-step wizard
 */

import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useCreateEvent, addEventMetricsBulk, type BulkAddEventMetricsResult } from "@/lib/events-api";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { EventForm, type EventFormData } from "@/components/events";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import type { EventStatus } from "@shared/schema";

/** The server accepts at most this many metrics per request; longer lists go in sequential batches */
const METRICS_BATCH_SIZE = 100;

const SKIP_REASON_TEXT: Record<BulkAddEventMetricsResult["skipped"][number]["reason"], string> = {
  derived: "calculated automatically",
  inactive: "not available",
  unknown: "not available",
  unavailable: "not available",
};

/** "Not added: Momentum (calculated automatically), Old test (not available)." */
function describeSkipped(skipped: BulkAddEventMetricsResult["skipped"], labelFor: (code: string) => string): string {
  if (skipped.length === 0) return "";
  return ` Not added: ${skipped.map((s) => `${labelFor(s.metricCode)} (${SKIP_REASON_TEXT[s.reason]})`).join(", ")}.`;
}

export default function EventNew() {
  const [, navigate] = useLocation();
  const { organizationContext, userOrganizations, user } = useAuth();
  const { toast } = useToast();
  const createMutation = useCreateEvent();
  // True from the first click until the whole sequence (create event, then save its metrics) is over
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

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

  const handleSubmit = async (data: EventFormData, isDraft: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      // Extract selectedMetrics (saved after the event exists) from the event fields
      const { selectedMetrics, ...formData } = data;

      const status: EventStatus = isDraft ? "draft" : "published";
      const eventData = {
        ...formData,
        organizationId: effectiveOrganizationId,
        status,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Default to browser timezone
        // Convert date strings to Date objects
        startDate: new Date(formData.startDate),
        endDate: formData.endDate ? new Date(formData.endDate) : null,
        registrationOpensAt: formData.registrationOpensAt ? new Date(formData.registrationOpensAt) : null,
        registrationClosesAt: formData.registrationClosesAt ? new Date(formData.registrationClosesAt) : null,
      };

      // Create the event first
      const event = await createMutation.mutateAsync(eventData);

      // Then save the final metrics list (typed by hand and/or filled by a template) in ONE request, in list order
      let added = 0;
      const skipped: BulkAddEventMetricsResult["skipped"] = [];
      if (selectedMetrics && selectedMetrics.length > 0) {
        const payload = selectedMetrics.map((metric, index) => ({
          metricCode: metric.code,
          isRequired: metric.isRequired,
          displayOrder: index,
          ...(metric.customLabel ? { customLabel: metric.customLabel } : {}),
        }));
        for (let start = 0; start < payload.length; start += METRICS_BATCH_SIZE) {
          try {
            const result = await addEventMetricsBulk(event.id, payload.slice(start, start + METRICS_BATCH_SIZE));
            added += result.added.length;
            skipped.push(...result.skipped);
          } catch (metricsError) {
            // The event exists: say so and why its tests were not (all) added, in the one toast, and go to the event
            const message = metricsError instanceof Error ? metricsError.message : "The tests could not be added.";
            toast({
              variant: "destructive",
              title: `${isDraft ? "Draft saved" : "Event created"}, ${added > 0 ? "some tests" : "tests"} not added`,
              description: added > 0 ? `${added} ${added === 1 ? "test was" : "tests were"} added. ${message}` : message,
            });
            navigate(`/events/${event.id}`);
            return;
          }
        }
      }
      const skippedNote = describeSkipped(skipped, (code) => selectedMetrics?.find((m) => m.code === code)?.label ?? code);

      toast({
        title: isDraft ? "Draft Saved" : "Event Created",
        description: `${
          isDraft
            ? "Your event has been saved as a draft."
            : `Your event has been ${added ? `created with ${added} ${added === 1 ? "metric" : "metrics"}` : "published"}.`
        }${skippedNote}`,
      });

      // Navigate to the event detail page
      navigate(`/events/${event.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create event",
      });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
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
        isSubmitting={createMutation.isPending || submitting}
        organizationId={effectiveOrganizationId}
      />
    </div>
  );
}
