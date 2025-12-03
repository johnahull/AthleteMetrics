/**
 * AthleteSidebar Component
 *
 * Navigation sidebar for athlete pages (Profile and Dashboard).
 * Includes:
 * - Profile / Dashboard navigation links
 * - Add Measurement button
 * - Active link highlighting
 *
 * Works for both athlete self-view and coach view of athletes.
 */

import { useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  User,
  Users,
  LayoutDashboard,
  Plus,
  TrendingUp,
  Target,
  BarChart3,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AthleteSidebarProps {
  /** The athlete ID being viewed */
  athleteId: string;
  /** Whether viewing own profile (athlete) or someone else's (coach) */
  isOwnProfile: boolean;
  /** Callback when Add Measurement button is clicked */
  onAddMeasurement?: () => void;
  /** Whether the user can add measurements (coaches/admins only) */
  canAddMeasurement?: boolean;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

export function AthleteSidebar({
  athleteId,
  isOwnProfile,
  onAddMeasurement,
  canAddMeasurement = true,
}: AthleteSidebarProps) {
  const [location] = useLocation();

  // Generate paths based on context
  const profilePath = isOwnProfile ? '/my-profile' : `/athletes/${athleteId}/profile`;
  const dashboardPath = isOwnProfile ? '/my-dashboard' : `/athletes/${athleteId}/dashboard`;

  // Memoize navItems to prevent recreation on every render
  const navItems: NavItem[] = useMemo(
    () => [
      {
        name: isOwnProfile ? 'My Profile' : 'Profile',
        href: profilePath,
        icon: User,
        description: 'Personal information & contact',
      },
      {
        name: 'Dashboard',
        href: dashboardPath,
        icon: LayoutDashboard,
        description: 'Measurements & progress',
      },
      // My Measurements only available for athlete self-view
      ...(isOwnProfile
        ? [
            {
              name: 'My Measurements',
              href: '/my-measurements',
              icon: ClipboardList,
              description: 'View history & add entries',
            },
          ]
        : []),
      // Peer comparison only available for athlete self-view
      ...(isOwnProfile
        ? [
            {
              name: 'Peer Comparison',
              href: '/my-peer-comparison',
              icon: Users,
              description: 'Compare to similar athletes',
            },
          ]
        : []),
    ],
    [isOwnProfile, profilePath, dashboardPath]
  );

  // Check if a nav item is active
  const isActive = (href: string) => {
    return location === href;
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">
              {isOwnProfile ? 'My Athletics' : 'Athlete View'}
            </h2>
            <p className="text-xs text-gray-500">
              {isOwnProfile ? 'Track your progress' : 'View athlete data'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link key={item.href} href={item.href}>
              <a
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  'hover:bg-gray-100',
                  active
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-700'
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 flex-shrink-0',
                    active ? 'text-blue-600' : 'text-gray-400'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', active && 'text-blue-700')}>
                    {item.name}
                  </p>
                  {item.description && (
                    <p className="text-xs text-gray-500 truncate">{item.description}</p>
                  )}
                </div>
              </a>
            </Link>
          );
        })}

        {/* Quick Links Section */}
        <div className="pt-4 mt-4 border-t border-gray-200">
          <p className="px-3 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Quick Actions
          </p>

          {/* For athletes viewing their own data, link to self-entry page */}
          {isOwnProfile && (
            <Link href="/my-measurements/add">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                asChild
              >
                <a>
                  <Plus className="h-4 w-4" />
                  Log Measurement
                </a>
              </Button>
            </Link>
          )}

          {/* For coaches/admins, use the callback for batch entry modal */}
          {!isOwnProfile && canAddMeasurement && onAddMeasurement && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={onAddMeasurement}
            >
              <Plus className="h-4 w-4" />
              Add Measurement
            </Button>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Track progress daily</span>
        </div>
      </div>
    </aside>
  );
}

export default AthleteSidebar;
