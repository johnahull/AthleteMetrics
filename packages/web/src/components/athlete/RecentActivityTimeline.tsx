/**
 * RecentActivityTimeline Component
 *
 * Displays last 5 measurements in timeline format with:
 * - Date, metric icon, value display
 * - Simple insights for each measurement
 * - Timeline connector visual
 * - Mobile-responsive design
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { getMetricIcon } from '@/utils/athlete-metric-icons';

interface TimelineActivity {
  id: string;
  date: string;
  metric: string;
  displayName: string;
  value: number;
  units: string;
  insight: string | null;
  insightType: 'pr' | 'improvement' | 'consistent' | null;
}

interface RecentActivityTimelineProps {
  activities: TimelineActivity[];
  compact?: boolean;
  maxItems?: number;
}

// Insight type styling
const getInsightClass = (insightType: string | null) => {
  switch (insightType) {
    case 'pr':
      return 'text-green-600 font-medium';
    case 'improvement':
      return 'text-blue-600 font-medium';
    case 'consistent':
      return 'text-gray-600';
    default:
      return 'text-gray-500';
  }
};

export function RecentActivityTimeline({
  activities,
  compact = false,
  maxItems,
}: RecentActivityTimelineProps) {
  const limit = maxItems ?? (compact ? 3 : 5);
  const displayActivities = activities.slice(0, limit);
  const hasMore = activities.length > limit;

  if (displayActivities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-600" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            data-testid="no-recent-activity"
            className="text-center py-8 text-gray-500"
          >
            No recent activity. Start recording measurements!
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : ''}>
        <CardTitle className="flex items-center gap-2">
          <Clock className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-gray-600`} />
          <span className={compact ? 'text-base' : ''}>Recent Activity</span>
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? 'pt-0' : ''}>
        <div
          data-testid="recent-activity-timeline"
          className={`flex flex-col ${compact ? 'space-y-2' : 'space-y-4'}`}
        >
          {displayActivities.map((activity, index) => (
            <div key={activity.id}>
              {compact ? (
                /* Compact mode: single line per activity */
                <div
                  data-testid={`activity-${activity.id}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                    {getMetricIcon(activity.metric)}
                  </div>
                  <span className="text-gray-500">
                    {new Date(activity.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-gray-400">-</span>
                  <span className="text-gray-700 font-medium truncate">
                    {activity.displayName}
                  </span>
                  {activity.insight && (
                    <span className={`${getInsightClass(activity.insightType)} truncate`}>
                      {activity.insight}
                    </span>
                  )}
                </div>
              ) : (
                /* Full mode: expanded layout with timeline connectors */
                <div
                  data-testid={`activity-${activity.id}`}
                  className="flex gap-4 items-start"
                >
                  {/* Timeline dot and connector */}
                  <div className="flex flex-col items-center">
                    <div
                      data-testid={`metric-icon-${activity.id}`}
                      className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 border-2 border-gray-300"
                    >
                      {getMetricIcon(activity.metric)}
                    </div>
                    {index < displayActivities.length - 1 && (
                      <div
                        data-testid={`timeline-connector-${index}`}
                        className="w-0.5 h-full min-h-[40px] bg-gray-300 my-1"
                      />
                    )}
                  </div>

                  {/* Activity content */}
                  <div className="flex-1 pb-2">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {activity.displayName}
                        </h4>
                        <p
                          data-testid={`activity-date-${activity.id}`}
                          className="text-sm text-gray-500"
                        >
                          {new Date(activity.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-gray-900">
                          {activity.value}{activity.units}
                        </span>
                      </div>
                    </div>

                    {activity.insight && (
                      <p
                        data-testid={`insight-${activity.id}`}
                        className={`text-sm ${getInsightClass(activity.insightType)}`}
                      >
                        {activity.insight}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* View more link */}
        {hasMore && (
          <div className="text-center pt-3 border-t border-gray-100 mt-3">
            <span className="text-sm text-blue-600 cursor-pointer hover:underline">
              View all {activities.length} activities
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
