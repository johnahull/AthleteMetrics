/**
 * MeasurementTimeline Component
 *
 * Displays a visual timeline of athlete measurements grouped by month/year.
 * Shows measurement progression over time with verification badges and notes.
 *
 * @example
 * // Basic usage with measurements
 * <MeasurementTimeline measurements={athleteMeasurements} />
 *
 * @example
 * // Loading state
 * <MeasurementTimeline measurements={[]} isLoading={true} />
 *
 * @example
 * // Empty state
 * <MeasurementTimeline measurements={[]} />
 *
 * Features:
 * - Chronological timeline (most recent first)
 * - Month/year grouping headers
 * - Verification badges (verified/unverified)
 * - Notes display (truncated if long)
 * - Loading skeleton state
 * - Empty state with helpful message
 * - Responsive design
 * - Timezone-safe date parsing
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { VerificationBadge } from './VerificationBadge';
import type { Measurement } from '@shared/schema';
import { useMetricLabels } from '@/hooks/use-metric-labels';

export interface MeasurementTimelineProps {
  measurements: Measurement[];
  isLoading?: boolean;
}

const MAX_NOTE_LENGTH = 120;

// Helper to parse date string as local date (avoiding timezone shifts)
function parseLocalDate(dateString: string): Date {
  // Validate date string format
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    console.warn(`Invalid date string format: ${dateString}`);
    return new Date(); // Fallback to current date
  }
  // Parse YYYY-MM-DD as local date to avoid UTC timezone issues
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper to format month/year header
function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

// Helper to format day
function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Helper to truncate notes
function truncateNote(note: string | null): string | null {
  if (!note) return null;
  if (note.length <= MAX_NOTE_LENGTH) return note;
  return note.substring(0, MAX_NOTE_LENGTH) + '...';
}

// Helper to group measurements by month/year
function groupMeasurementsByMonth(measurements: Measurement[]): Map<string, Measurement[]> {
  const groups = new Map<string, Measurement[]>();

  // Sort measurements by date descending (most recent first)
  const sorted = [...measurements].sort((a, b) => {
    return parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime();
  });

  for (const measurement of sorted) {
    const date = parseLocalDate(measurement.date);
    const monthYear = formatMonthYear(date);

    if (!groups.has(monthYear)) {
      groups.set(monthYear, []);
    }
    groups.get(monthYear)!.push(measurement);
  }

  return groups;
}

// Loading skeleton component
function TimelineLoadingSkeleton() {
  return (
    <div data-testid="timeline-loading-skeleton" className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} data-testid={`skeleton-item-${i}`} className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Card>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

// Empty state component
function TimelineEmptyState() {
  return (
    <div className="text-center py-12">
      <p className="text-gray-500 text-lg">
        No measurements yet. Start tracking your progress!
      </p>
    </div>
  );
}

export function MeasurementTimeline({
  measurements,
  isLoading = false,
}: MeasurementTimelineProps) {
  const { getLabel } = useMetricLabels();

  // Show loading skeleton
  if (isLoading) {
    return <TimelineLoadingSkeleton />;
  }

  // Show empty state
  if (measurements.length === 0) {
    return <TimelineEmptyState />;
  }

  // Group measurements by month
  const groupedMeasurements = groupMeasurementsByMonth(measurements);

  return (
    <div data-testid="measurement-timeline" className="space-y-8">
      {Array.from(groupedMeasurements.entries()).map(([monthYear, monthMeasurements]) => (
        <div key={monthYear} className="space-y-3">
          {/* Month/Year header */}
          <h3 className="text-lg font-semibold text-foreground sticky top-0 bg-background py-2">
            {monthYear}
          </h3>

          {/* Timeline for this month */}
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            {monthMeasurements.map((measurement) => {
              const date = parseLocalDate(measurement.date);
              const displayName = getLabel(measurement.metric);
              const truncatedNote = truncateNote(measurement.notes);

              return (
                <div
                  key={measurement.id}
                  data-testid={`measurement-card-${measurement.id}`}
                  className="relative"
                  aria-label={`${displayName} measurement on ${formatDay(date)}`}
                >
                  {/* Timeline dot */}
                  <div className="absolute -left-[21px] top-6 w-3 h-3 rounded-full bg-primary border-2 border-background" />

                  {/* Measurement card */}
                  <Card className="ml-4">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          {/* Metric name and date */}
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-foreground">
                              {displayName}
                            </h4>
                            <VerificationBadge
                              isVerified={measurement.isVerified}
                              size="sm"
                            />
                          </div>

                          {/* Date */}
                          <p className="text-sm text-muted-foreground mb-2">
                            {formatDay(date)}
                          </p>

                          {/* Notes */}
                          {truncatedNote && (
                            <p
                              data-testid={`measurement-note-${measurement.id}`}
                              className="text-sm text-muted-foreground mt-2"
                            >
                              {truncatedNote}
                            </p>
                          )}
                        </div>

                        {/* Value */}
                        <div className="text-right">
                          <span className="text-2xl font-bold text-foreground">
                            {measurement.value}{measurement.units}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
