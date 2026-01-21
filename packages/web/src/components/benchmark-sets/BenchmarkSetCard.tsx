/**
 * BenchmarkSetCard - Individual benchmark set card for the list view
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MoreHorizontal, Pencil, Trash, Calendar, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  useDeleteBenchmarkSet,
  useUpdateBenchmarkSet,
  useToggleSiteBenchmarkSetVisibility,
  type BenchmarkSetWithVisibility,
} from "@/lib/benchmark-sets-api";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useLocation } from "wouter";

interface BenchmarkSetCardProps {
  benchmarkSet: BenchmarkSetWithVisibility;
  organizationId: string;
  onEdit: (set: BenchmarkSetWithVisibility) => void;
}

export function BenchmarkSetCard({
  benchmarkSet,
  organizationId,
  onEdit,
}: BenchmarkSetCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Site-level sets are read-only for organizations
  const isSiteSet = benchmarkSet.organizationId === null;
  // Check if user can manage site set visibility (coaches, org admins, site admins)
  const canManageVisibility = user?.role === 'coach' || user?.role === 'org_admin' || user?.isSiteAdmin;
  // Check if this site set is currently hidden for the org
  const isHiddenForOrg = benchmarkSet.isHiddenForOrg === true;

  const deleteMutation = useDeleteBenchmarkSet(organizationId);
  const updateMutation = useUpdateBenchmarkSet(organizationId, benchmarkSet.id);
  const toggleVisibilityMutation = useToggleSiteBenchmarkSetVisibility(organizationId);

  const handleToggleActive = async () => {
    try {
      await updateMutation.mutateAsync({ isActive: !benchmarkSet.isActive });
      toast({
        title: benchmarkSet.isActive ? "Set Deactivated" : "Set Activated",
        description: `"${benchmarkSet.name}" is now ${benchmarkSet.isActive ? "inactive" : "active"}.`,
      });
    } catch (err) {
      toast({
        title: "Update Failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleToggleVisibility = async () => {
    try {
      await toggleVisibilityMutation.mutateAsync({
        setId: benchmarkSet.id,
        isEnabled: isHiddenForOrg, // If hidden, enable (show). If shown, disable (hide).
      });
      toast({
        title: isHiddenForOrg ? "Set Now Visible" : "Set Hidden",
        description: isHiddenForOrg
          ? `"${benchmarkSet.name}" is now visible for your organization.`
          : `"${benchmarkSet.name}" is now hidden for your organization.`,
      });
    } catch (err) {
      toast({
        title: "Update Failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(benchmarkSet.id);
      toast({
        title: "Benchmark Set Deleted",
        description: `"${benchmarkSet.name}" has been deleted.`,
      });
    } catch (err) {
      toast({
        title: "Delete Failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
    setShowDeleteDialog(false);
  };

  const handleCardClick = () => {
    setLocation(`/organizations/${organizationId}/benchmark-sets/${benchmarkSet.id}`);
  };

  return (
    <>
      <Card
        className={`cursor-pointer hover:shadow-md transition-shadow ${
          !benchmarkSet.isActive || isHiddenForOrg ? "opacity-60" : ""
        }`}
        data-set-id={benchmarkSet.id}
        onClick={handleCardClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">{benchmarkSet.name}</CardTitle>
              {benchmarkSet.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {benchmarkSet.description}
                </p>
              )}
            </div>
            {/* Show appropriate menu based on set type */}
            {!isSiteSet ? (
              // Org-level sets: full edit/delete menu
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(benchmarkSet);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : canManageVisibility ? (
              // Site-level sets + org admin: show hide/show button
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleVisibility();
                }}
                disabled={toggleVisibilityMutation.isPending}
                className="h-8"
              >
                {isHiddenForOrg ? (
                  <>
                    <Eye className="h-4 w-4 mr-1" />
                    Show
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4 mr-1" />
                    Hide
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {isSiteSet && (
              <Badge variant="default" className="bg-blue-600">Site</Badge>
            )}
            {isHiddenForOrg && (
              <Badge variant="secondary" className="bg-gray-500 text-white">Hidden</Badge>
            )}
            {benchmarkSet.sport && (
              <Badge variant="outline">{benchmarkSet.sport}</Badge>
            )}
            {benchmarkSet.level && (
              <Badge variant="outline">{benchmarkSet.level}</Badge>
            )}
            {benchmarkSet.gender && (
              <Badge variant="outline">{benchmarkSet.gender}</Badge>
            )}
            {benchmarkSet.isTemplate && (
              <Badge variant="secondary">Template</Badge>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center text-xs text-muted-foreground">
              <Calendar className="mr-1 h-3 w-3" />
              Created {new Date(benchmarkSet.createdAt).toLocaleDateString()}
            </div>
            {/* Hide active toggle for site-level sets (read-only) */}
            {!isSiteSet && (
              <div
                className="flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <label
                  htmlFor={`active-${benchmarkSet.id}`}
                  className="text-xs font-medium cursor-pointer"
                >
                  Active
                </label>
                <Switch
                  id={`active-${benchmarkSet.id}`}
                  checked={benchmarkSet.isActive}
                  onCheckedChange={handleToggleActive}
                  disabled={updateMutation.isPending}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Benchmark Set?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{benchmarkSet.name}"? This action
              cannot be undone and will remove all benchmarks from this set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
