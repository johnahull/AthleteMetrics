import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Users, Plus, UserCheck, UserMinus, Eye, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Team } from "@shared/schema";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  emails: string[];
  role: string;
  birthYear?: number;
  school?: string;
  sports?: string[];
  organizationId?: string;
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
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);

  // Pagination state
  const [currentPageCurrent, setCurrentPageCurrent] = useState(1);
  const [currentPageAvailable, setCurrentPageAvailable] = useState(1);
  const ITEMS_PER_PAGE = 10;

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
      setActiveTab(defaultTab);
      setCurrentPageCurrent(1);
      setCurrentPageAvailable(1);
    }
  }, [isOpen, team?.id, defaultTab]);

  // Reset pagination when search term changes
  useEffect(() => {
    setCurrentPageCurrent(1);
    setCurrentPageAvailable(1);
  }, [searchTerm, showOnlyAvailable]);

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

  // Fetch all organization athletes for adding
  const { data: availableAthletes = [], isLoading: isLoadingAvailable } = useQuery({
    queryKey: ["/api/users", effectiveOrganizationId, team?.id],
    queryFn: async () => {
      const url = effectiveOrganizationId
        ? `/api/users?organizationId=${effectiveOrganizationId}&includeTeamMemberships=true&role=athlete`
        : `/api/users?includeTeamMemberships=true&role=athlete`;
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
    return currentAthletes.filter((athlete: User) =>
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

  // Filter available athletes for adding
  const filteredAvailableAthletes = useMemo(() => {
    if (!availableAthletes) return [];

    let filtered = availableAthletes.filter((athlete: User) => {
      // Search by name
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm ||
        athlete.firstName.toLowerCase().includes(searchLower) ||
        athlete.lastName.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // Filter by availability if enabled
      if (showOnlyAvailable && team) {
        const isAlreadyOnTeam = athlete.teamMemberships?.some(
          membership => membership.teamId === team.id && membership.isActive === "true"
        );
        return !isAlreadyOnTeam;
      }

      return true;
    });

    return filtered;
  }, [availableAthletes, searchTerm, showOnlyAvailable, team]);

  const paginatedAvailableAthletes = useMemo(() => {
    const startIndex = (currentPageAvailable - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredAvailableAthletes.slice(startIndex, endIndex);
  }, [filteredAvailableAthletes, currentPageAvailable]);

  const totalPagesAvailable = Math.ceil(filteredAvailableAthletes.length / ITEMS_PER_PAGE);

  // Check if athlete is on team
  const isAthleteOnTeam = (athlete: User): boolean => {
    return athlete.teamMemberships?.some(
      membership => membership.teamId === team?.id && membership.isActive === "true"
    ) ?? false;
  };

  // Get athlete's other teams
  const getAthleteOtherTeams = (athlete: User) => {
    return athlete.teamMemberships?.filter(
      membership => membership.teamId !== team?.id && membership.isActive === "true"
    ) || [];
  };

  // Remove athlete mutation
  const removeAthleteMutation = useMutation({
    mutationFn: async ({ athleteId, teamId }: { athleteId: string; teamId: string }) => {
      await apiRequest("DELETE", `/api/teams/${teamId}/athletes/${athleteId}`);
    },
    onSuccess: (_, { athleteId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });

      const athlete = currentAthletes.find((a: User) => a.id === athleteId);
      toast({
        title: "Success",
        description: `${athlete?.fullName || 'Athlete'} removed from ${team?.name} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove athlete from team",
        variant: "destructive",
      });
    },
  });

  // Add athletes mutation
  const addAthletesMutation = useMutation({
    mutationFn: async (athleteIds: string[]) => {
      const response = await apiRequest("POST", `/api/teams/${team!.id}/add-players`, {
        playerIds: athleteIds
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });

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

      setSelectedPlayerIds([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add athletes to team",
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
      .filter((athlete: User) => !isAthleteOnTeam(athlete))
      .map((athlete: User) => athlete.id);
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

  const isPending = removeAthleteMutation.isPending || addAthletesMutation.isPending;

  if (!team) return null;

  const currentCount = currentAthletes.length;
  const availableCount = filteredAvailableAthletes.filter((a: User) => !isAthleteOnTeam(a)).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Athletes - {team.name}
          </DialogTitle>
          <DialogDescription>
            Manage current team members and add new athletes to the team.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'current' | 'add')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="current" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Current Athletes ({currentCount})
            </TabsTrigger>
            <TabsTrigger value="add" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Add Athletes ({availableCount} available)
            </TabsTrigger>
          </TabsList>

          {/* Search Bar */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search athletes by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              disabled={isPending}
            />
          </div>

          <TabsContent value="current" className="space-y-4">
            {/* Current Athletes Content */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
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
                paginatedCurrentAthletes.map((athlete: User) => {
                  const otherTeams = getAthleteOtherTeams(athlete);

                  return (
                    <Card key={athlete.id} className="hover:bg-gray-50 transition-colors">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center space-x-3">
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
                              <Badge variant="outline" className="text-xs">
                                {athlete.role}
                              </Badge>
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
                            title="View athlete profile"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAthlete(athlete.id, athlete.fullName || `${athlete.firstName} ${athlete.lastName}`)}
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            disabled={isPending}
                            title="Remove from team"
                          >
                            <UserMinus className="h-4 w-4" />
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
              <div className="flex items-center justify-center space-x-2 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPageCurrent(Math.max(1, currentPageCurrent - 1))}
                  disabled={currentPageCurrent === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
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
              </div>
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

          <TabsContent value="add" className="space-y-4">
            {/* Add Athletes Content */}
            <div className="flex items-center justify-between">
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

              {filteredAvailableAthletes.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllAvailable}
                    disabled={isPending || filteredAvailableAthletes.filter((a: User) => !isAthleteOnTeam(a)).length === 0}
                  >
                    Select All Available
                  </Button>
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
                paginatedAvailableAthletes.map((athlete: User) => {
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
                          />
                          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                            <span className="text-white font-medium text-sm">
                              {athlete.firstName.charAt(0)}{athlete.lastName.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">
                                {athlete.firstName} {athlete.lastName}
                              </p>
                              <Badge variant="outline" className="text-xs">
                                {athlete.role}
                              </Badge>
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
                  onClick={handleAddAthletes}
                  disabled={isPending || selectedPlayerIds.length === 0}
                  className="flex items-center gap-2"
                >
                  {isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add {selectedPlayerIds.length} Athlete{selectedPlayerIds.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
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
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}