/**
 * Organization Type Selector Component
 * Provides a reusable dropdown for selecting organization types with proper labels
 * 
 * @fileoverview Enhanced organization type selector with improved performance,
 * accessibility, and consistent styling. Uses centralized utilities for
 * better maintainability and type safety.
 */

import React, { useMemo } from 'react';
import {
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { organizationTypeEnum } from '@shared/schema';
import type { ControllerRenderProps } from 'react-hook-form';
import {
  getOrganizationTypeOptions,
  getOrganizationTypeLabel as getOrgTypeLabel,
  getOrganizationTypeColors,
  type OrganizationType,
  ORGANIZATION_TYPE_LABELS,
} from '@shared/organization-type-utils';

// Re-export for backward compatibility
export { ORGANIZATION_TYPE_LABELS };

interface OrganizationTypeSelectorProps {
  field: ControllerRenderProps<any, 'orgType'>;
  disabled?: boolean;
  showDescription?: boolean;
  /** Optional filter to include only specific organization types */
  includeTypes?: OrganizationType[];
  /** Optional filter to exclude specific organization types */
  excludeTypes?: OrganizationType[];
  /** Custom placeholder text */
  placeholder?: string;
  /** Show descriptions as tooltips in select items */
  showOptionDescriptions?: boolean;
  /** Custom label for the form field */
  label?: string;
}

/**
 * Enhanced organization type selector component
 * 
 * Features:
 * - Performance optimized with useMemo
 * - Filtering support for includeTypes/excludeTypes
 * - Consistent styling with centralized color scheme
 * - Accessibility improvements
 * - Optional tooltips with descriptions
 * 
 * @param props - Component props
 * @returns JSX element for organization type selection
 */
export function OrganizationTypeSelector({
  field,
  disabled = false,
  showDescription = true,
  includeTypes,
  excludeTypes,
  placeholder = 'Select organization type',
  showOptionDescriptions = false,
  label = 'Organization Type',
}: OrganizationTypeSelectorProps) {
  // Memoize options to prevent unnecessary re-renders
  const organizationOptions = useMemo(() => {
    return getOrganizationTypeOptions(includeTypes, excludeTypes);
  }, [includeTypes, excludeTypes]);

  // Memoize color classes to avoid string manipulation on every render
  const colorMap = useMemo(() => {
    const map = new Map<OrganizationType, string>();
    organizationOptions.forEach(({ value }) => {
      const colors = getOrganizationTypeColors(value);
      // Pre-compute the background color class
      map.set(value, colors.replace('text-', 'bg-').split(' ')[0]);
    });
    return map;
  }, [organizationOptions]);

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      {showDescription && (
        <FormDescription>
          Select the type of organization to filter available metrics and benchmarks
        </FormDescription>
      )}
      <FormControl>
        <Select
          value={field.value || ''}
          onValueChange={field.onChange}
          disabled={disabled}
        >
          <SelectTrigger
            data-testid="organization-type-selector"
            aria-label={label}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {organizationOptions.map(({ value, label, description }) => (
              <SelectItem
                key={value}
                value={value}
                data-testid={`select-item-${value}`}
                title={showOptionDescriptions ? description : undefined}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${colorMap.get(value)}`}
                    aria-hidden="true"
                  />
                  {label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormControl>
      <FormMessage />
    </FormItem>
  );
}

/**
 * Utility function to get human-readable label for organization type
 * @deprecated Use getOrganizationTypeLabel from @shared/organization-type-utils instead
 */
export function getOrganizationTypeLabel(orgType: typeof organizationTypeEnum[number] | undefined | null): string {
  return getOrgTypeLabel(orgType);
}

/**
 * Enhanced Organization Type Badge Component for displaying org type in listings
 * 
 * Features:
 * - Consistent color scheme from centralized utilities
 * - Better accessibility with proper ARIA labels
 * - Customizable styling
 * - Performance optimized
 */
interface OrganizationTypeBadgeProps {
  orgType: OrganizationType | undefined | null;
  className?: string;
  'data-testid'?: string;
  /** Size variant for the badge */
  size?: 'sm' | 'md' | 'lg';
  /** Show icon along with label */
  showIcon?: boolean;
  /** Custom icon override */
  icon?: React.ReactNode;
}

export function OrganizationTypeBadge({ 
  orgType, 
  className = '', 
  'data-testid': dataTestId,
  size = 'md',
  showIcon = false,
  icon
}: OrganizationTypeBadgeProps) {
  if (!orgType) {
    return null;
  }

  const label = getOrgTypeLabel(orgType);
  const colors = getOrganizationTypeColors(orgType);
  
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm'
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${colors} ${sizeClasses[size]} ${className}`}
      data-testid={dataTestId || `org-type-badge-${orgType}`}
      role="status"
      aria-label={`Organization type: ${label}`}
    >
      {showIcon && (
        <span className="mr-1.5" aria-hidden="true">
          {icon || (
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${colors.replace('text-', 'bg-').split(' ')[1]}`}
            />
          )}
        </span>
      )}
      {label}
    </span>
  );
}