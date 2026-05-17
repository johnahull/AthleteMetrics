/**
 * Global command palette component
 * Provides universal search and quick actions
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useCommandPalette } from './command-palette-provider';
import { useGlobalSearch } from '@/hooks/use-global-search';
import { useAuth } from '@/lib/auth';
import { hasPermission, type Permission } from '@shared/role-types';
import { getCommandActions, filterActionsByQuery, filterActionsByPermissions } from '@/lib/command-palette-actions';
import { getRecentItems, addRecentItem, type RecentItem } from '@/lib/recent-items';
import { useMetricLabels } from '@/hooks/use-metric-labels';
import { User, Users, Activity, Clock } from 'lucide-react';

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { getLabel } = useMetricLabels();

  // Navigation function compatible with wouter
  const navigate = (path: string) => setLocation(path);

  // Get search results
  const { data: searchResults, isLoading } = useGlobalSearch({
    query,
    limit: 20,
  });

  // Get recent items
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      // Load recent items when palette opens
      setRecentItems(getRecentItems());
    } else {
      // Clear query when palette closes
      setQuery('');
    }
  }, [isOpen]);

  // Get actions and filter by permissions
  const allActions = getCommandActions(navigate);
  const userHasPermission = (permission: Permission) => {
    if (!user || !user.role) return false;
    return hasPermission(user.role, permission);
  };

  const permittedActions = filterActionsByPermissions(allActions, userHasPermission);
  const filteredActions = filterActionsByQuery(permittedActions, query);

  // Handle item selection
  const handleSelectAthlete = (athlete: { id: string; name: string; team: string | null }) => {
    // Add to recent items
    addRecentItem({
      type: 'athlete',
      id: athlete.id,
      name: athlete.name,
      subtitle: athlete.team || undefined,
    });

    // Navigate to athlete profile
    navigate(`/athletes/${athlete.id}`);
    close();
  };

  const handleSelectTeam = (team: { id: string; name: string; level: string | null }) => {
    // Add to recent items
    addRecentItem({
      type: 'team',
      id: team.id,
      name: team.name,
      subtitle: team.level || undefined,
    });

    // Navigate to team page
    navigate(`/teams/${team.id}`);
    close();
  };

  const handleSelectMeasurement = (measurement: { athleteName: string }) => {
    // For measurements, we might want to navigate to the athlete's measurement history
    // For now, we'll just close the palette
    // TODO: Implement measurement detail view
    close();
  };

  const handleSelectAction = (action: () => void) => {
    action();
    close();
  };

  const handleSelectRecentItem = (item: RecentItem) => {
    if (item.type === 'athlete') {
      navigate(`/athletes/${item.id}`);
    } else if (item.type === 'team') {
      navigate(`/teams/${item.id}`);
    }
    close();
  };

  const showRecentItems = !query && recentItems.length > 0;
  const showSearchResults = query.length > 0;
  const hasResults = searchResults && searchResults.total > 0;

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput
        placeholder="Search athletes, teams, or type a command..."
        value={query}
        onValueChange={setQuery}
        aria-label="Global search input"
      />
      <CommandList>
        {isLoading && query && (
          <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>
        )}

        {!isLoading && showSearchResults && !hasResults && (
          <CommandEmpty>No results found for &quot;{query}&quot;</CommandEmpty>
        )}

        {/* Recent Items */}
        {showRecentItems && (
          <>
            <CommandGroup heading="Recent">
              {recentItems.map((item) => (
                <CommandItem
                  key={`${item.type}-${item.id}`}
                  value={`recent-${item.type}-${item.id}`}
                  onSelect={() => handleSelectRecentItem(item)}
                  data-recent-item
                >
                  <Clock className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span>{item.name}</span>
                    {item.subtitle && (
                      <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Search Results - Athletes */}
        {showSearchResults && searchResults?.results.athletes && searchResults.results.athletes.length > 0 && (
          <CommandGroup heading="Athletes">
            {searchResults.results.athletes.map((athlete) => (
              <CommandItem
                key={athlete.id}
                value={`athlete-${athlete.id}-${athlete.name}`}
                onSelect={() => handleSelectAthlete(athlete)}
                data-type="athlete"
              >
                <User className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>{athlete.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {athlete.team || 'No team'} • {athlete.gender} • {athlete.birthYear}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search Results - Teams */}
        {showSearchResults && searchResults?.results.teams && searchResults.results.teams.length > 0 && (
          <CommandGroup heading="Teams">
            {searchResults.results.teams.map((team) => (
              <CommandItem
                key={team.id}
                value={`team-${team.id}-${team.name}`}
                onSelect={() => handleSelectTeam(team)}
                data-type="team"
              >
                <Users className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>{team.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {team.level} • {team.athleteCount} athletes
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search Results - Measurements */}
        {showSearchResults && searchResults?.results.measurements && searchResults.results.measurements.length > 0 && (
          <CommandGroup heading="Measurements">
            {searchResults.results.measurements.map((measurement) => (
              <CommandItem
                key={measurement.id}
                value={`measurement-${measurement.id}-${measurement.athleteName}`}
                onSelect={() => handleSelectMeasurement(measurement)}
                data-type="measurement"
              >
                <Activity className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>{measurement.athleteName}</span>
                  <span className="text-xs text-muted-foreground">
                    {getLabel(measurement.metric)} • {measurement.value} • {measurement.date}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Quick Actions */}
        {filteredActions.length > 0 && (
          <>
            {(showSearchResults || showRecentItems) && <CommandSeparator />}
            <CommandGroup heading="Quick Actions">
              {filteredActions.map((action) => {
                const Icon = action.icon;
                return (
                  <CommandItem
                    key={action.id}
                    value={`action-${action.id}-${action.title}`}
                    onSelect={() => handleSelectAction(action.action)}
                    data-type="action"
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <span>{action.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Aria live region for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {showSearchResults && hasResults && `Found ${searchResults.total} results`}
        {showSearchResults && !hasResults && 'No results found'}
      </div>
    </CommandDialog>
  );
}
