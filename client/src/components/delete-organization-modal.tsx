import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Users, Building2, Activity } from "lucide-react";
import { queries } from "@/lib/api";

interface Organization {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

interface DeleteOrganizationModalProps {
  organization: Organization;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmationName: string) => void;
  isLoading?: boolean;
}

export default function DeleteOrganizationModal({
  organization,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false
}: DeleteOrganizationModalProps) {
  const [confirmationName, setConfirmationName] = useState("");

  // Reset confirmation input when modal closes or organization changes
  useEffect(() => {
    setConfirmationName("");
  }, [isOpen, organization.id]);

  // Fetch dependency counts when modal opens using centralized API client
  const { data: dependencies, isError: isDependenciesError, error: dependenciesError } = useQuery<{ users: number; teams: number; measurements: number }>({
    ...queries.organizationDependencies(organization.id),
    enabled: isOpen && !!organization.id,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Case-insensitive comparison with trimming
    if (confirmationName.trim().toLowerCase() === organization.name.trim().toLowerCase()) {
      onConfirm(confirmationName);
    }
  };

  const hasDependencies = dependencies && (dependencies.users > 0 || dependencies.teams > 0 || dependencies.measurements > 0);
  // Case-insensitive comparison with trimming
  const confirmationMatches = confirmationName.trim().toLowerCase() === organization.name.trim().toLowerCase();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete Organization: {organization.name}</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the organization and all associated data.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error loading dependencies */}
          {isDependenciesError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Loading Dependencies</AlertTitle>
              <AlertDescription>
                {dependenciesError instanceof Error ? dependenciesError.message : 'Failed to load organization dependencies. Please try again.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Dependency Counts */}
          {dependencies && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">Organization Contents:</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
                  <Users className="h-4 w-4 text-gray-600" />
                  <div>
                    <div className="text-lg font-semibold">{dependencies.users}</div>
                    <div className="text-xs text-gray-600">Users</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
                  <Building2 className="h-4 w-4 text-gray-600" />
                  <div>
                    <div className="text-lg font-semibold">{dependencies.teams}</div>
                    <div className="text-xs text-gray-600">Teams</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
                  <Activity className="h-4 w-4 text-gray-600" />
                  <div>
                    <div className="text-lg font-semibold">{dependencies.measurements}</div>
                    <div className="text-xs text-gray-600">Measurements</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Warning if has dependencies */}
          {hasDependencies && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Cannot Delete</AlertTitle>
              <AlertDescription>
                This organization has active dependencies. You must remove all users, teams, and measurements before deletion.
                <div className="mt-2 text-sm">
                  <strong>Suggestion:</strong> Use "Deactivate" instead to preserve data while disabling the organization.
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Confirmation input */}
          {!hasDependencies && (
            <>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warning: Permanent Deletion</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    <li>All organization data will be permanently deleted</li>
                    <li>This action cannot be undone</li>
                    <li>Consider deactivation if you might need this data later</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <label htmlFor="confirmation" className="text-sm font-medium">
                  Type <span className="font-mono font-semibold">{organization.name}</span> to confirm deletion:
                </label>
                <Input
                  id="confirmation"
                  value={confirmationName}
                  onChange={(e) => setConfirmationName(e.target.value)}
                  placeholder={organization.name}
                  disabled={isLoading}
                  className={confirmationMatches ? "border-green-500" : ""}
                  data-testid="delete-org-confirmation-input"
                />
                {confirmationName && !confirmationMatches && (
                  <p className="text-sm text-destructive">Name does not match</p>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              data-testid="cancel-delete-org-button"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isLoading || !confirmationMatches || hasDependencies || isDependenciesError}
              data-testid="confirm-delete-org-button"
            >
              {isLoading ? "Deleting..." : "Delete Organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
