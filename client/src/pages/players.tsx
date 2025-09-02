import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Eye, Edit, Trash2, FileUp, UsersRound, Mail, Clock, AlertCircle, Copy, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PlayerModal from "@/components/player-modal";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";

export default function Players() {
  const { user, organizationContext } = useAuth();
  const [location, setLocation] = useLocation();
  
  // Get user's primary role to check access
  const { data: userOrganizations } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
  });
  
  // Use session role as primary source, fallback to organization role, then 'athlete'
  const primaryRole = user?.role || (Array.isArray(userOrganizations) && userOrganizations.length > 0 ? userOrganizations[0]?.role : 'athlete');
  const isSiteAdmin = user?.isSiteAdmin || false;
  
  // Redirect athletes away from this management page
  useEffect(() => {
    if (!isSiteAdmin && primaryRole === "athlete") {
      const playerId = user?.playerId || user?.id;
      setLocation(`/athletes/${playerId}`);
    }
  }, [isSiteAdmin, primaryRole, user?.id, user?.playerId, setLocation]);
  
  // Don't render management UI for athletes
  if (!isSiteAdmin && primaryRole === "athlete") {
    return null;
  }

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [filters, setFilters] = useState({
    teamId: "",
    birthYearFrom: "",
    birthYearTo: "",
    search: "",
  });

  // Check for URL parameters on load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const teamIdParam = urlParams.get('teamId');
    
    if (teamIdParam) {
      setFilters(prev => ({
        ...prev,
        teamId: teamIdParam
      }));
    }
  }, [location]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teams = [] } = useQuery({
    queryKey: ["/api/teams", organizationContext],
    queryFn: async () => {
      const url = organizationContext 
        ? `/api/teams?organizationId=${organizationContext}`
        : `/api/teams`;
      const response = await fetch(url);
      return response.json();
    }
  });

  // Get current user's organizations to fetch invitations
  const { data: userOrgs = [] } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
  });

  // Get athlete invitations for the current organization
  const { data: athleteInvitations = [] } = useQuery({
    queryKey: ["/api/invitations/athletes"],
    enabled: !!userOrgs && userOrgs.length > 0,
  });

  const { data: players = [], isLoading } = useQuery({
    queryKey: ["/api/players", filters, organizationContext],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.teamId) params.append('teamId', filters.teamId);
      if (filters.birthYearFrom) params.append('birthYearFrom', filters.birthYearFrom);
      if (filters.birthYearTo) params.append('birthYearTo', filters.birthYearTo);
      if (filters.search) params.append('search', filters.search);
      
      // Always include organization context for proper filtering
      if (organizationContext) {
        params.append('organizationId', organizationContext);
      } else if (!isSiteAdmin && Array.isArray(userOrganizations) && userOrganizations.length > 0) {
        // For non-site-admins without explicit org context, use their primary organization
        params.append('organizationId', userOrganizations[0].organizationId);
      }
      
      const response = await fetch(`/api/players?${params}`);
      if (!response.ok) throw new Error('Failed to fetch players');
      return response.json();
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      await apiRequest("DELETE", `/api/players/${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({
        title: "Success",
        description: "Athlete deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete athlete",
        variant: "destructive",
      });
    },
  });

  const handleDeletePlayer = async (playerId: string, playerName: string) => {
    if (window.confirm(`Are you sure you want to delete "${playerName}"? This action cannot be undone.`)) {
      deletePlayerMutation.mutate(playerId);
    }
  };

  // Send player invitation mutation (sends to all emails)
  const sendPlayerInvitationMutation = useMutation({
    mutationFn: async ({ playerId, organizationId }: { playerId: string; organizationId: string }) => {
      const response = await apiRequest("POST", "/api/invitations", {
        type: "player",
        playerId,
        role: "athlete", 
        organizationId,
        teamIds: []
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations/athletes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({
        title: "Success",
        description: `${data.invitations?.length || 1} invitations sent to ${data.player?.firstName} ${data.player?.lastName}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send player invitations",
        variant: "destructive",
      });
    },
  });

  // Delete invitation mutation
  const deleteInvitationMutation = useMutation({
    mutationFn: async ({ invitationId }: { invitationId: string }) => {
      await apiRequest("DELETE", `/api/invitations/${invitationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations/athletes"] });
      toast({
        title: "Success",
        description: "Invitation deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete invitation",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const isInvitationExpired = (expiresAt: string) => {
    return new Date() > new Date(expiresAt);
  };

  const formatExpirationDate = (expiresAt: string) => {
    const expDate = new Date(expiresAt);
    const now = new Date();
    const diffTime = expDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return `Expired ${Math.abs(diffDays)} days ago`;
    } else if (diffDays === 0) {
      return 'Expires today';
    } else {
      return `Expires in ${diffDays} days`;
    }
  };

  const handleSendPlayerInvitation = (playerId: string) => {
    if (!userOrgs || userOrgs.length === 0) {
      toast({
        title: "Error",
        description: "No organization context found",
        variant: "destructive",
      });
      return;
    }
    
    const orgId = userOrgs[0]?.organization?.id;
    if (!orgId) {
      toast({
        title: "Error",
        description: "Organization ID not found",
        variant: "destructive",
      });
      return;
    }
    
    sendPlayerInvitationMutation.mutate({ playerId, organizationId: orgId });
  };

  const handleDeleteInvitation = (invitationId: string) => {
    if (window.confirm('Are you sure you want to delete this invitation?')) {
      deleteInvitationMutation.mutate({ invitationId });
    }
  };

  const copyInviteLink = (token: string) => {
    const inviteLink = `${window.location.origin}/accept-invitation?token=${token}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: "Success",
      description: "Invitation link copied to clipboard",
    });
  };

  const clearFilters = () => {
    setFilters({
      teamId: "",
      birthYearFrom: "",
      birthYearTo: "",
      search: "",
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 space-y-4 sm:space-y-0">
        <h1 className="text-2xl font-semibold text-gray-900">Athletes Management</h1>
        <div className="flex space-x-3">
          <Button 
            variant="outline" 
            className="bg-gray-600 text-white hover:bg-gray-700"
            onClick={() => setLocation('/import-export')}
            data-testid="button-import-csv"
          >
            <FileUp className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button 
            onClick={() => setShowAddModal(true)}
            className="bg-primary hover:bg-blue-700"
            data-testid="button-add-player"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Athlete
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-white mb-6">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Team</label>
              <Select value={filters.teamId} onValueChange={(value) => setFilters(prev => ({ ...prev, teamId: value }))}>
                <SelectTrigger data-testid="select-team-filter">
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  <SelectItem value="none">Independent Athletes (No Team)</SelectItem>
                  {teams?.map((team: any) => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Birth Year From</label>
              <Select value={filters.birthYearFrom} onValueChange={(value) => setFilters(prev => ({ ...prev, birthYearFrom: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {Array.from({ length: 13 }, (_, i) => 2008 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Birth Year To</label>
              <Select value={filters.birthYearTo} onValueChange={(value) => setFilters(prev => ({ ...prev, birthYearTo: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {Array.from({ length: 13 }, (_, i) => 2008 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search athletes..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-10"
                  data-testid="input-search-athletes"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              </div>
            </div>
          </div>
          
          {(filters.teamId || filters.birthYearFrom || filters.birthYearTo || filters.search) && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">Applied filters:</span>
                <div className="flex space-x-2">
                  {filters.teamId && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      Team: {teams?.find((t: any) => t.id === filters.teamId)?.name}
                    </span>
                  )}
                  {filters.birthYearFrom && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      From: {filters.birthYearFrom}
                    </span>
                  )}
                  {filters.birthYearTo && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      To: {filters.birthYearTo}
                    </span>
                  )}
                  {filters.search && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      Search: {filters.search}
                    </span>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                onClick={clearFilters}
                className="text-gray-600 hover:text-gray-800"
                data-testid="button-clear-filters"
              >
                Clear all filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Athlete Invitations */}
      {athleteInvitations && athleteInvitations.length > 0 && (
        <Card className="bg-white mb-6">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Athlete Invitations ({athleteInvitations.length})
            </h3>
            <div className="space-y-3">
              {athleteInvitations?.map((invitation: any) => {
                const isExpired = isInvitationExpired(invitation.expiresAt);
                return (
                  <div 
                    key={invitation.id} 
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      isExpired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <div className="flex-1">
                      {invitation.firstName && invitation.lastName ? (
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{invitation.firstName} {invitation.lastName}</p>
                          <p className="text-gray-600 text-xs">{invitation.email}</p>
                        </div>
                      ) : (
                        <p className="font-medium text-gray-900 text-sm">{invitation.email}</p>
                      )}
                      <div className="space-y-1">
                        <p className="text-xs text-gray-600">
                          Invited {new Date(invitation.createdAt).toLocaleDateString()}
                        </p>
                        <p className={`text-xs ${isExpired ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          {formatExpirationDate(invitation.expiresAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Athlete {isExpired ? '(Expired)' : '(Pending)'}
                      </Badge>
                      <div className={`flex items-center gap-1 text-xs ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                        {isExpired ? (
                          <>
                            <AlertCircle className="h-3 w-3" />
                            <span>Expired</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3" />
                            <span>Awaiting response</span>
                          </>
                        )}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyInviteLink(invitation.token)}
                          title="Copy invitation link"
                          data-testid={`button-copy-link-${invitation.id}`}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteInvitation(invitation.id)}
                          title="Delete invitation"
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-delete-invitation-${invitation.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Players Table */}
      <Card className="bg-white">
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">All Athletes</h3>
              <span className="text-sm text-gray-500" data-testid="athletes-count">
                {players?.length || 0} athletes
              </span>
            </div>
          </div>
          
          {players?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <UsersRound className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No athletes found</h3>
              <p className="text-gray-600 text-center mb-4">
                {Object.values(filters).some((v: any) => v) ? 
                  "Try adjusting your filters or add new athletes." :
                  "Get started by adding your first athlete."
                }
              </p>
              <Button 
                onClick={() => setShowAddModal(true)}
                data-testid="button-add-first-athlete"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Athlete
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-sm font-medium text-gray-500">
                    <th className="px-6 py-3">Athlete</th>
                    <th className="px-6 py-3">Team</th>
                    <th className="px-6 py-3">Birth Year</th>
                    <th className="px-6 py-3">School</th>
                    <th className="px-6 py-3">Sport</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {players?.map((player: any) => (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                            <span className="text-white font-medium text-sm">
                              {player.firstName.charAt(0)}{player.lastName.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <button 
                              onClick={() => setLocation(`/athletes/${player.id}`)}
                              className="font-medium text-gray-900 hover:text-primary cursor-pointer text-left"
                            >
                              {player.fullName}
                            </button>
                            <p className="text-gray-500 text-xs">ID: #{player.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {player.teams && player.teams.length > 0 
                          ? player.teams.length > 1 
                            ? `${player.teams[0].name} (+${player.teams.length - 1} more)`
                            : player.teams[0].name
                          : "Independent"
                        }
                      </td>
                      <td className="px-6 py-4 text-gray-600">{player.birthYear}</td>
                      <td className="px-6 py-4 text-gray-600">{player.school || "N/A"}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {player.sports && player.sports.length > 0 
                          ? player.sports.length > 1 
                            ? `${player.sports[0]} (+${player.sports.length - 1} more)`
                            : player.sports[0]
                          : "N/A"
                        }
                      </td>
                      <td className="px-6 py-4">
                        {(player as any).hasLogin ? (
                          <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocation(`/athletes/${player.id}`)}
                            data-testid={`button-view-player-${player.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingPlayer(player)}
                            data-testid={`button-edit-player-${player.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {/* Send Player Invitation Button - sends to all emails */}
                          {(player as any).emails && (player as any).emails.length > 0 && !athleteInvitations?.some((inv: any) => (player as any).emails.includes(inv.email)) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSendPlayerInvitation(player.id)}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              disabled={sendPlayerInvitationMutation.isPending}
                              title={`Send invitations to all emails (${(player as any).emails.length} addresses)`}
                              data-testid={`button-invite-player-${player.id}`}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePlayer(player.id, player.fullName)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-player-${player.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <PlayerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        player={null}
        teams={teams || []}
      />

      <PlayerModal
        isOpen={!!editingPlayer}
        onClose={() => setEditingPlayer(null)}
        player={editingPlayer}
        teams={teams || []}
      />
    </div>
  );
}
