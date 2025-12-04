/**
 * VerificationBadge Component
 *
 * Displays verification status for athlete measurements:
 * - Official: Entered or approved by a coach (green badge with checkmark)
 * - Self-entered: Entered by the athlete (amber badge)
 *
 * @example
 * // Default usage (medium size with label)
 * <VerificationBadge isVerified={true} />
 * <VerificationBadge isVerified={false} />
 *
 * @example
 * // Icon only (no label)
 * <VerificationBadge isVerified={true} showLabel={false} />
 *
 * @example
 * // Small size variant
 * <VerificationBadge isVerified={true} size="sm" />
 *
 * @example
 * // In a measurement card
 * <div className="flex items-center gap-2">
 *   <span className="font-semibold">10-yard fly: 1.52s</span>
 *   <VerificationBadge isVerified={measurement.isVerified} size="sm" />
 * </div>
 */

import { cn } from "@/lib/utils";
import { CheckCircle, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface VerificationBadgeProps {
  isVerified: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  sm: 'text-xs px-1.5 py-0.5 gap-1',
  md: 'text-sm px-2 py-0.5 gap-1.5',
};

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
};

export function VerificationBadge({
  isVerified,
  showLabel = true,
  size = 'md',
  className,
}: VerificationBadgeProps) {
  const Icon = isVerified ? CheckCircle : AlertTriangle;
  const label = isVerified ? 'Official' : 'Self-entered';
  const ariaLabel = isVerified
    ? 'Official - entered or approved by coach'
    : 'Self-entered by athlete';
  const tooltipText = isVerified
    ? 'This measurement was entered or approved by a coach'
    : 'This measurement was entered by you';

  const badgeClasses = cn(
    "inline-flex items-center rounded-full font-medium",
    isVerified
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    sizeClasses[size],
    className
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="status"
            aria-label={ariaLabel}
            className={badgeClasses}
          >
            <Icon
              className={iconSizes[size]}
              data-testid={isVerified ? 'check-circle-icon' : 'alert-triangle-icon'}
              aria-hidden="true"
            />
            {showLabel && <span>{label}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
