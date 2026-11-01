import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, STALE_TIME } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle, Clock, Link2, Loader2, Mail, Search, UserCheck, Users, XCircle } from "lucide-react";

// One pending request as returned by GET /api/membership-requests/pending (explicit, minimal fields)
interface PendingRequest {
  id: string;
  userId: string;
  organizationId: string;
  requestedRole: string;
  discoveryMethod: string | null;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    isEmailVerified: boolean;
  };
  organization: { id: string; name: string };
}

interface UnlinkedAthlete {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  school: string | null;
}

const PENDING_KEY = "/api/membership-requests/pending";

/**
 * Pending membership requests for User Management. The API decides what the caller may see: a site admin gets
 * every organization, an org admin only theirs, anyone else a 403 (rendered as nothing).
 */
export function PendingMembershipRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [linkingRequest, setLinkingRequest] = useState<PendingRequest | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [athleteSearch, setAthleteSearch] = useState("");

  const { data, isLoading, error } = useQuery<{ requests: PendingRequest[]; truncated?: boolean }>({
    queryKey: [PENDING_KEY],
    staleTime: STALE_TIME.REALTIME,
  });
  const requests = data?.requests;
  const truncated = data?.truncated === true;

  // The linking dialog lists athletes of THE REQUEST'S organization (requests from several organizations are shown together)
  const linkOrgId = linkingRequest?.organizationId;
  const { data: unlinkedData, isLoading: loadingUnlinked } = useQuery<{ athletes: UnlinkedAthlete[] }>({
    queryKey: [`/api/organizations/${linkOrgId}/unlinked-athletes`],
    enabled: linkingRequest !== null,
  });
  const search = athleteSearch.toLowerCase();
  const filteredAthletes = unlinkedData?.athletes?.filter(
    (a) =>
      !search ||
      a.fullName?.toLowerCase().includes(search) ||
      a.firstName?.toLowerCase().includes(search) ||
      a.lastName?.toLowerCase().includes(search) ||
      a.school?.toLowerCase().includes(search) ||
      a.birthYear?.toString().includes(search),
  );

  const closeLinkDialog = () => {
    setLinkingRequest(null);
    setSelectedAthleteId(null);
    setAthleteSearch("");
  };

  // One refresh per decision: the list, plus what an approval changes (rosters, unaffiliated users).
  const refreshAfterDecision = (organizationId: string, approved: boolean) => {
    queryClient.invalidateQueries({ queryKey: [PENDING_KEY] });
    if (approved) {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/unaffiliated"] });
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/profile`] });
    }
  };

  // A failed decision usually means someone else already handled the request: show why, and refresh the list so
  // the row (and its live buttons) goes away instead of staying stale.
  const onError = (err: Error) => {
    toast({ title: "Error", description: err.message, variant: "destructive" });
    queryClient.invalidateQueries({ queryKey: [PENDING_KEY] });
  };

  const approveMutation = useMutation({
    mutationFn: async (request: PendingRequest) => {
      const res = await apiRequest("POST", `/api/membership-requests/${request.id}/approve`);
      return res.json();
    },
    onSuccess: (_d, request) => {
      refreshAfterDecision(request.organizationId, true);
      toast({ title: "Request Approved", description: "The membership request has been approved." });
    },
    onError,
  });

  const approveWithLinkMutation = useMutation({
    mutationFn: async ({ request, linkToAthleteId }: { request: PendingRequest; linkToAthleteId: string }) => {
      const res = await apiRequest("POST", `/api/membership-requests/${request.id}/approve`, { linkToAthleteId });
      return res.json();
    },
    onSuccess: (_d, { request }) => {
      refreshAfterDecision(request.organizationId, true);
      queryClient.invalidateQueries({ queryKey: [`/api/organizations/${request.organizationId}/unlinked-athletes`] });
      closeLinkDialog();
      toast({
        title: "Request Approved & Linked",
        description: "The membership request has been approved and linked to the existing athlete profile.",
      });
    },
    onError,
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ request, reason }: { request: PendingRequest; reason?: string }) => {
      const res = await apiRequest("POST", `/api/membership-requests/${request.id}/reject`, { reason });
      return res.json();
    },
    onSuccess: (_d, { request }) => {
      refreshAfterDecision(request.organizationId, false);
      setRejectingId(null);
      setRejectionReason("");
      toast({ title: "Request Rejected", description: "The membership request has been rejected." });
    },
    onError,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Pending Membership Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    // 403 = the caller is not an organization admin: nothing to show. Anything else is a real failure; say so
    // without echoing the server's text.
    if (error.message.startsWith("403")) return null;
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Couldn't load membership requests. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  if (!requests || requests.length === 0) return null;

  // Group by organization, keeping the server's oldest-first order inside each group
  const groups = new Map<string, { name: string; items: PendingRequest[] }>();
  for (const r of requests) {
    const group = groups.get(r.organization.id) ?? { name: r.organization.name, items: [] };
    group.items.push(r);
    groups.set(r.organization.id, group);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Pending Membership Requests ({requests.length}
          {truncated ? "+" : ""})
        </CardTitle>
        <CardDescription>
          Review and approve people requesting to join your organizations
          {truncated && ` (showing the oldest ${requests.length}; handle these to see the rest)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {[...groups.entries()].map(([orgId, group]) => (
          <section key={orgId} aria-label={group.name} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{group.name}</h3>
            {group.items.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{request.user.fullName}</div>
                  {request.user.email && (
                    <div className="text-sm text-muted-foreground flex items-center gap-2 break-all">
                      <Mail className="h-3 w-3 shrink-0" />
                      {request.user.email}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                    <Clock className="h-3 w-3" />
                    Requested {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                    {request.discoveryMethod && (
                      <Badge variant="outline" className="text-xs">
                        via {request.discoveryMethod === "join_code" ? "join code" : "directory"}
                      </Badge>
                    )}
                    {!request.user.isEmailVerified && (
                      <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">
                        Email not verified
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {rejectingId === request.id ? (
                    <div className="flex items-center gap-2">
                      <Textarea
                        placeholder="Reason (optional)"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="w-48 h-16 text-sm"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => rejectMutation.mutate({ request, reason: rejectionReason || undefined })}
                        disabled={rejectMutation.isPending && rejectMutation.variables?.request.id === request.id}
                      >
                        {rejectMutation.isPending && rejectMutation.variables?.request.id === request.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Confirm"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectionReason("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => approveMutation.mutate(request)}
                        disabled={approveMutation.isPending && approveMutation.variables?.id === request.id}
                        data-testid={`approve-request-${request.id}`}
                      >
                        {approveMutation.isPending && approveMutation.variables?.id === request.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-1" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => {
                          setLinkingRequest(request);
                          setSelectedAthleteId(null);
                          setAthleteSearch("");
                        }}
                        data-testid={`link-request-${request.id}`}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        Link to Existing
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setRejectingId(request.id)}
                        data-testid={`reject-request-${request.id}`}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))}

        {/* Link to Existing Athlete Dialog */}
        <Dialog open={linkingRequest !== null} onOpenChange={(open) => !open && closeLinkDialog()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Link to Existing Athlete
              </DialogTitle>
              <DialogDescription>
                Select an existing athlete profile to link with this membership request. The requester's account will
                inherit the existing athlete's data (measurements, team memberships).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search athletes by name, school, or birth year..."
                  className="pl-9"
                  value={athleteSearch}
                  onChange={(e) => setAthleteSearch(e.target.value)}
                />
              </div>

              <div className="max-h-60 overflow-y-auto border rounded-md">
                {loadingUnlinked ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredAthletes && filteredAthletes.length > 0 ? (
                  <div className="divide-y">
                    {filteredAthletes.map((athlete) => (
                      <div
                        key={athlete.id}
                        className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                          selectedAthleteId === athlete.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                        }`}
                        onClick={() => setSelectedAthleteId(athlete.id)}
                      >
                        <div className="font-medium">{athlete.fullName}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                          {athlete.birthYear && <span>Born {athlete.birthYear}</span>}
                          {athlete.school && (
                            <>
                              {athlete.birthYear && <span>•</span>}
                              <span>{athlete.school}</span>
                            </>
                          )}
                          {!athlete.birthYear && !athlete.school && <span className="italic">No additional info</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {athleteSearch ? "No athletes match your search" : "No unlinked athletes found"}
                    </p>
                    <p className="text-xs mt-1">
                      {!athleteSearch && "All athletes in this organization have login credentials"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={closeLinkDialog}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  linkingRequest &&
                  selectedAthleteId &&
                  approveWithLinkMutation.mutate({ request: linkingRequest, linkToAthleteId: selectedAthleteId })
                }
                disabled={!selectedAthleteId || approveWithLinkMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {approveWithLinkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Link & Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
