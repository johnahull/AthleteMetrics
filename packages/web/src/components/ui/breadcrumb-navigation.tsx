/**
 * BreadcrumbNavigation Component
 * A wrapper around shadcn/ui breadcrumb components that renders a complete breadcrumb trail
 * with support for icons, links, and accessibility features
 */

import React from 'react';
import { Link } from 'wouter';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface BreadcrumbNavigationItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
}

interface BreadcrumbNavigationProps {
  items: BreadcrumbNavigationItem[];
  className?: string;
}

/**
 * Breadcrumb navigation component for displaying hierarchical page navigation
 *
 * @example
 * ```tsx
 * <BreadcrumbNavigation
 *   items={[
 *     { label: 'Dashboard', href: '/', icon: Home },
 *     { label: 'Athletes', href: '/athletes', icon: Users },
 *     { label: 'John Smith' } // Current page (no href)
 *   ]}
 * />
 * ```
 *
 * Features:
 * - Clickable links for all items except current page
 * - Optional icons for each breadcrumb item
 * - ChevronRight separator between items
 * - Accessible with proper ARIA labels
 * - Works with Wouter routing
 */
export function BreadcrumbNavigation({
  items,
  className,
}: BreadcrumbNavigationProps) {
  if (items.length === 0) {
    return <Breadcrumb className={className} />;
  }

  return (
    <Breadcrumb className={cn('mb-4', className)}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const Icon = item.icon;

          return (
            <React.Fragment key={index}>
              <BreadcrumbItem>
                {item.href && !isLast ? (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>
                      <span className="flex items-center gap-1.5">
                        {Icon && <Icon className="h-4 w-4" />}
                        {item.label}
                      </span>
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>
                    <span className="flex items-center gap-1.5">
                      {Icon && <Icon className="h-4 w-4" />}
                      {item.label}
                    </span>
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>

              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
