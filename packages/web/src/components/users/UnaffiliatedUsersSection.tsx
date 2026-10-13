import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, STALE_TIME } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";

type UnaffiliatedUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  emails: string[] | null;
  isActive: boolean;
  isParent: boolean;
};

const ROLES = [
  { value: "athlete", label: "Athlete" },
  { value: "coach", label: "Coach" },
  { value: "org_admin", label: "Org Admin" },
];

const displayName = (u: UnaffiliatedUser) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "Unnamed user";

/** Site-admin list of users in no organization, each assignable to one. */
export function UnaffiliatedUsersSection({ organizations: allOrganizations }: { organizations: { id: string; name: string; isActive?: boolean }[] }) {
  // The API refuses inactive organizations, so don't offer them
  const organizations = allOrganizations.filter((o) => o.isActive !== false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<UnaffiliatedUser | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [role, setRole] = useState("athlete");

  const { data: users = [] } = useQuery<UnaffiliatedUser[]>({
    queryKey: ["/api/users/unaffiliated"],
    staleTime: STALE_TIME.REALTIME,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ user, orgId, orgRole }: { user: UnaffiliatedUser; orgId: string; orgRole: string }) => {
      const res = await apiRequest("POST", `/api/organizations/${orgId}/users/${user.id}/assign`, { role: orgRole });
      return res.json();
    },
    onSuccess: (_data, { user, orgId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/unaffiliated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations-with-users"] });
      const orgName = organizations.find((o) => o.id === orgId)?.name ?? "the organization";
      toast({ title: "User assigned", description: `${displayName(user)} was added to ${orgName}.` });
      setTarget(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error assigning user", description: error.message, variant: "destructive" });
    },
  });

  const openDialog = (user: UnaffiliatedUser) => {
    setTarget(user);
    setOrganizationId("");
    setRole("athlete");
  };

  return (
    <div className="space-y-3 border-b pb-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Unaffiliated Users
        </h3>
        <span className="text-sm text-gray-500">
          {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-gray-500">No unaffiliated users.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              data-testid={`unaffiliated-user-${u.id}`}
              className="flex flex-col gap-3 p-3 border rounded-lg sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{displayName(u)}</span>
                  {u.isParent && <Badge variant="secondary">Parent</Badge>}
                  {!u.isActive && <Badge variant="outline">Inactive</Badge>}
                </div>
                <p className="text-sm text-gray-500 truncate">
                  {[u.username && `@${u.username}`, u.emails?.[0]].filter(Boolean).join(" • ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                {u.isParent && <span className="text-xs text-gray-500">Parents can't be assigned to an organization</span>}
                <Button size="sm" variant="outline" disabled={u.isParent} onClick={() => openDialog(u)}>
                  Assign to organization
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to organization</DialogTitle>
            <DialogDescription>
              Add {target && displayName(target)} to an organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Organization</Label>
              <Select value={organizationId} onValueChange={setOrganizationId}>
                <SelectTrigger aria-label="Organization">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!organizationId || assignMutation.isPending}
              onClick={() => target && assignMutation.mutate({ user: target, orgId: organizationId, orgRole: role })}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
