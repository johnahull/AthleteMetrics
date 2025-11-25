import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Users, Plus, UserMinus, UserCog, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { sanitizeSearchTerm } from "@shared/input-sanitization";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { Team, User, CoachTeamWithDetails } from "@shared/schema";

// Coach role labels
const ROLE_LABELS: Record<string, string> = {
  head_coach: "Head Coach",
  assistant_coach: "Assistant Coach",
  stats_manager: "Stats Manager",
};

interface TeamCoachesModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
}

export default function TeamCoachesModal({ isOpen, onClose, team }: TeamCoachesModalProps) {
  const [activeTab, setActiveTab] = useState<'current' | 'add'>('current');
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'head_coach' | 'assistant_coach' | 'stats_manager'>('assistant_coach');
  const [notes, setNotes] = useState("");

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

  // Reset state when modal opens/closes
  const resetModalState = useCallback(() => {
    setSearchTerm("");
    setSelectedCoachId(null);
    setSelectedRole('assistant_coach');
    setNotes("");
    setActiveTab('current');
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetModalState();
    }
  }, [isOpen, team?.id, resetModalState]);

  // Fetch current coaches assigned to this team
  const { data: currentCoaches = [], isLoading: isLoadingCurrent } = useQuery<CoachTeamWithDetails[]>({
    queryKey: ["/api/teams", team?.id, "coaches"],
    queryFn: async () => {
      if (!team?.id) return [];
      const response = await fetch(`/api/teams/${team.id}/coaches`);
      if (!response.ok) throw new Error('Failed to fetch team coaches');
      return response.json();
    },
    enabled: isOpen && !!team?.id
  });

  // Fetch all coaches in the organization for adding
  const { data: availableCoaches = [], isLoading: isLoadingAvailable } = useQuery<User[]>({
    queryKey: ["/api/users", effectiveOrganizationId, "coaches"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveOrganizationId) params.append('organizationId', effectiveOrganizationId);
      params.append('role', 'coach'); // Only get coaches

      const url = `/api/users?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch coaches');
      const data = await response.json();
      return Array.isArray(data) ? data : data.users || [];
    },
    enabled: isOpen && !!team?.id
  });

  // Filter available coaches not already assigned
  const assignedCoachIds = currentCoaches.map(c => c.coachId);
  const unassignedCoaches = availableCoaches.filter(
    coach => !assignedCoachIds.includes(coach.id)
  );

  // Filter by search term
  const filteredUnassignedCoaches = unassignedCoaches.filter(coach => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      coach.fullName?.toLowerCase().includes(search) ||
      coach.firstName?.toLowerCase().includes(search) ||
      coach.lastName?.toLowerCase().includes(search)
    );
  });

  const filteredCurrentCoaches = currentCoaches.filter(assignment => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return assignment.coach.fullName?.toLowerCase().includes(search);
  });

  // Assign coach mutation
  const assignCoachMutation = useMutation({
    mutationFn: async ({ coachId, role, notes }: { coachId: string; role: string; notes?: string }) => {
      const response = await apiRequest("POST", `/api/teams/${team!.id}/coaches`, {
        coachId,
        role,
        notes
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team?.id, "coaches"] });
      toast({
        title: "Success",
        description: "Coach assigned to team successfully",
      });
      setSelectedCoachId(null);
      setSelectedRole('assistant_coach');
      setNotes("");
      setActiveTab('current');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign coach to team",
        variant: "destructive",
      });
    },
  });

  // Remove coach mutation
  const removeCoachMutation = useMutation({
    mutationFn: async (coachId: string) => {
      await apiRequest("DELETE", `/api/teams/${team!.id}/coaches/${coachId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team?.id, "coaches"] });
      toast({
        title: "Success",
        description: "Coach removed from team successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove coach from team",
        variant: "destructive",
      });
    },
  });

  // Update coach assignment mutation
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ coachId, role, notes }: { coachId: string; role?: string; notes?: string }) => {
      const response = await apiRequest("PATCH", `/api/teams/${team!.id}/coaches/${coachId}`, {
        role,
        notes
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", team?.id, "coaches"] });
      toast({
        title: "Success",
        description: "Coach assignment updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update coach assignment",
        variant: "destructive",
      });
    },
  });

  const handleRemoveCoach = (coachId: string, coachName: string) => {
    if (window.confirm(`Are you sure you want to remove "${coachName}" from ${team?.name}?`)) {
      removeCoachMutation.mutate(coachId);
    }
  };

  const handleAssignCoach = () => {
    if (!selectedCoachId) {
      toast({
        title: "No coach selected",
        description: "Please select a coach to assign to the team",
        variant: "destructive",
      });
      return;
    }
    assignCoachMutation.mutate({
      coachId: selectedCoachId,
      role: selectedRole,
      notes: notes || undefined
    });
  };

  const isPending = assignCoachMutation.isPending || removeCoachMutation.isPending || updateAssignmentMutation.isPending;

  if (!team) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error('TeamCoachesModal Error:', error);
          console.error('Error Info:', errorInfo);
        }}
        fallback={
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <UserCog className="h-5 w-5" />
                Coach Management Error
              </DialogTitle>
              <DialogDescription>
                Something went wrong while loading the coach management interface. Please try again.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end pt-4">
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          </DialogContent>
        }
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Team Coaches - {team.name}
            </DialogTitle>
            <DialogDescription>
              Manage coaches assigned to this team. Coaches will receive notifications about team events.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'current' | 'add')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="current" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Current Coaches ({filteredCurrentCoaches.length})
              </TabsTrigger>
              <TabsTrigger value="add" className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Assign Coach ({filteredUnassignedCoaches.length} available)
              </TabsTrigger>
            </TabsList>

            {/* Search Bar */}
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search coaches by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(sanitizeSearchTerm(e.target.value))}
                className="pl-10"
                disabled={isPending}
              />
            </div>

            <TabsContent value="current" className="space-y-4">
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {isLoadingCurrent ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2">Loading coaches...</span>
                  </div>
                ) : filteredCurrentCoaches.length === 0 ? (
                  <Card className="bg-gray-50">
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <UserCog className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {currentCoaches.length === 0 ? "No coaches assigned" : "No coaches match your search"}
                      </h3>
                      <p className="text-gray-600 text-center mb-4">
                        {currentCoaches.length === 0
                          ? "This team doesn't have any assigned coaches yet."
                          : `Try adjusting your search term: "${searchTerm}"`}
                      </p>
                      {currentCoaches.length === 0 && (
                        <Button onClick={() => setActiveTab('add')} variant="outline">
                          <UserPlus className="h-4 w-4 mr-2" />
                          Assign Coach
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  filteredCurrentCoaches.map((assignment) => (
                    <Card key={assignment.id} className="hover:bg-gray-50">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-medium text-sm">
                              {assignment.coach.firstName.charAt(0)}{assignment.coach.lastName.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {assignment.coach.fullName}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {ROLE_LABELS[assignment.role || 'assistant_coach']}
                              </Badge>
                              {assignment.notes && (
                                <span className="text-xs text-gray-500 truncate max-w-48">
                                  {assignment.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Select
                            value={assignment.role || 'assistant_coach'}
                            onValueChange={(value) => {
                              updateAssignmentMutation.mutate({
                                coachId: assignment.coachId,
                                role: value
                              });
                            }}
                            disabled={isPending}
                          >
                            <SelectTrigger className="w-36 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="head_coach">Head Coach</SelectItem>
                              <SelectItem value="assistant_coach">Assistant Coach</SelectItem>
                              <SelectItem value="stats_manager">Stats Manager</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveCoach(assignment.coachId, assignment.coach.fullName)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={isPending}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {currentCoaches.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>{currentCoaches.length}</strong> coach{currentCoaches.length !== 1 ? 'es' : ''} assigned to <strong>{team.name}</strong>
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="add" className="space-y-4">
              {/* Coach Selection */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Coach</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                    {isLoadingAvailable ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <span className="ml-2 text-sm">Loading coaches...</span>
                      </div>
                    ) : filteredUnassignedCoaches.length === 0 ? (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        {unassignedCoaches.length === 0
                          ? "All coaches are already assigned to this team"
                          : "No coaches match your search"}
                      </div>
                    ) : (
                      filteredUnassignedCoaches.map((coach) => (
                        <div
                          key={coach.id}
                          className={`flex items-center p-2 rounded cursor-pointer transition-colors ${
                            selectedCoachId === coach.id
                              ? 'bg-blue-50 border border-blue-200'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setSelectedCoachId(coach.id)}
                        >
                          <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center mr-3">
                            <span className="text-white font-medium text-xs">
                              {coach.firstName?.charAt(0)}{coach.lastName?.charAt(0)}
                            </span>
                          </div>
                          <span className="font-medium text-sm">
                            {coach.fullName || `${coach.firstName} ${coach.lastName}`}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Role Selection */}
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={selectedRole}
                    onValueChange={(value) => setSelectedRole(value as typeof selectedRole)}
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="head_coach">Head Coach</SelectItem>
                      <SelectItem value="assistant_coach">Assistant Coach</SelectItem>
                      <SelectItem value="stats_manager">Stats Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any notes about this assignment..."
                    className="resize-none"
                    rows={2}
                    maxLength={500}
                    disabled={isPending}
                  />
                </div>

                {/* Assign Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleAssignCoach}
                    disabled={isPending || !selectedCoachId}
                    className="flex items-center gap-2"
                  >
                    {isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Assigning...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Assign Coach
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Done
            </Button>
          </div>
        </DialogContent>
      </ErrorBoundary>
    </Dialog>
  );
}
