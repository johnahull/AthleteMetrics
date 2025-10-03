import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, Search, RefreshCw, XCircle, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Invitation {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  status: string;
  isUsed: boolean;
  emailSent: boolean;
  emailSentAt?: string;
  acceptedAt?: string;
  cancelledAt?: string;
  expiresAt: string;
  createdAt: string;
  inviterName: string;
  organizationName: string;
}

export default function Invitations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null);

  const { data: invitations = [], isLoading } = useQuery<Invitation[]>({
    queryKey: ["/api/invitations"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/invitations");
      return response.json();
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await apiRequest("POST", `/api/invitations/${invitationId}/resend`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      toast({
        title: "Success",
        description: "Invitation email resent successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resend invitation",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await apiRequest("POST", `/api/invitations/${invitationId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      toast({
        title: "Success",
        description: "Invitation cancelled successfully",
      });
      setCancelDialogOpen(false);
      setSelectedInvitation(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel invitation",
        variant: "destructive",
      });
    },
  });

  const handleCancelClick = (invitation: Invitation) => {
    setSelectedInvitation(invitation);
    setCancelDialogOpen(true);
  };

  const handleCancelConfirm = () => {
    if (selectedInvitation) {
      cancelMutation.mutate(selectedInvitation.id);
    }
  };

  const filteredInvitations = invitations.filter(
    (inv) =>
      inv.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${inv.firstName} ${inv.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.organizationName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (invitation: Invitation) => {
    const now = new Date();
    const expiresAt = new Date(invitation.expiresAt);

    if (invitation.status === 'accepted' || invitation.isUsed) {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Accepted
        </Badge>
      );
    }

    if (invitation.status === 'cancelled') {
      return (
        <Badge variant="secondary">
          <XCircle className="h-3 w-3 mr-1" />
          Cancelled
        </Badge>
      );
    }

    if (expiresAt < now) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          Expired
        </Badge>
      );
    }

    return (
      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
        <Clock className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    );
  };

  const canResend = (invitation: Invitation) => {
    return invitation.status !== 'accepted' &&
           invitation.status !== 'cancelled' &&
           !invitation.isUsed;
  };

  const canCancel = (invitation: Invitation) => {
    return invitation.status !== 'accepted' &&
           invitation.status !== 'cancelled' &&
           !invitation.isUsed;
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading invitations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Mail className="h-6 w-6" />
          Invitation Management
        </h1>
        <p className="text-gray-600 mt-1">View and manage invitations for your organizations</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by email, name, or organization..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {filteredInvitations.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No invitations found</h3>
            <p className="text-gray-600">
              {searchTerm ? "Try adjusting your search terms" : "No invitations have been created yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredInvitations.map((invitation) => (
            <Card key={invitation.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span>
                        {invitation.firstName && invitation.lastName
                          ? `${invitation.firstName} ${invitation.lastName}`
                          : invitation.email}
                      </span>
                      {getStatusBadge(invitation)}
                    </CardTitle>
                    <p className="text-sm text-gray-600 mt-1">{invitation.email}</p>
                  </div>
                  <div className="flex gap-2">
                    {canResend(invitation) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resendMutation.mutate(invitation.id)}
                        disabled={resendMutation.isPending}
                      >
                        <RefreshCw className={`h-4 w-4 mr-1 ${resendMutation.isPending ? 'animate-spin' : ''}`} />
                        Resend
                      </Button>
                    )}
                    {canCancel(invitation) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelClick(invitation)}
                        disabled={cancelMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Organization</p>
                    <p className="font-medium">{invitation.organizationName}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Role</p>
                    <p className="font-medium capitalize">
                      {invitation.role.replace('_', ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Invited By</p>
                    <p className="font-medium">{invitation.inviterName}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Created</p>
                    <p className="font-medium">
                      {new Date(invitation.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {invitation.emailSent && (
                    <div>
                      <p className="text-gray-500">Email Sent</p>
                      <p className="font-medium">
                        {invitation.emailSentAt
                          ? new Date(invitation.emailSentAt).toLocaleDateString()
                          : 'Yes'}
                      </p>
                    </div>
                  )}
                  {invitation.acceptedAt && (
                    <div>
                      <p className="text-gray-500">Accepted</p>
                      <p className="font-medium">
                        {new Date(invitation.acceptedAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {invitation.cancelledAt && (
                    <div>
                      <p className="text-gray-500">Cancelled</p>
                      <p className="font-medium">
                        {new Date(invitation.cancelledAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-500">Expires</p>
                    <p className="font-medium">
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this invitation to{" "}
              <strong>{selectedInvitation?.email}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedInvitation(null)}>
              No, keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Yes, cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
