import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Users, UserMinus, Eye, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Team } from "@shared/schema";

interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  emails: string[];
  role: string;
  birthYear?: number;
  school?: string;
  sports?: string[];
  teams?: Array<{
    id: string;
    name: string;
    isActive: string;
    season?: string;
  }>;
}

interface ManageTeamAthletesModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
}

export default function ManageTeamAthletesModal({ isOpen, onClose, team }: ManageTeamAthletesModalProps) {
  const [searchTerm, setSearchTerm] = useState("");

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

  // Reset search when modal opens/closes or team changes
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
    }
  }, [isOpen, team?.id]);

  // Fetch team athletes
  const { data: athletes = [], isLoading: isLoadingAthletes } = useQuery({
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

  // Filter athletes based on search term
  const filteredAthletes = athletes.filter((athlete: Athlete) => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    return (
      athlete.firstName.toLowerCase().includes(searchLower) ||
      athlete.lastName.toLowerCase().includes(searchLower) ||
      athlete.fullName.toLowerCase().includes(searchLower)
    );
  });

  // Remove athlete from team mutation
  const removeAthleteFromTeamMutation = useMutation({
    mutationFn: async ({ athleteId, teamId }: { athleteId: string; teamId: string }) => {
      await apiRequest("DELETE", `/api/teams/${teamId}/athletes/${athleteId}`);
    },
    onSuccess: (_, { athleteId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/teams"] });

      const athlete = athletes.find((a: Athlete) => a.id === athleteId);
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

  const handleRemoveAthlete = (athleteId: string, athleteName: string) => {
    if (window.confirm(`Are you sure you want to remove "${athleteName}" from ${team?.name}?`)) {
      removeAthleteFromTeamMutation.mutate({ athleteId, teamId: team!.id });
    }
  };

  const isPending = removeAthleteFromTeamMutation.isPending;

  if (!team) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage Athletes - {team.name}
          </DialogTitle>
          <DialogDescription>
            View and remove athletes from this team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search athletes by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              disabled={isPending}
            />
          </div>

          {/* Athletes List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {isLoadingAthletes ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2">Loading athletes...</span>
              </div>
            ) : filteredAthletes.length === 0 ? (
              <Card className="bg-gray-50">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  {athletes.length === 0 ? (
                    <>
                      <Users className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No athletes on this team</h3>
                      <p className="text-gray-600 text-center">
                        This team doesn't have any athletes yet. Use "Add Players" to add athletes to this team.
                      </p>
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
              filteredAthletes.map((athlete: Athlete) => {
                const otherTeams = athlete.teams?.filter(t => t.id !== team.id && t.isActive === "true") || [];

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
                              {athlete.fullName}
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
                                  {otherTeam.name}
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
                          onClick={() => handleRemoveAthlete(athlete.id, athlete.fullName)}
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

          {/* Team Stats */}
          {filteredAthletes.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>{filteredAthletes.length}</strong> athlete{filteredAthletes.length !== 1 ? 's' : ''} on <strong>{team.name}</strong>
                {searchTerm && athletes.length > filteredAthletes.length &&
                  ` (${athletes.length} total)`
                }
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
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}