/**
 * List component for displaying custom benchmark groups (org-specific)
 * Shows organization-specific benchmark groups with management actions
 */

import { useState } from "react";
import { useCustomBenchmarkGroups, useDeleteCustomBenchmarkGroup } from "@/lib/benchmark-groups-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, Search, Edit, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CustomBenchmarkGroup, CustomBenchmarkGroupWithMembers } from "@shared/schema";
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
import { useToast } from "@/hooks/use-toast";

interface CustomBenchmarkGroupsListProps {
  organizationId: string;
  onEdit?: (group: CustomBenchmarkGroup | CustomBenchmarkGroupWithMembers) => void;
  onCreate?: () => void;
}

export function CustomBenchmarkGroupsList({ organizationId, onEdit, onCreate }: CustomBenchmarkGroupsListProps) {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeMembers, setIncludeMembers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  const { toast } = useToast();

  // Fetch groups with members
  const { data: groups, fetchStatus, error } = useCustomBenchmarkGroups(organizationId, includeInactive, includeMembers);

  // Use fetchStatus to determine loading state (handles disabled queries properly)
  const isLoading = fetchStatus === 'fetching';

  // Delete mutation
  const deleteMutation = useDeleteCustomBenchmarkGroup();

  // Filter groups by search query
  const filteredGroups = groups?.filter((group) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      group.name.toLowerCase().includes(query) ||
      group.description?.toLowerCase().includes(query)
    );
  });

  const handleDelete = async () => {
    if (!deleteGroupId) return;

    try {
      await deleteMutation.mutateAsync({ organizationId, id: deleteGroupId });
      toast({
        title: "Success",
        description: "Custom benchmark group deleted successfully",
      });
      setDeleteGroupId(null);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete custom benchmark group",
        variant: "destructive",
      });
    }
  };

  const getMemberCount = (group: CustomBenchmarkGroup | CustomBenchmarkGroupWithMembers): number => {
    if ('benchmarks' in group && Array.isArray(group.benchmarks)) {
      return group.benchmarks.length;
    }
    return 0;
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Custom Benchmark Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Failed to load custom benchmark groups. Please try again."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Custom Benchmark Groups</h1>
          <p className="text-muted-foreground mt-1">
            Manage organization-specific benchmark groups for your athletes
          </p>
        </div>
        {onCreate && (
          <Button onClick={onCreate} data-testid="create-custom-group-button">
            <Plus className="h-4 w-4 mr-2" />
            Create Group
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search" className="sr-only">Search groups</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="search-custom-groups"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="include-inactive"
                checked={includeInactive}
                onCheckedChange={setIncludeInactive}
                data-testid="include-inactive-toggle"
              />
              <Label htmlFor="include-inactive">Show inactive</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Groups List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : filteredGroups && filteredGroups.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map((group) => {
            const memberCount = getMemberCount(group);

            return (
              <Card key={group.id} data-testid={`custom-group-card-${group.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                      {group.description && (
                        <CardDescription className="mt-1">
                          {group.description}
                        </CardDescription>
                      )}
                    </div>
                    <Badge variant={group.isActive ? "default" : "secondary"}>
                      {group.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Member count */}
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="h-4 w-4 mr-2" />
                    <span>{memberCount} benchmark{memberCount !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Benchmark preview */}
                  {includeMembers && 'benchmarks' in group && Array.isArray(group.benchmarks) && group.benchmarks.length > 0 && (
                    <div className="space-y-1">
                      {group.benchmarks.slice(0, 3).map((benchmark: any) => (
                        <Badge key={benchmark.id} variant="outline" className="text-xs">
                          {benchmark.name}
                        </Badge>
                      ))}
                      {group.benchmarks.length > 3 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          +{group.benchmarks.length - 3} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    {onEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(group)}
                        className="flex-1"
                        data-testid={`edit-custom-group-${group.id}`}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteGroupId(group.id)}
                      className="flex-1"
                      data-testid={`delete-custom-group-${group.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">No custom benchmark groups found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery
                    ? "Try adjusting your search or filters"
                    : "Create your first custom benchmark group to get started"}
                </p>
              </div>
              {onCreate && !searchQuery && (
                <Button onClick={onCreate} variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteGroupId} onOpenChange={(open) => !open && setDeleteGroupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Benchmark Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the custom benchmark group
              and remove all benchmark associations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
