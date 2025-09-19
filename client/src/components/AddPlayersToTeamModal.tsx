import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Users, Plus, UserCheck, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Team } from "@shared/schema";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  organizationId?: string;
  teamMemberships?: Array<{
    teamId: string;
    teamName: string;
    isActive: string;
    season?: string;
  }>;
}

interface AddPlayersToTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
}

export default function AddPlayersToTeamModal({ isOpen, onClose, team }: AddPlayersToTeamModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);

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

  // Reset selections when modal opens/closes or team changes
  useEffect(() => {
    if (isOpen) {
      setSelectedPlayerIds([]);
      setSearchTerm("");
    }
  }, [isOpen, team?.id]);

  // Fetch available players from the organization
  const { data: players = [], isLoading: isLoadingPlayers } = useQuery({
    queryKey: ["/api/users", effectiveOrganizationId, team?.id],
    queryFn: async () => {
      const url = effectiveOrganizationId
        ? `/api/users?organizationId=${effectiveOrganizationId}&includeTeamMemberships=true`
        : `/api/users?includeTeamMemberships=true`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch players');
      return response.json();
    },
    enabled: isOpen && !!team?.id
  });

  // Filter players based on search term and availability
  const filteredPlayers = useMemo(() => {
    if (!players) return [];

    let filtered = players.filter((player: User) => {
      // Search by name or email
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm ||
        player.firstName.toLowerCase().includes(searchLower) ||
        player.lastName.toLowerCase().includes(searchLower) ||
        player.email.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // Filter by availability if enabled
      if (showOnlyAvailable && team) {
        const isAlreadyOnTeam = player.teamMemberships?.some(
          membership => membership.teamId === team.id && membership.isActive === "true"
        );
        return !isAlreadyOnTeam;
      }

      return true;
    });

    return filtered;
  }, [players, searchTerm, showOnlyAvailable, team]);

  // Check if a player is already on the team
  const isPlayerOnTeam = (player: User): boolean => {
    return player.teamMemberships?.some(
      membership => membership.teamId === team?.id && membership.isActive === "true"
    ) ?? false;
  };

  // Get player's current teams (excluding the target team)
  const getPlayerTeams = (player: User): Array<{teamId: string; teamName: string; isActive: string; season?: string}> => {
    return player.teamMemberships?.filter(
      membership => membership.teamId !== team?.id && membership.isActive === "true"
    ) || [];
  };

  // Add players to team mutation
  const addPlayersToTeamMutation = useMutation({
    mutationFn: async (playerIds: string[]) => {
      const response = await apiRequest("POST", `/api/teams/${team!.id}/add-players`, {
        playerIds
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: `${selectedPlayerIds.length} player(s) added to ${team?.name}`,
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add players to team",
        variant: "destructive",
      });
    },
  });

  const handlePlayerSelection = (playerId: string, checked: boolean) => {
    if (checked) {
      setSelectedPlayerIds(prev => [...prev, playerId]);
    } else {
      setSelectedPlayerIds(prev => prev.filter(id => id !== playerId));
    }
  };

  const handleSelectAll = () => {
    const availablePlayerIds = filteredPlayers
      .filter((player: User) => !isPlayerOnTeam(player))
      .map((player: User) => player.id);
    setSelectedPlayerIds(availablePlayerIds);
  };

  const handleClearSelection = () => {
    setSelectedPlayerIds([]);
  };

  const handleSubmit = () => {
    if (selectedPlayerIds.length === 0) {
      toast({
        title: "No players selected",
        description: "Please select at least one player to add to the team",
        variant: "destructive",
      });
      return;
    }
    addPlayersToTeamMutation.mutate(selectedPlayerIds);
  };

  const isPending = addPlayersToTeamMutation.isPending;

  if (!team) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Add Players to {team.name}
          </DialogTitle>
          <DialogDescription>
            Select players from your organization to add to this team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search and filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search players by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                disabled={isPending}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-available"
                  checked={showOnlyAvailable}
                  onCheckedChange={(checked) => setShowOnlyAvailable(checked === true)}
                  disabled={isPending}
                />
                <Label htmlFor="show-available" className="text-sm">
                  Show only available players
                </Label>
              </div>

              {filteredPlayers.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={isPending || filteredPlayers.filter((p: User) => !isPlayerOnTeam(p)).length === 0}
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
          </div>

          {/* Players list */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {isLoadingPlayers ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2">Loading players...</span>
              </div>
            ) : filteredPlayers.length === 0 ? (
              <Card className="bg-gray-50">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {showOnlyAvailable ? "No available players found" : "No players found"}
                  </h3>
                  <p className="text-gray-600 text-center">
                    {searchTerm
                      ? `No players match "${searchTerm}"`
                      : showOnlyAvailable
                        ? "All players are already on this team"
                        : "No players in this organization"
                    }
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredPlayers.map((player: User) => {
                const isOnTeam = isPlayerOnTeam(player);
                const playerTeams = getPlayerTeams(player);
                const isSelected = selectedPlayerIds.includes(player.id);

                return (
                  <Card
                    key={player.id}
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
                          onCheckedChange={(checked) => handlePlayerSelection(player.id, checked === true)}
                          disabled={isPending || isOnTeam}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">
                              {player.firstName} {player.lastName}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {player.role}
                            </Badge>
                            {isOnTeam && (
                              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <UserCheck className="h-3 w-3" />
                                On Team
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{player.email}</p>
                          {playerTeams.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {playerTeams.map((membership, index) => (
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

          {/* Selection summary */}
          {selectedPlayerIds.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>{selectedPlayerIds.length}</strong> player(s) selected to add to <strong>{team.name}</strong>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
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
                  Add {selectedPlayerIds.length} Player{selectedPlayerIds.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}