/**
 * Collapsible Legend Component
 *
 * Provides a collapsible section for chart legends to improve UX
 * when dealing with many athletes or metrics.
 */

import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CollapsibleLegendProps {
  /** Title for the legend section */
  title: string;
  /** Content to display inside the collapsible section */
  children: React.ReactNode;
  /** Whether the section is initially expanded */
  defaultExpanded?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
  /** Whether to show item count in title */
  itemCount?: number;
}

export const CollapsibleLegend = React.memo(function CollapsibleLegend({
  title,
  children,
  defaultExpanded = true,
  className = '',
  itemCount
}: CollapsibleLegendProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const displayTitle = itemCount !== undefined ? `${title} (${itemCount})` : title;

  return (
    <div className={className}>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleExpanded}
        className="flex items-center justify-between w-full p-0 h-auto text-sm font-medium mb-2 hover:bg-transparent"
        aria-expanded={isExpanded}
        aria-controls={`legend-content-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <span>{displayTitle}</span>
        {isExpanded ? (
          <ChevronUpIcon className="h-4 w-4" />
        ) : (
          <ChevronDownIcon className="h-4 w-4" />
        )}
      </Button>

      <div
        id={`legend-content-${title.toLowerCase().replace(/\s+/g, '-')}`}
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
        aria-hidden={!isExpanded}
      >
        <div className="space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
});

export default CollapsibleLegend;