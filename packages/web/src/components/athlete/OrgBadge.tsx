/**
 * OrgBadge Component
 *
 * Displays a badge indicating which organization a measurement came from.
 * Used in unified cross-organization views to distinguish data sources.
 */

import { cn } from "@/lib/utils";
import { Building2 } from "lucide-react";

interface OrgBadgeProps {
  organizationName: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-0.5',
  lg: 'text-sm px-2.5 py-1',
};

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
};

export function OrgBadge({ organizationName, className, size = 'sm' }: OrgBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
        sizeClasses[size],
        className
      )}
    >
      <Building2 className={iconSizes[size]} />
      <span className="truncate max-w-[120px]" title={organizationName}>
        {organizationName}
      </span>
    </span>
  );
}

interface MultiOrgBadgeProps {
  organizations: Array<{ id: string; name: string }>;
  className?: string;
  maxVisible?: number;
}

export function MultiOrgBadge({ organizations, className, maxVisible = 2 }: MultiOrgBadgeProps) {
  if (organizations.length === 0) {
    return null;
  }

  const visibleOrgs = organizations.slice(0, maxVisible);
  const hiddenCount = organizations.length - maxVisible;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {visibleOrgs.map((org) => (
        <OrgBadge key={org.id} organizationName={org.name} />
      ))}
      {hiddenCount > 0 && (
        <span className="text-xs text-muted-foreground">
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}
