import { Globe, User, Building2, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAthleteOrg } from '@/lib/athlete-org-context';
import { useAuth } from '@/lib/auth';
import type { FilterMode } from '@/lib/athlete-org-context';

/**
 * OrgSwitcher - Dropdown component for filtering athlete data by organization
 *
 * Allows athletes to switch between:
 * - "All Organizations" - Show data from all their organizations
 * - "Self-entered" - Show only self-entered data (no organization)
 * - Specific organization - Show data from a single organization
 *
 * Uses AthleteOrgContext for state management and localStorage persistence.
 */
export function OrgSwitcher() {
  const { filterMode, setFilterMode, organizations } = useAthleteOrg();
  const { user } = useAuth();

  // Show loading state when user is not yet loaded
  const isLoading = !user;

  // Get display label for current selection
  const getDisplayLabel = (): string => {
    if (filterMode === 'all') {
      return 'All Organizations';
    }
    if (filterMode === 'personal') {
      return 'Self-entered';
    }
    // Find org name by ID
    const org = organizations.find(o => o.id === filterMode);
    return org?.name || 'Unknown Organization';
  };

  // Get icon for current selection
  const getCurrentIcon = () => {
    if (filterMode === 'all') {
      return <Globe className="h-4 w-4" data-icon="globe" />;
    }
    if (filterMode === 'personal') {
      return <User className="h-4 w-4" data-icon="user" />;
    }
    return <Building2 className="h-4 w-4" data-icon="building" />;
  };

  // Show loading skeleton while auth context is loading
  if (isLoading) {
    return (
      <div className="w-[240px]" data-testid="org-switcher-skeleton">
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  // Edge case: If user has 0 organizations, only show "Self-entered" option
  const hasOrganizations = organizations.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Organization filter"
        role="combobox"
      >
        <div className="flex items-center gap-2">
          {getCurrentIcon()}
          <span className="text-sm font-medium">{getDisplayLabel()}</span>
        </div>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[240px]">
        {/* Show "All Organizations" only if user has organizations */}
        {hasOrganizations && (
          <DropdownMenuCheckboxItem
            checked={filterMode === 'all'}
            onCheckedChange={() => setFilterMode('all')}
            aria-label="All Organizations"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span>All Organizations</span>
            </div>
            {filterMode === 'all' && <Check className="h-4 w-4 ml-auto" />}
          </DropdownMenuCheckboxItem>
        )}

        {/* "Self-entered" option - always show */}
        <DropdownMenuCheckboxItem
          checked={filterMode === 'personal'}
          onCheckedChange={() => setFilterMode('personal')}
          aria-label="Self-entered"
        >
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>Self-entered</span>
          </div>
          {filterMode === 'personal' && <Check className="h-4 w-4 ml-auto" />}
        </DropdownMenuCheckboxItem>

        {/* Separator before organizations */}
        {hasOrganizations && <DropdownMenuSeparator />}

        {/* List of organizations */}
        {organizations.map(org => (
          <DropdownMenuCheckboxItem
            key={org.id}
            checked={filterMode === org.id}
            onCheckedChange={() => setFilterMode(org.id)}
            aria-label={org.name}
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>{org.name}</span>
            </div>
            {filterMode === org.id && <Check className="h-4 w-4 ml-auto" />}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
