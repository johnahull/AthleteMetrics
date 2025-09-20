import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Edit, Trash2, Users, MoreHorizontal, Archive, RotateCcw, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import TeamModal from "@/components/team-modal";
import ArchiveTeamModal from "@/components/archive-team-modal";
import AddPlayersToTeamModal from "@/components/AddPlayersToTeamModal";
import ManageTeamAthletesModal from "@/components/ManageTeamAthletesModal";
import { formatFly10TimeWithSpeed } from "@/lib/speed-utils";
import { useAuth } from "@/lib/auth";
import type { Team, ArchiveTeam } from "@shared/schema";

export default function Teams() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [archivingTeam, setArchivingTeam] = useState<Team | null>(null);
  const [addingPlayersToTeam, setAddingPlayersToTeam] = useState<Team | null>(null);
  const [managingTeamAthletes, setManagingTeamAthletes] = useState<Team | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationContext, userOrganizations, user } = useAuth();

  // Get effective organization ID - same pattern as dashboard and CoachAnalytics
  const getEffectiveOrganizationId = () => {
    if (organizationContext) return organizationContext;
    const isSiteAdmin = user?.isSiteAdmin || false;
    if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
      return userOrganizations[0].organizationId;
    }
    return null;
  };

  const effectiveOrganizationId = getEffectiveOrganizationId();

  const { data: teams, isLoading } = useQuery({
    queryKey: ["/api/teams", effectiveOrganizationId],
    queryFn: async () => {
      const url = effectiveOrganizationId 
        ? `/api/teams?organizationId=${effectiveOrganizationId}`
        : `/api/teams`;
      const response = await fetch(url);
      return response.json();
    }
  });

  const { data: teamStats } = useQuery({
    queryKey: ["/api/analytics/teams", effectiveOrganizationId],
    queryFn: async () => {
      const url = effectiveOrganizationId 
        ? `/api/analytics/teams?organizationId=${effectiveOrganizationId}`
        : `/api/analytics/teams`;
      const response = await fetch(url);
      return response.json();
    }
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      await apiRequest("DELETE", `/api/teams/${teamId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });
      toast({
        title: "Success",
        description: "Team deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete team",
        variant: "destructive",
      });
    },
  });

  const archiveTeamMutation = useMutation({
    mutationFn: async (data: ArchiveTeam) => {
      await apiRequest("POST", `/api/teams/${data.teamId}/archive`, {
        season: data.season,
        archiveDate: data.archiveDate
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });
      toast({
        title: "Success",
        description: "Team archived successfully",
      });
      setArchivingTeam(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to archive team",
        variant: "destructive",
      });
    },
  });

  const unarchiveTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      await apiRequest("POST", `/api/teams/${teamId}/unarchive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });
      toast({
        title: "Success",
        description: "Team unarchived successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to unarchive team",
        variant: "destructive",
      });
    },
  });

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (window.confirm(`Are you sure you want to delete "${teamName}"? This action cannot be undone.`)) {
      deleteTeamMutation.mutate(teamId);
    }
  };

  const getTeamStats = (teamId: string) => {
    // Ensure teamStats is an array before calling find
    const statsArray = Array.isArray(teamStats) ? teamStats : [];
    return statsArray.find(stat => stat?.teamId === teamId) || {
      athleteCount: 0,
      bestFly10: undefined,
      bestVertical: undefined,
      latestTest: undefined,
    };
  };

  // Filter teams based on archive status
  const safeTeams = Array.isArray(teams) ? teams : [];
  const filteredTeams = safeTeams.filter((team: Team) => {
    if (!team) return false; // Safety check for null/undefined teams
    if (showArchived) {
      return true; // Show all teams
    }
    return team.isArchived !== "true"; // Only show non-archived teams
  });

  const archivedTeamsCount = safeTeams.filter((team: Team) => team?.isArchived === "true").length;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">Teams Management</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-archived"
                checked={showArchived}
                onCheckedChange={(checked) => setShowArchived(checked === true)}
                data-testid="checkbox-show-archived"
              />
              <Label htmlFor="show-archived" className="text-sm">Show archived teams</Label>
            </div>
            
            {showArchived && archivedTeamsCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {archivedTeamsCount} archived team{archivedTeamsCount !== 1 ? 's' : ''} shown
              </Badge>
            )}
          </div>
        </div>
        <Button 
          onClick={() => setShowAddModal(true)}
          className="bg-primary hover:bg-blue-700"
          data-testid="button-add-team"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Team
        </Button>
      </div>

      {/* Teams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTeams.map((team: Team) => {
          const stats = getTeamStats(team.id);
          const isArchived = team.isArchived === "true";
          return (
            <Card key={team.id} className={`bg-white hover:shadow-md transition-shadow ${isArchived ? 'opacity-60 border-amber-200' : ''}`}>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">{team.name}</h3>
                    {isArchived && (
                      <Badge variant="destructive" className="text-xs">
                        Archived
                      </Badge>
                    )}
                  </div>
                  {team.season && (
                    <p className="text-sm text-gray-600 mt-1">{team.season}</p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      disabled={archiveTeamMutation.isPending || unarchiveTeamMutation.isPending}
                      data-testid={`button-team-menu-${team.id}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditingTeam(team)} data-testid={`menu-edit-team-${team.id}`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Team
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setAddingPlayersToTeam(team)}
                      data-testid={`menu-add-players-${team.id}`}
                      disabled={isArchived}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Add Players
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setManagingTeamAthletes(team)}
                      data-testid={`menu-manage-athletes-${team.id}`}
                      disabled={isArchived}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Manage Athletes
                    </DropdownMenuItem>
                    {isArchived ? (
                      <DropdownMenuItem 
                        onClick={() => unarchiveTeamMutation.mutate(team.id)}
                        disabled={unarchiveTeamMutation.isPending}
                        data-testid={`menu-unarchive-team-${team.id}`}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {unarchiveTeamMutation.isPending ? "Unarchiving..." : "Unarchive Team"}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem 
                        onClick={() => setArchivingTeam(team)}
                        disabled={archiveTeamMutation.isPending}
                        data-testid={`menu-archive-team-${team.id}`}
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive Team
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => handleDeleteTeam(team.id, team.name)}
                      className="text-red-600 focus:text-red-600"
                      data-testid={`menu-delete-team-${team.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Team
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                {team.level && (
                  <p className="text-sm text-gray-500 mb-4">{team.level}</p>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Athletes</span>
                    <span className="text-sm font-medium">{stats.athleteCount}</span>
                  </div>
                  {stats.latestTest && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Latest Test</span>
                      <span className="text-sm font-medium">{stats.latestTest}</span>
                    </div>
                  )}
                  {stats.bestFly10 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Best Fly-10</span>
                      <span className="text-sm font-medium font-mono">{formatFly10TimeWithSpeed(parseFloat(stats.bestFly10))}</span>
                    </div>
                  )}
                  {stats.bestVertical && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Best Vertical</span>
                      <span className="text-sm font-medium font-mono">{stats.bestVertical}in</span>
                    </div>
                  )}
                </div>

                {team.notes && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-600">{team.notes}</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <Button 
                    variant="ghost" 
                    className="w-full text-primary hover:bg-blue-50"
                    onClick={() => setLocation(`/athletes?teamId=${team.id}`)}
                    data-testid={`button-view-athletes-${team.id}`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    View Athletes
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredTeams.length === 0 && teams?.length === 0 && (
          <div className="col-span-full">
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No teams yet</h3>
                <p className="text-gray-600 text-center mb-4">
                  Get started by adding your first team to track athlete performance.
                </p>
                <Button 
                  onClick={() => setShowAddModal(true)}
                  data-testid="button-add-first-team"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Team
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {filteredTeams.length === 0 && teams?.length > 0 && !showArchived && (
          <div className="col-span-full">
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Archive className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">All teams are archived</h3>
                <p className="text-gray-600 text-center mb-4">
                  Enable "Show archived teams" to view them, or add a new team.
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => setShowArchived(true)}
                    data-testid="button-show-archived-teams"
                  >
                    Show Archived Teams
                  </Button>
                  <Button 
                    onClick={() => setShowAddModal(true)}
                    data-testid="button-add-new-team"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Team
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Modals */}
      <TeamModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        team={null}
      />

      <TeamModal
        isOpen={!!editingTeam}
        onClose={() => setEditingTeam(null)}
        team={editingTeam}
      />

      {archivingTeam && (
        <ArchiveTeamModal
          isOpen={!!archivingTeam}
          onClose={() => setArchivingTeam(null)}
          team={archivingTeam}
          onConfirm={archiveTeamMutation.mutate}
          isLoading={archiveTeamMutation.isPending}
        />
      )}

      <AddPlayersToTeamModal
        isOpen={!!addingPlayersToTeam}
        onClose={() => setAddingPlayersToTeam(null)}
        team={addingPlayersToTeam}
      />

      <ManageTeamAthletesModal
        isOpen={!!managingTeamAthletes}
        onClose={() => setManagingTeamAthletes(null)}
        team={managingTeamAthletes}
      />
    </div>
  );
}
