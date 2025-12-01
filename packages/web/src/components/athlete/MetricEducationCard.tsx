/**
 * MetricEducationCard Component
 * Week 3: Metric Education & Context
 *
 * Displays educational content about a performance metric including:
 * - What the metric measures
 * - Why it matters for athletic performance
 * - How to improve (expandable)
 * - Sport-specific relevance
 */

import React, { useState, useId } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronUp,
  Info,
  TrendingUp,
  TrendingDown,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMetricEducation } from '@/utils/metric-education-utils';

interface MetricEducationCardProps {
  metric: string;
  compact?: boolean;
  onClick?: (metric: string) => void;
}

export function MetricEducationCard({
  metric,
  compact = false,
  onClick,
}: MetricEducationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  const education = getMetricEducation(metric);

  // Handle unknown metric
  if (!education) {
    return (
      <Card
        data-testid="metric-education-card"
        className="border-red-200 bg-red-50"
        aria-label="Unknown metric"
      >
        <CardContent className="pt-4">
          <p className="text-red-600 text-sm">Unknown metric: {metric}</p>
        </CardContent>
      </Card>
    );
  }

  const handleCardClick = (e: React.MouseEvent) => {
    // Only trigger onClick if it's provided and click wasn't on a button
    if (onClick && !(e.target as HTMLElement).closest('button')) {
      onClick(metric);
    }
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsExpanded(!isExpanded);
    }
  };

  // Compact mode - minimal display
  if (compact) {
    return (
      <Card
        data-testid="metric-education-card"
        className={cn('compact', onClick && 'cursor-pointer hover:shadow-md')}
        aria-label={`${education.name} education card`}
        onClick={handleCardClick}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-500" />
            <h3>{education.name}</h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-gray-600 line-clamp-2">
            {education.description}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Measured in {education.unit || 'units'} •{' '}
            {education.lowerIsBetter ? 'Lower is better' : 'Higher is better'}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Full mode
  return (
    <Card
      data-testid="metric-education-card"
      className={cn(
        'transition-shadow',
        onClick && 'cursor-pointer hover:shadow-md'
      )}
      aria-label={`${education.name} education card`}
      onClick={handleCardClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-500" />
            <h3>{education.name}</h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              education.lowerIsBetter
                ? 'border-green-500 text-green-700'
                : 'border-blue-500 text-blue-700'
            )}
          >
            {education.lowerIsBetter ? (
              <>
                <TrendingDown className="h-3 w-3 mr-1" />
                Lower is better/faster
              </>
            ) : (
              <>
                <TrendingUp className="h-3 w-3 mr-1" />
                Higher is better
              </>
            )}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description */}
        <div>
          <p className="text-gray-700">{education.description}</p>
          <p className="text-sm text-gray-500 mt-1">
            Measured in {education.unit || 'units'}
          </p>
        </div>

        {/* Why It Matters */}
        <div className="bg-blue-50 rounded-lg p-3">
          <h4 className="font-medium text-blue-900 mb-1 text-sm">
            Why It Matters
          </h4>
          <p className="text-sm text-blue-800">{education.whyItMatters}</p>
        </div>

        {/* Sport Relevance */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Relevant Sports
          </h4>
          <div className="flex flex-wrap gap-1">
            {education.sportRelevance.map((sport) => (
              <Badge key={sport} variant="secondary" className="text-xs">
                {sport}
              </Badge>
            ))}
          </div>
        </div>

        {/* Expandable: How to Improve */}
        <div className="border-t pt-3">
          <Button
            variant="ghost"
            className="w-full justify-between p-2 h-auto"
            onClick={handleExpandClick}
            onKeyDown={handleKeyDown}
            aria-expanded={isExpanded}
            aria-controls={contentId}
          >
            <span className="font-medium text-gray-700">How to Improve</span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {isExpanded && (
            <div
              id={contentId}
              className="mt-2 pl-2 animate-in slide-in-from-top-2 duration-200"
            >
              <ul className="space-y-2">
                {education.howToImprove.map((tip, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-gray-600"
                  >
                    <span className="bg-green-100 text-green-800 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
