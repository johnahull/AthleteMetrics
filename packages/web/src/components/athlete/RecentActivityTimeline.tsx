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
import { Zap, TrendingUp, Timer, Activity, Clock } from 'lucide-react';

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
}

// Metric icon mapping
const getMetricIcon = (metric: string) => {
  switch (metric) {
    case 'FLY10_TIME':
      return <Zap className="h-5 w-5 text-blue-600" />;
    case 'VERTICAL_JUMP':
      return <TrendingUp className="h-5 w-5 text-green-600" />;
    case 'DASH_40YD':
      return <Timer className="h-5 w-5 text-purple-600" />;
    default:
      return <Activity className="h-5 w-5 text-gray-600" />;
  }
};

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

export function RecentActivityTimeline({ activities }: RecentActivityTimelineProps) {
  const displayActivities = activities.slice(0, 5);

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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-600" />
          <h2>Recent Activity</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          data-testid="recent-activity-timeline"
          className="flex flex-col space-y-4"
        >
          {displayActivities.map((activity, index) => (
            <div key={activity.id}>
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
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
