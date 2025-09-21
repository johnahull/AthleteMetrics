import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Plus, UserCheck, UserMinus, Eye, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Team, User } from "@shared/schema";

// Extended User type for team management with memberships
interface UserWithTeamMemberships extends User {
  teamMemberships?: Array<{
    teamId: string;
    teamName: string;
    isActive: string;
    season?: string;
  }>;
  teams?: Array<{
    id: string;
    name: string;
    isActive: string;
    season?: string;
  }>;
}

interface TeamAthletesModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  defaultTab?: 'current' | 'add';
}

export default function TeamAthletesModal({ isOpen, onClose, team, defaultTab = 'current' }: TeamAthletesModalProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedCurrentAthleteIds, setSelectedCurrentAthleteIds] = useState<string[]>([]);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<string>("");

  // Pagination state
  const [currentPageCurrent, setCurrentPageCurrent] = useState(1);
  const [currentPageAvailable, setCurrentPageAvailable] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Accessibility refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationContext, userOrganizations, user } = useAuth();

  // Get effective organization ID
  const getEffectiveOrganizationId = () => {
    if (organizationContext) return organizationContext;
    const isSiteAdmin = user?.isSiteAdmin || false;
    if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
      return userOrganizations[0].organizationId;
    }
    return null;
  };

  const effectiveOrganizationId = getEffectiveOrganizationId();

  // Reset state when modal opens/closes or team changes
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setSelectedPlayerIds([]);
      setSelectedCurrentAthleteIds([]);
      setActiveTab(defaultTab);
      setCurrentPageCurrent(1);
      setCurrentPageAvailable(1);

      // Focus search input when modal opens for better accessibility
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, team?.id, defaultTab]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPageCurrent(1);
    setCurrentPageAvailable(1);
  }, [searchTerm, showOnlyAvailable, selectedSeason]);

  // Reset bulk selection when tab changes
  useEffect(() => {
    setSelectedCurrentAthleteIds([]);
    setSelectedPlayerIds([]);
  }, [activeTab]);

  // Fetch current team athletes
  const { data: currentAthletes = [], isLoading: isLoadingCurrent } = useQuery({
    queryKey: ["/api/athletes", team?.id, "team-members"],
    queryFn: async () => {
      if (!team?.id) return [];

      const params = new URLSearchParams();
      params.append('teamId', team.id);

      if (effectiveOrganizationId) {
        params.append('organizationId', effectiveOrganizationId);
      }

      const response = await fetch(`/api/athletes?${params}`);
      if (!response.ok) throw new Error('Failed to fetch team athletes');
      return response.json();
    },
    enabled: isOpen && !!team?.id
  });

  // Fetch all organization athletes for adding with server-side filtering
  const { data: availableAthletes = [], isLoading: isLoadingAvailable } = useQuery({
    queryKey: ["/api/users", effectiveOrganizationId, team?.id, searchTerm, showOnlyAvailable, selectedSeason],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveOrganizationId) params.append('organizationId', effectiveOrganizationId);
      params.append('includeTeamMemberships', 'true');
      params.append('role', 'athlete');
      if (searchTerm) params.append('search', searchTerm);
      if (selectedSeason) params.append('season', selectedSeason);
      if (showOnlyAvailable && team?.id) {
        params.append('excludeTeam', team.id);
      }

      const url = `/api/users?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch athletes');
      return response.json();
    },
    enabled: isOpen && !!team?.id
  });

  // Filter current athletes based on search
  const filteredCurrentAthletes = useMemo(() => {
    if (!searchTerm) return currentAthletes;

    const searchLower = searchTerm.toLowerCase();
    return currentAthletes.filter((athlete: UserWithTeamMemberships) =>
      athlete.firstName.toLowerCase().includes(searchLower) ||
      athlete.lastName.toLowerCase().includes(searchLower) ||
      athlete.fullName?.toLowerCase().includes(searchLower)
    );
  }, [currentAthletes, searchTerm]);

  const paginatedCurrentAthletes = useMemo(() => {
    const startIndex = (currentPageCurrent - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredCurrentAthletes.slice(startIndex, endIndex);
  }, [filteredCurrentAthletes, currentPageCurrent]);

  const totalPagesCurrent = Math.ceil(filteredCurrentAthletes.length / ITEMS_PER_PAGE);

  // Available athletes are already filtered server-side
  const filteredAvailableAthletes = useMemo(() => {
    return availableAthletes || [];
  }, [availableAthletes]);

  const paginatedAvailableAthletes = useMemo(() => {
    const startIndex = (currentPageAvailable - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredAvailableAthletes.slice(startIndex, endIndex);
  }, [filteredAvailableAthletes, currentPageAvailable]);

  const totalPagesAvailable = Math.ceil(filteredAvailableAthletes.length / ITEMS_PER_PAGE);

  // Check if athlete is on team
  const isAthleteOnTeam = (athlete: UserWithTeamMemberships): boolean => {
    return athlete.teamMemberships?.some(
      membership => membership.teamId === team?.id && membership.isActive === "true"
    ) ?? false;
  };

  // Get athlete's other teams
  const getAthleteOtherTeams = (athlete: UserWithTeamMemberships) => {
    return athlete.teamMemberships?.filter(
      membership => membership.teamId !== team?.id && membership.isActive === "true"
    ) || [];
  };

  // Remove athlete mutation with optimistic updates
  const removeAthleteMutation = useMutation({
    mutationFn: async ({ athleteId, teamId }: { athleteId: string; teamId: string }): Promise<void> => {
      await apiRequest("DELETE", `/api/teams/${teamId}/athletes/${athleteId}`);
    },
    onMutate: async ({ athleteId }) => {
      // Cancel outgoing refetches to avoid optimistic update being overwritten
      await queryClient.cancelQueries({ queryKey: ["/api/athletes", team?.id] });
      await queryClient.cancelQueries({ queryKey: ["/api/users", effectiveOrganizationId] });

      // Snapshot the previous values
      const previousAthletes = queryClient.getQueryData(["/api/athletes", team?.id]);
      const previousUsers = queryClient.getQueryData(["/api/users", effectiveOrganizationId]);

      // Optimistically update the cache - remove athlete from current list
      if (previousAthletes) {
        queryClient.setQueryData(["/api/athletes", team?.id], (old: any) => {
          if (Array.isArray(old)) {
            return old.filter((athlete: any) => athlete.id !== athleteId);
          }
          return old;
        });
      }

      // Update users list to remove team membership
      if (previousUsers && effectiveOrganizationId) {
        queryClient.setQueryData(["/api/users", effectiveOrganizationId], (old: any) => {
          if (Array.isArray(old)) {
            return old.map((user: UserWithTeamMemberships) => {
              if (user.id === athleteId && user.teamMemberships) {
                return {
                  ...user,
                  teamMemberships: user.teamMemberships.map(membership =>
                    membership.teamId === team?.id
                      ? { ...membership, isActive: "false" }
                      : membership
                  )
                };
              }
              return user;
            });
          }
          return old;
        });
      }

      return { previousAthletes, previousUsers };
    },
    onSuccess: (_, { athleteId }) => {
      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/athletes", team?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", effectiveOrganizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });

      const athlete = currentAthletes.find((a: UserWithTeamMemberships) => a.id === athleteId);
      toast({
        title: "Success",
        description: `${athlete?.fullName || 'Athlete'} removed from ${team?.name} successfully`,
      });
    },
    onError: (error: Error, _, context) => {
      // Rollback optimistic updates on error
      if (context?.previousAthletes) {
        queryClient.setQueryData(["/api/athletes", team?.id], context.previousAthletes);
      }
      if (context?.previousUsers) {
        queryClient.setQueryData(["/api/users", effectiveOrganizationId], context.previousUsers);
      }

      toast({
        title: "Error",
        description: error.message || "Failed to remove athlete from team",
        variant: "destructive",
      });
    },
  });

  // Add athletes mutation with optimistic updates
  const addAthletesMutation = useMutation({
    mutationFn: async (athleteIds: string[]): Promise<{ success: number; errorCount: number; errors?: any[] }> => {
      const response = await apiRequest("POST", `/api/teams/${team!.id}/add-players`, {
        playerIds: athleteIds
      });
      return response.json();
    },
    onMutate: async (athleteIds: string[]) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/athletes", team?.id] });
      await queryClient.cancelQueries({ queryKey: ["/api/users", effectiveOrganizationId] });

      // Snapshot the previous values
      const previousAthletes = queryClient.getQueryData(["/api/athletes", team?.id]);
      const previousUsers = queryClient.getQueryData(["/api/users", effectiveOrganizationId]);

      // Get athletes being added for optimistic update
      const athletesToAdd = availableAthletes.filter((athlete: UserWithTeamMemberships) =>
        athleteIds.includes(athlete.id)
      );

      // Optimistically add athletes to current team list
      if (previousAthletes && athletesToAdd.length > 0) {
        queryClient.setQueryData(["/api/athletes", team?.id], (old: any) => {
          if (Array.isArray(old)) {
            // Add new athletes with team membership
            const newAthletes = athletesToAdd.map((athlete: UserWithTeamMemberships) => ({
              ...athlete,
              teamMemberships: [
                ...(athlete.teamMemberships || []),
                {
                  teamId: team!.id,
                  teamName: team!.name,
                  isActive: "true",
                  season: new Date().getFullYear().toString()
                }
              ]
            }));
            return [...old, ...newAthletes];
          }
          return old;
        });
      }

      // Update users list to add team memberships
      if (previousUsers && effectiveOrganizationId) {
        queryClient.setQueryData(["/api/users", effectiveOrganizationId], (old: any) => {
          if (Array.isArray(old)) {
            return old.map((user: UserWithTeamMemberships) => {
              if (athleteIds.includes(user.id)) {
                return {
                  ...user,
                  teamMemberships: [
                    ...(user.teamMemberships || []),
                    {
                      teamId: team!.id,
                      teamName: team!.name,
                      isActive: "true",
                      season: new Date().getFullYear().toString()
                    }
                  ]
                };
              }
              return user;
            });
          }
          return old;
        });
      }

      // Clear selection optimistically
      setSelectedPlayerIds([]);

      return { previousAthletes, previousUsers, selectedIds: athleteIds };
    },
    onSuccess: (data: { success: number; errorCount: number; errors?: any[] }) => {
      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/athletes", team?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", effectiveOrganizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });

      const successCount = data.success || 0;
      const errorCount = data.errorCount || 0;

      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "Success",
          description: `Successfully added ${successCount} athlete${successCount !== 1 ? 's' : ''} to ${team?.name}`,
        });
        // Switch to current athletes tab to see results
        setActiveTab('current');
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "Partial Success",
          description: `Added ${successCount} athlete${successCount !== 1 ? 's' : ''} to ${team?.name}. ${errorCount} failed.`,
          variant: "default",
        });
        setActiveTab('current');
      }
    },
    onError: (error: Error, _, context) => {
      // Rollback optimistic updates on error
      if (context?.previousAthletes) {
        queryClient.setQueryData(["/api/athletes", team?.id], context.previousAthletes);
      }
      if (context?.previousUsers) {
        queryClient.setQueryData(["/api/users", effectiveOrganizationId], context.previousUsers);
      }
      // Restore selection on error
      if (context?.selectedIds) {
        setSelectedPlayerIds(context.selectedIds);
      }

      toast({
        title: "Error",
        description: error.message || "Failed to add athletes to team",
        variant: "destructive",
      });
    },
  });

  // Bulk remove athletes mutation with optimistic updates
  const bulkRemoveAthletesMutation = useMutation({
    mutationFn: async (athleteIds: string[]): Promise<{ success: number; errorCount: number; errors?: any[] }> => {
      // Since we don't have a bulk remove endpoint, we'll use multiple individual calls
      const results = await Promise.allSettled(
        athleteIds.map(athleteId =>
          apiRequest("DELETE", `/api/teams/${team!.id}/athletes/${athleteId}`)
        )
      );

      const success = results.filter(result => result.status === 'fulfilled').length;
      const errors = results
        .filter(result => result.status === 'rejected')
        .map((result, index) => ({
          athleteId: athleteIds[index],
          error: result.status === 'rejected' ? result.reason?.message || 'Unknown error' : 'Unknown error'
        }));

      return {
        success,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : undefined
      };
    },
    onMutate: async (athleteIds: string[]) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/athletes", team?.id] });
      await queryClient.cancelQueries({ queryKey: ["/api/users", effectiveOrganizationId] });

      // Snapshot the previous values
      const previousAthletes = queryClient.getQueryData(["/api/athletes", team?.id]);
      const previousUsers = queryClient.getQueryData(["/api/users", effectiveOrganizationId]);

      // Optimistically remove athletes from current list
      if (previousAthletes) {
        queryClient.setQueryData(["/api/athletes", team?.id], (old: any) => {
          if (Array.isArray(old)) {
            return old.filter((athlete: any) => !athleteIds.includes(athlete.id));
          }
          return old;
        });
      }

      // Update users list to remove team memberships
      if (previousUsers && effectiveOrganizationId) {
        queryClient.setQueryData(["/api/users", effectiveOrganizationId], (old: any) => {
          if (Array.isArray(old)) {
            return old.map((user: UserWithTeamMemberships) => {
              if (athleteIds.includes(user.id) && user.teamMemberships) {
                return {
                  ...user,
                  teamMemberships: user.teamMemberships.map(membership =>
                    membership.teamId === team?.id
                      ? { ...membership, isActive: "false" }
                      : membership
                  )
                };
              }
              return user;
            });
          }
          return old;
        });
      }

      // Clear selection optimistically
      setSelectedCurrentAthleteIds([]);

      return { previousAthletes, previousUsers, selectedIds: athleteIds };
    },
    onSuccess: (data: { success: number; errorCount: number; errors?: any[] }) => {
      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/athletes", team?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", effectiveOrganizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });

      const successCount = data.success || 0;
      const errorCount = data.errorCount || 0;

      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "Success",
          description: `Successfully removed ${successCount} athlete${successCount !== 1 ? 's' : ''} from ${team?.name}`,
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "Partial Success",
          description: `Removed ${successCount} athlete${successCount !== 1 ? 's' : ''} from ${team?.name}. ${errorCount} failed.`,
          variant: "default",
        });
      } else if (errorCount > 0) {
        toast({
          title: "Error",
          description: `Failed to remove ${errorCount} athlete${errorCount !== 1 ? 's' : ''} from ${team?.name}`,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error, _, context) => {
      // Rollback optimistic updates on error
      if (context?.previousAthletes) {
        queryClient.setQueryData(["/api/athletes", team?.id], context.previousAthletes);
      }
      if (context?.previousUsers) {
        queryClient.setQueryData(["/api/users", effectiveOrganizationId], context.previousUsers);
      }
      // Restore selection on error
      if (context?.selectedIds) {
        setSelectedCurrentAthleteIds(context.selectedIds);
      }

      toast({
        title: "Error",
        description: error.message || "Failed to remove athletes from team",
        variant: "destructive",
      });
    },
  });

  // Handle remove athlete
  const handleRemoveAthlete = (athleteId: string, athleteName: string) => {
    if (window.confirm(`Are you sure you want to remove "${athleteName}" from ${team?.name}?`)) {
      removeAthleteMutation.mutate({ athleteId, teamId: team!.id });
    }
  };

  // Handle athlete selection for adding
  const handleAthleteSelection = (athleteId: string, checked: boolean) => {
    if (checked) {
      setSelectedPlayerIds(prev => [...prev, athleteId]);
    } else {
      setSelectedPlayerIds(prev => prev.filter(id => id !== athleteId));
    }
  };

  // Handle select all available
  const handleSelectAllAvailable = () => {
    const availableIds = filteredAvailableAthletes
      .filter((athlete: UserWithTeamMemberships) => !isAthleteOnTeam(athlete))
      .map((athlete: UserWithTeamMemberships) => athlete.id);
    setSelectedPlayerIds(availableIds);
  };

  // Handle clear selection
  const handleClearSelection = () => {
    setSelectedPlayerIds([]);
  };

  // Handle add athletes
  const handleAddAthletes = () => {
    if (selectedPlayerIds.length === 0) {
      toast({
        title: "No athletes selected",
        description: "Please select at least one athlete to add to the team",
        variant: "destructive",
      });
      return;
    }
    addAthletesMutation.mutate(selectedPlayerIds);
  };

  // Handle current athlete selection for bulk removal
  const handleCurrentAthleteSelection = (athleteId: string, checked: boolean) => {
    if (checked) {
      setSelectedCurrentAthleteIds(prev => [...prev, athleteId]);
    } else {
      setSelectedCurrentAthleteIds(prev => prev.filter(id => id !== athleteId));
    }
  };

  // Handle select all current athletes
  const handleSelectAllCurrent = () => {
    const allCurrentIds = filteredCurrentAthletes.map((athlete: UserWithTeamMemberships) => athlete.id);
    setSelectedCurrentAthleteIds(allCurrentIds);
  };

  // Handle clear current selection
  const handleClearCurrentSelection = () => {
    setSelectedCurrentAthleteIds([]);
  };

  // Handle bulk remove athletes
  const handleBulkRemoveAthletes = () => {
    if (selectedCurrentAthleteIds.length === 0) {
      toast({
        title: "No athletes selected",
        description: "Please select at least one athlete to remove from the team",
        variant: "destructive",
      });
      return;
    }

    const athleteNames = selectedCurrentAthleteIds
      .map(id => {
        const athlete = currentAthletes.find((a: UserWithTeamMemberships) => a.id === id);
        return athlete?.fullName || `${athlete?.firstName} ${athlete?.lastName}`;
      })
      .filter(Boolean);

    const confirmMessage = selectedCurrentAthleteIds.length === 1
      ? `Are you sure you want to remove "${athleteNames[0]}" from ${team?.name}?`
      : `Are you sure you want to remove ${selectedCurrentAthleteIds.length} athletes from ${team?.name}?`;

    if (window.confirm(confirmMessage)) {
      bulkRemoveAthletesMutation.mutate(selectedCurrentAthleteIds);
    }
  };

  const isPending = removeAthleteMutation.isPending || addAthletesMutation.isPending || bulkRemoveAthletesMutation.isPending;

  if (!team) return null;

  const currentCount = currentAthletes.length;
  const availableCount = filteredAvailableAthletes.filter((a: UserWithTeamMemberships) => !isAthleteOnTeam(a)).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-3xl max-h-[85vh]"
        role="dialog"
        aria-labelledby="team-athletes-title"
        aria-describedby="team-athletes-description"
      >
        <DialogHeader>
          <DialogTitle id="team-athletes-title" className="flex items-center gap-2">
            <Users className="h-5 w-5" aria-hidden="true" />
            Team Athletes - {team.name}
          </DialogTitle>
          <DialogDescription id="team-athletes-description">
            Manage current team members and add new athletes to the team.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'current' | 'add')}
          aria-label="Team management tabs"
        >
          <TabsList className="grid w-full grid-cols-2" role="tablist">
            <TabsTrigger
              value="current"
              className="flex items-center gap-2"
              aria-controls="current-athletes-panel"
              aria-selected={activeTab === 'current'}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              Current Athletes ({currentCount})
            </TabsTrigger>
            <TabsTrigger
              value="add"
              className="flex items-center gap-2"
              aria-controls="add-athletes-panel"
              aria-selected={activeTab === 'add'}
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add Athletes ({availableCount} available)
            </TabsTrigger>
          </TabsList>

          {/* Search Bar */}
          <div className="relative mt-4">
            <label htmlFor="athlete-search" className="sr-only">
              Search athletes by name
            </label>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" aria-hidden="true" />
            <Input
              id="athlete-search"
              ref={searchInputRef}
              placeholder="Search athletes by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              disabled={isPending}
              aria-describedby={searchTerm ? "search-results-count" : undefined}
            />
            {searchTerm && (
              <div id="search-results-count" className="sr-only">
                {activeTab === 'current'
                  ? `${filteredCurrentAthletes.length} current athletes found`
                  : `${filteredAvailableAthletes.filter((a: UserWithTeamMemberships) => !isAthleteOnTeam(a)).length} available athletes found`
                }
              </div>
            )}
          </div>

          <TabsContent
            value="current"
            className="space-y-4"
            id="current-athletes-panel"
            role="tabpanel"
            aria-labelledby="current-tab"
          >
            {/* Bulk Selection Controls for Current Athletes */}
            {filteredCurrentAthletes.length > 0 && (
              <div className="flex items-center justify-between mb-4" role="toolbar" aria-label="Current athlete bulk actions">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllCurrent}
                    disabled={isPending || filteredCurrentAthletes.length === 0}
                    aria-describedby="select-all-current-description"
                  >
                    Select All ({filteredCurrentAthletes.length})
                  </Button>
                  <div id="select-all-current-description" className="sr-only">
                    Select all {filteredCurrentAthletes.length} current athletes for bulk removal
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearCurrentSelection}
                    disabled={isPending || selectedCurrentAthleteIds.length === 0}
                    aria-label="Clear current athlete selection"
                  >
                    Clear Selection
                  </Button>
                </div>
                {selectedCurrentAthleteIds.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkRemoveAthletes}
                    disabled={isPending}
                    className="flex items-center gap-2"
                    aria-describedby="bulk-remove-description"
                  >
                    <UserMinus className="h-4 w-4" aria-hidden="true" />
                    Remove {selectedCurrentAthleteIds.length} Athlete{selectedCurrentAthleteIds.length !== 1 ? 's' : ''}
                  </Button>
                )}
                <div id="bulk-remove-description" className="sr-only">
                  Remove {selectedCurrentAthleteIds.length} selected athlete{selectedCurrentAthleteIds.length !== 1 ? 's' : ''} from {team?.name}
                </div>
              </div>
            )}

            {/* Current Athletes Content */}
            <div
              className="space-y-2 max-h-96 overflow-y-auto"
              role="list"
              aria-label="Current team athletes"
            >
              {isLoadingCurrent ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2">Loading current athletes...</span>
                </div>
              ) : paginatedCurrentAthletes.length === 0 ? (
                <Card className="bg-gray-50">
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    {currentAthletes.length === 0 ? (
                      <>
                        <Users className="h-12 w-12 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No athletes on this team</h3>
                        <p className="text-gray-600 text-center mb-4">
                          This team doesn't have any athletes yet. Switch to "Add Athletes" to add some.
                        </p>
                        <Button onClick={() => setActiveTab('add')} variant="outline">
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Athletes
                        </Button>
                      </>
                    ) : (
                      <>
                        <Search className="h-12 w-12 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No athletes match your search</h3>
                        <p className="text-gray-600 text-center">
                          Try adjusting your search term: "{searchTerm}"
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : (
                paginatedCurrentAthletes.map((athlete: UserWithTeamMemberships) => {
                  const otherTeams = getAthleteOtherTeams(athlete);
                  const isSelected = selectedCurrentAthleteIds.includes(athlete.id);

                  return (
                    <Card
                      key={athlete.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-orange-50 border-orange-200'
                          : 'hover:bg-gray-50'
                      }`}
                      role="listitem"
                    >
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleCurrentAthleteSelection(athlete.id, checked === true)}
                            disabled={isPending}
                            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${athlete.firstName} ${athlete.lastName} for removal`}
                          />
                          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                            <span className="text-white font-medium text-sm">
                              {athlete.firstName.charAt(0)}{athlete.lastName.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">
                                {athlete.fullName || `${athlete.firstName} ${athlete.lastName}`}
                              </p>
                              {/* Role information would be displayed here if available */}
                            </div>
                            {athlete.birthYear && (
                              <p className="text-sm text-gray-600">Born {athlete.birthYear}</p>
                            )}
                            {athlete.school && (
                              <p className="text-sm text-gray-600">{athlete.school}</p>
                            )}
                            {otherTeams.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-xs text-gray-500">Also on:</span>
                                {otherTeams.map((otherTeam, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {otherTeam.teamName}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/athletes/${athlete.id}`, '_blank')}
                            aria-label={`View profile for ${athlete.firstName} ${athlete.lastName}`}
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">View Profile</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAthlete(athlete.id, athlete.fullName || `${athlete.firstName} ${athlete.lastName}`)}
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            disabled={isPending}
                            aria-label={`Remove ${athlete.firstName} ${athlete.lastName} from team`}
                          >
                            <UserMinus className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Pagination for current athletes */}
            {totalPagesCurrent > 1 && (
              <nav aria-label="Current athletes pagination" className="flex items-center justify-center space-x-2 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPageCurrent(Math.max(1, currentPageCurrent - 1))}
                  disabled={currentPageCurrent === 1}
                  aria-label="Go to previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </Button>
                <span className="text-sm text-gray-600" aria-current="page">
                  Page {currentPageCurrent} of {totalPagesCurrent}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPageCurrent(Math.min(totalPagesCurrent, currentPageCurrent + 1))}
                  disabled={currentPageCurrent === totalPagesCurrent}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </nav>
            )}

            {filteredCurrentAthletes.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>{filteredCurrentAthletes.length}</strong> athlete{filteredCurrentAthletes.length !== 1 ? 's' : ''} on <strong>{team.name}</strong>
                  {searchTerm && currentAthletes.length > filteredCurrentAthletes.length &&
                    ` (${currentAthletes.length} total)`
                  }
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="add"
            className="space-y-4"
            id="add-athletes-panel"
            role="tabpanel"
            aria-labelledby="add-tab"
          >
            {/* Add Athletes Content */}
            <div className="flex items-center justify-between" role="toolbar" aria-label="Athlete filtering options">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-available"
                    checked={showOnlyAvailable}
                    onCheckedChange={(checked) => setShowOnlyAvailable(checked === true)}
                    disabled={isPending}
                  />
                  <Label htmlFor="show-available" className="text-sm">
                    Show only available athletes
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Label htmlFor="season-filter" className="text-sm">
                    Season:
                  </Label>
                  <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                    <SelectTrigger
                      id="season-filter"
                      className="w-40"
                      aria-describedby="season-filter-description"
                    >
                      <SelectValue placeholder="All seasons" />
                    </SelectTrigger>
                    <div id="season-filter-description" className="sr-only">
                      Filter athletes by season. Current selection: {selectedSeason || "All seasons"}
                    </div>
                    <SelectContent>
                      <SelectItem value="">All seasons</SelectItem>
                      <SelectItem value="2024-Fall">2024 Fall</SelectItem>
                      <SelectItem value="2024-Spring">2024 Spring</SelectItem>
                      <SelectItem value="2025-Fall">2025 Fall</SelectItem>
                      <SelectItem value="2025-Spring">2025 Spring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {filteredAvailableAthletes.length > 0 && (
                <div className="flex gap-2" role="group" aria-label="Bulk selection actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllAvailable}
                    disabled={isPending || filteredAvailableAthletes.filter((a: UserWithTeamMemberships) => !isAthleteOnTeam(a)).length === 0}
                    aria-describedby="select-all-description"
                  >
                    Select All Available
                  </Button>
                  <div id="select-all-description" className="sr-only">
                    Select all {filteredAvailableAthletes.filter((a: UserWithTeamMemberships) => !isAthleteOnTeam(a)).length} available athletes for adding to team
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearSelection}
                    disabled={isPending || selectedPlayerIds.length === 0}
                  >
                    Clear Selection
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {isLoadingAvailable ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2">Loading available athletes...</span>
                </div>
              ) : filteredAvailableAthletes.length === 0 ? (
                <Card className="bg-gray-50">
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <Users className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {showOnlyAvailable ? "No available athletes found" : "No athletes found"}
                    </h3>
                    <p className="text-gray-600 text-center">
                      {searchTerm
                        ? `No athletes match "${searchTerm}"`
                        : showOnlyAvailable
                          ? "All athletes are already on this team"
                          : "No athletes in this organization"
                      }
                    </p>
                  </CardContent>
                </Card>
              ) : (
                paginatedAvailableAthletes.map((athlete: UserWithTeamMemberships) => {
                  const isOnTeam = isAthleteOnTeam(athlete);
                  const otherTeams = getAthleteOtherTeams(athlete);
                  const isSelected = selectedPlayerIds.includes(athlete.id);

                  return (
                    <Card
                      key={athlete.id}
                      className={`transition-colors ${
                        isOnTeam
                          ? 'bg-gray-50 border-gray-200'
                          : isSelected
                            ? 'bg-blue-50 border-blue-200'
                            : 'hover:bg-gray-50'
                      }`}
                    >
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleAthleteSelection(athlete.id, checked === true)}
                            disabled={isPending || isOnTeam}
                            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${athlete.firstName} ${athlete.lastName}${isOnTeam ? ' (already on team)' : ''}`}
                          />
                          <div
                            className="w-10 h-10 bg-primary rounded-full flex items-center justify-center"
                            aria-hidden="true"
                          >
                            <span className="text-white font-medium text-sm">
                              {athlete.firstName.charAt(0)}{athlete.lastName.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">
                                {athlete.firstName} {athlete.lastName}
                              </p>
                              {/* Role information would be displayed here if available */}
                              {isOnTeam && (
                                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                  <UserCheck className="h-3 w-3" />
                                  On Team
                                </Badge>
                              )}
                            </div>
                            {otherTeams.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {otherTeams.map((membership, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {membership.teamName}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Pagination for available athletes */}
            {totalPagesAvailable > 1 && (
              <div className="flex items-center justify-center space-x-2 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPageAvailable(Math.max(1, currentPageAvailable - 1))}
                  disabled={currentPageAvailable === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page {currentPageAvailable} of {totalPagesAvailable}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPageAvailable(Math.min(totalPagesAvailable, currentPageAvailable + 1))}
                  disabled={currentPageAvailable === totalPagesAvailable}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {selectedPlayerIds.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>{selectedPlayerIds.length}</strong> athlete(s) selected to add to <strong>{team.name}</strong>
                </p>
              </div>
            )}

            {filteredAvailableAthletes.length > 0 && selectedPlayerIds.length > 0 && (
              <div className="flex justify-end pt-2">
                <Button
                  ref={addButtonRef}
                  onClick={handleAddAthletes}
                  disabled={isPending || selectedPlayerIds.length === 0}
                  className="flex items-center gap-2"
                  aria-describedby="add-athletes-description"
                >
                  {isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true"></div>
                      <span>Adding athletes to team...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add {selectedPlayerIds.length} Athlete{selectedPlayerIds.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
                <div id="add-athletes-description" className="sr-only">
                  Add {selectedPlayerIds.length} selected athlete{selectedPlayerIds.length !== 1 ? 's' : ''} to {team.name}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="flex justify-end pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close team athletes modal"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}