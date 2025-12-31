/**
 * Event Results Page
 *
 * Displays event results for athletes. Shows:
 * - Event header (name, date, location)
 * - Athlete's own measurement results
 * - Visibility checks (results may not be available yet)
 * - Link back to event detail page
 */

import { useParams, Link } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useEvent, useResultsVisible, useEventMeasurements } from '@/lib/events-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, ArrowLeft, Calendar, MapPin } from 'lucide-react';
import { format } from 'date-fns';

export default function EventResults() {
  const { eventId } = useParams();
  const { user } = useAuth();

  // Fetch event details
  const {
    data: event,
    isLoading: eventLoading,
    error: eventError,
  } = useEvent(eventId);

  // Check if results are visible
  const {
    data: visibilityStatus,
    isLoading: visibilityLoading,
  } = useResultsVisible(eventId);

  // Fetch athlete's own measurements (filtered by userId)
  const {
    data: measurements = [],
    isLoading: measurementsLoading,
  } = useEventMeasurements(eventId, { userId: user?.id });

  // Loading state
  if (eventLoading || visibilityLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading event results...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (eventError || !event) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Event</h2>
          <p className="text-gray-500 mb-4">
            {eventError?.message || 'Unable to load event details'}
          </p>
          <Link href="/my-events">
            <Button variant="outline">Back to My Events</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Check visibility - athletes can always see their own results
  const canViewResults = visibilityStatus?.visible || visibilityStatus?.canViewOwnResults;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div>
        <Link href={`/events/${eventId}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Event
          </Button>
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{event.name}</h1>

        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{format(new Date(event.startDate), 'EEEE, MMMM d, yyyy')}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>{event.location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Results Content */}
      {!canViewResults ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Results Not Available</h3>
              <p className="text-gray-500">
                Event results have not been published yet. Check back later.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your Results</CardTitle>
          </CardHeader>
          <CardContent>
            {measurementsLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
                <p className="text-gray-500">Loading results...</p>
              </div>
            ) : measurements.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Yet</h3>
                <p className="text-gray-500">
                  You don't have any recorded measurements for this event.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {measurements.map((measurement) => (
                  <div
                    key={measurement.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {measurement.metricLabel || measurement.metric}
                      </h4>
                      {measurement.notes && (
                        <p className="text-sm text-gray-500 mt-1">{measurement.notes}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {measurement.value}
                      </div>
                      <div className="text-sm text-gray-500">
                        {measurement.metricUnits || ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
