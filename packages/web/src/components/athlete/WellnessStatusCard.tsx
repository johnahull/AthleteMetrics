/**
 * WellnessStatusCard Component
 *
 * Displays wellness status for athlete with:
 * - Last submission date
 * - Flagged concerns from last submission
 * - Overall status indicator (red/yellow/green)
 * - Link to wellness submissions page
 * - Conditional rendering based on wellness enabled flag
 */

import React from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface FlaggedConcern {
  question: string;
  answer: string;
}

interface WellnessData {
  lastSubmissionDate: string;
  flaggedConcerns: FlaggedConcern[];
  overallStatus: 'red' | 'yellow' | 'green';
}

interface WellnessStatusCardProps {
  wellnessEnabled: boolean;
  wellnessData: WellnessData | null;
}

export function WellnessStatusCard({
  wellnessEnabled,
  wellnessData,
}: WellnessStatusCardProps) {
  // Don't render if wellness is not enabled
  if (!wellnessEnabled) {
    return null;
  }

  const getStatusBadge = (status: 'red' | 'yellow' | 'green') => {
    switch (status) {
      case 'red':
        return (
          <Badge
            data-testid="status-badge"
            className="bg-red-100 text-red-700 hover:bg-red-100"
          >
            <AlertCircle className="h-3 w-3 mr-1" />
            Needs Attention
          </Badge>
        );
      case 'yellow':
        return (
          <Badge
            data-testid="status-badge"
            className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100"
          >
            <AlertCircle className="h-3 w-3 mr-1" />
            Monitor
          </Badge>
        );
      case 'green':
        return (
          <Badge
            data-testid="status-badge"
            className="bg-green-100 text-green-700 hover:bg-green-100"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Good
          </Badge>
        );
    }
  };

  const formatLastSubmission = () => {
    if (!wellnessData || !wellnessData.lastSubmissionDate) {
      return 'Never';
    }

    try {
      return formatDistanceToNow(new Date(wellnessData.lastSubmissionDate), {
        addSuffix: true,
      });
    } catch (error) {
      return new Date(wellnessData.lastSubmissionDate).toLocaleDateString();
    }
  };

  const concernCount = wellnessData?.flaggedConcerns?.length || 0;
  const displayConcerns = wellnessData?.flaggedConcerns?.slice(0, 3) || [];
  const moreConcerns = concernCount - displayConcerns.length;

  return (
    <Card data-testid="wellness-status-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            <h2>Wellness Status</h2>
          </CardTitle>
          {wellnessData && getStatusBadge(wellnessData.overallStatus)}
        </div>
      </CardHeader>
      <CardContent>
        {!wellnessData ? (
          <div className="space-y-4">
            <p className="text-gray-600">
              No wellness submissions yet. Submit your first wellness check to get
              started!
            </p>
            <Button
              asChild
              className="w-full"
              data-testid="wellness-link"
              aria-label="Submit your first wellness check"
            >
              <Link href="/wellness/my-requests">
                Submit Wellness
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Last Submission</p>
              <p
                data-testid="last-submission-date"
                className="font-medium text-gray-900"
              >
                {formatLastSubmission()}
              </p>
            </div>

            <div>
              <p
                data-testid="concern-count"
                className="text-sm text-gray-600 mb-2"
              >
                {concernCount === 0
                  ? 'No concerns flagged'
                  : concernCount === 1
                    ? '1 concern flagged'
                    : `${concernCount} concerns flagged`}
              </p>

              {displayConcerns.length > 0 && (
                <div className="space-y-2">
                  {displayConcerns.map((concern, index) => (
                    <div
                      key={index}
                      className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {concern.question}
                      </p>
                      <p className="text-sm text-gray-600">{concern.answer}</p>
                    </div>
                  ))}
                  {moreConcerns > 0 && (
                    <p className="text-sm text-gray-500 text-center">
                      +{moreConcerns} more
                    </p>
                  )}
                </div>
              )}
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full"
              data-testid="wellness-link"
              aria-label="View wellness submission history"
            >
              <Link href="/wellness/my-requests">
                View History
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
