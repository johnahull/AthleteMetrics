/**
 * PeerComparisonCard Component
 *
 * Phase 2.3: Displays peer comparison percentiles for an athlete on their dashboard.
 * Shows the athlete's ranking compared to similar athletes globally.
 *
 * Privacy Model: All athlete data contributes to the anonymous peer pool.
 * The showPeerComparisons preference only controls whether the athlete
 * sees comparison results - not whether their data is included.
 *
 * Features:
 * - Top percentiles for measured metrics
 * - Visual percentile indicators
 * - Link to full /my-peer-comparison page
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  TrendingUp,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { Link } from 'wouter';
import {
  usePeerPercentiles,
  usePeerComparisonStatus,
  getPercentileLabel,
  type PercentileResult,
} from '@/hooks/usePeerComparison';
import { useMetricLabels } from '@/hooks/use-metric-labels';

interface PeerComparisonCardProps {
  userId: string;
  athleteId: string;
  availableMetrics: string[];
  compact?: boolean;
}

/**
 * Visual indicator for percentile ranking
 */
function PercentileIndicator({ percentile }: { percentile: number }) {
  const label = getPercentileLabel(percentile);

  // Color for progress bar based on percentile
  let progressColor = 'bg-orange-500';
  if (percentile >= 90) progressColor = 'bg-purple-600';
  else if (percentile >= 75) progressColor = 'bg-blue-600';
  else if (percentile >= 50) progressColor = 'bg-green-500';
  else if (percentile >= 25) progressColor = 'bg-yellow-500';

  if (percentile < 0) {
    return (
      <span className="text-xs text-gray-400">Insufficient data</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${progressColor} transition-all`}
          style={{ width: `${Math.max(percentile, 5)}%` }}
        />
      </div>
      <Badge
        variant="secondary"
        className={`text-xs font-medium ${label.colorClass} bg-opacity-10 whitespace-nowrap`}
      >
        {label.label}
      </Badge>
    </div>
  );
}

/**
 * Single metric row display
 */
function MetricPercentileRow({ result }: { result: PercentileResult }) {
  const { getLabel } = useMetricLabels();
  const displayName = getLabel(result.metric);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{displayName}</span>
        {result.percentile >= 0 && (
          <span className="text-xs text-gray-500">
            {Math.round(result.percentile)}%ile
          </span>
        )}
      </div>
      <PercentileIndicator percentile={result.percentile} />
    </div>
  );
}

/**
 * Loading skeleton
 */
function PeerComparisonSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : 'pb-3'}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5 text-blue-600" />
          <span>How You Compare</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Hidden state card - when user has chosen to hide peer comparisons
 */
function HiddenStateCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5 text-gray-400" />
          <span>Peer Comparisons</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-4">
          <EyeOff className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h3 className="font-medium text-gray-700 mb-2">Comparisons Hidden</h3>
          <p className="text-sm text-gray-500 mb-4 max-w-xs mx-auto">
            You've hidden peer comparisons. Enable them in your profile settings.
          </p>
          <Link href="/my-profile">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" />
              Profile Settings
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Main PeerComparisonCard component
 */
export function PeerComparisonCard({
  userId,
  athleteId,
  availableMetrics,
  compact = false,
}: PeerComparisonCardProps) {
  // Check opt-in status
  const { data: peerStatus, isLoading: statusLoading } = usePeerComparisonStatus(userId);

  // Fetch percentiles (only if opted in)
  const metricsToFetch = useMemo(() => {
    // Limit to top metrics for dashboard display
    return availableMetrics.slice(0, compact ? 3 : 5);
  }, [availableMetrics, compact]);

  const {
    data: percentilesData,
    isLoading: percentilesLoading,
    isError,
    error,
  } = usePeerPercentiles(
    athleteId,
    metricsToFetch,
    undefined, // No filters for dashboard summary
    { enabled: peerStatus?.optedIn === true }
  );

  // Loading state
  if (statusLoading || (peerStatus?.optedIn && percentilesLoading)) {
    return <PeerComparisonSkeleton compact={compact} />;
  }

  // Display preference off - user chose to hide comparisons
  if (!peerStatus?.optedIn) {
    return <HiddenStateCard />;
  }

  // Error state
  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span>Comparison Error</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            {error?.message || 'Unable to load peer comparisons'}
          </p>
        </CardContent>
      </Card>
    );
  }

  // No percentiles available (no metrics measured)
  if (!percentilesData?.percentiles || percentilesData.percentiles.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            <span>How You Compare</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <TrendingUp className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              Once you have measurements, you'll see how you compare to peers here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort percentiles by value (highest first) to show best rankings
  const sortedPercentiles = [...percentilesData.percentiles]
    .filter(p => p.percentile >= 0) // Exclude insufficient data
    .sort((a, b) => b.percentile - a.percentile);

  // Get best percentile for highlight
  const bestPercentile = sortedPercentiles[0];
  const bestLabel = bestPercentile ? getPercentileLabel(bestPercentile.percentile) : null;

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : 'pb-3'}>
        <div className="flex items-center justify-between">
          <CardTitle className={`flex items-center gap-2 ${compact ? 'text-base' : 'text-lg'}`}>
            <Users className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-blue-600`} />
            <span>How You Compare</span>
          </CardTitle>
          {bestPercentile && !compact && (
            <Badge variant="secondary" className={`${bestLabel?.colorClass} text-xs`}>
              Best: {bestLabel?.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metrics list */}
        <div className="space-y-3">
          {sortedPercentiles.slice(0, compact ? 3 : 5).map((result) => (
            <MetricPercentileRow key={result.metric} result={result} />
          ))}
        </div>

        {/* Sample size info */}
        {bestPercentile && (
          <p className="text-xs text-gray-400 text-center">
            Compared to {bestPercentile.sampleSize.toLocaleString()} similar athletes
          </p>
        )}

        {/* Link to full peer comparison page */}
        {!compact && (
          <div className="pt-2 border-t border-gray-100">
            <Link href="/my-peer-comparison">
              <Button variant="ghost" size="sm" className="w-full text-gray-600 hover:text-gray-900">
                View all comparisons
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
