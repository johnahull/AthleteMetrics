/**
 * PersonalRecordsCard Component
 *
 * Displays all personal records for the athlete with:
 * - All personal bests for all measured metrics
 * - Improvement indicators
 * - Visual celebration for recent PRs (within 7 days)
 * - Confetti animation on mount for recent PRs
 * - Metric icons
 */

import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getMetricIcon } from '@/utils/athlete-metric-icons';

interface PersonalRecord {
  metric: string;
  displayName: string;
  value: number;
  units: string;
  date: string;
  isRecent: boolean; // Within 7 days
  improvement: number | null;
  improvementText: string | null;
}

interface PersonalRecordsCardProps {
  personalRecords: PersonalRecord[];
  showConfetti?: boolean;
}

export function PersonalRecordsCard({
  personalRecords,
  showConfetti = true,
}: PersonalRecordsCardProps) {
  const confettiTriggered = useRef(false);

  useEffect(() => {
    if (showConfetti && !confettiTriggered.current) {
      const hasRecentPR = personalRecords.some((pr) => pr.isRecent);

      if (hasRecentPR) {
        confettiTriggered.current = true;

        // Trigger confetti celebration with error handling
        try {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'],
          });
        } catch (error) {
          // Silently fail - confetti is non-critical enhancement
          console.warn('Failed to trigger confetti animation:', error);
        }
      }
    }
  }, [personalRecords, showConfetti]);

  if (personalRecords.length === 0) {
    return (
      <Card data-testid="personal-records-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-600" />
            Personal Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            data-testid="no-personal-records"
            className="text-center py-8 text-gray-500"
          >
            No personal records yet. Keep training!
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="personal-records-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-600" />
          <h2>Personal Records</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {personalRecords.map((pr) => (
            <div
              key={pr.metric}
              data-testid={`pr-card-${pr.metric}`}
              className="relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
            >
              {pr.isRecent && (
                <Badge
                  data-testid={`celebration-badge-${pr.metric}`}
                  className="absolute -top-2 -right-2 bg-green-500 text-white"
                >
                  New PR! 🎉
                </Badge>
              )}

              <div className="flex items-start gap-3">
                <div
                  data-testid={`metric-icon-${pr.metric}`}
                  className="mt-1"
                >
                  {getMetricIcon(pr.metric)}
                </div>

                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 mb-1">
                    {pr.displayName}
                  </h3>

                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-2xl font-bold text-gray-900">
                      {pr.value}{pr.units}
                    </span>
                  </div>

                  <p
                    data-testid={`pr-date-${pr.metric}`}
                    className="text-xs text-gray-500 mb-2"
                  >
                    {new Date(pr.date).toLocaleDateString()}
                  </p>

                  {pr.improvementText && (
                    <p
                      data-testid={`improvement-${pr.metric}`}
                      className="text-sm text-green-600 font-medium"
                    >
                      {pr.improvementText}
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
