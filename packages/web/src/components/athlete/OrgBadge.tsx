/**
 * OrgBadge Component
 *
 * Displays a badge indicating which organization a measurement came from.
 * Used in unified cross-organization views to distinguish data sources.
 * Supports consistent color coding per organization using hash-based colors.
 */

import { cn } from "@/lib/utils";
import { Building2, User } from "lucide-react";

interface OrgBadgeProps {
  organizationName: string;
  /** Optional org ID for consistent color assignment */
  organizationId?: string;
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

// Color palette for organization badges (consistent with design system)
const orgColorPalette = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-300' },
  { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-300' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-800 dark:text-purple-300' },
  { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-300' },
  { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-800 dark:text-pink-300' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-800 dark:text-cyan-300' },
  { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-300' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-800 dark:text-indigo-300' },
];

/**
 * Get consistent color for an organization based on its ID.
 * Uses a simple hash to ensure the same org always gets the same color.
 */
function getOrgColor(orgId?: string): typeof orgColorPalette[number] {
  if (!orgId) {
    return orgColorPalette[0]; // Default to blue
  }
  const hash = orgId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return orgColorPalette[hash % orgColorPalette.length];
}

export function OrgBadge({ organizationName, organizationId, className, size = 'sm' }: OrgBadgeProps) {
  const colors = getOrgColor(organizationId);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        colors.bg,
        colors.text,
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

/**
 * PersonalBadge Component
 *
 * Displays a badge for self-entered/personal measurements (no organization).
 */
interface PersonalBadgeProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PersonalBadge({ className, size = 'sm' }: PersonalBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        sizeClasses[size],
        className
      )}
    >
      <User className={iconSizes[size]} />
      <span>Personal</span>
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
