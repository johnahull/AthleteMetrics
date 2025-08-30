import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import TeamModal from "@/components/team-modal";
import { formatFly10TimeWithSpeed } from "@/lib/speed-utils";
import { useAuth } from "@/lib/auth";

export default function Teams() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationContext } = useAuth();

  const { data: teams, isLoading } = useQuery({
    queryKey: ["/api/teams", organizationContext],
    queryFn: async () => {
      const url = organizationContext 
        ? `/api/teams?organizationId=${organizationContext}`
        : `/api/teams`;
      const response = await fetch(url);
      return response.json();
    }
  });

  const { data: teamStats } = useQuery({
    queryKey: ["/api/analytics/teams", organizationContext],
    queryFn: async () => {
      const url = organizationContext 
        ? `/api/analytics/teams?organizationId=${organizationContext}`
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

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (window.confirm(`Are you sure you want to delete "${teamName}"? This action cannot be undone.`)) {
      deleteTeamMutation.mutate(teamId);
    }
  };

  const getTeamStats = (teamId: string) => {
    return teamStats?.find(stat => stat.teamId === teamId) || {
      playerCount: 0,
      bestFly10: undefined,
      bestVertical: undefined,
      latestTest: undefined,
    };
  };

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
        <h1 className="text-2xl font-semibold text-gray-900">Teams Management</h1>
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
        {teams?.map((team) => {
          const stats = getTeamStats(team.id);
          return (
            <Card key={team.id} className="bg-white hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{team.name}</h3>
                    {team.level && (
                      <p className="text-sm text-gray-500">{team.level}</p>
                    )}
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingTeam(team)}
                      data-testid={`button-edit-team-${team.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTeam(team.id, team.name)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid={`button-delete-team-${team.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Players</span>
                    <span className="text-sm font-medium">{stats.playerCount}</span>
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

        {teams?.length === 0 && (
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
    </div>
  );
}
