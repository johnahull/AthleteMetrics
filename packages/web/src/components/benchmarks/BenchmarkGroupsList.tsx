/**
 * List component for displaying benchmark groups
 * Shows both site-level and custom benchmark groups with management actions
 */

import { useState } from "react";
import { useSiteBenchmarkGroups } from "@/lib/benchmark-groups-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, Search, Edit, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SiteBenchmarkGroup, SiteBenchmarkGroupWithMembers } from "@shared/schema";
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
import { useDeleteSiteBenchmarkGroup } from "@/lib/benchmark-groups-api";
import { useToast } from "@/hooks/use-toast";

interface BenchmarkGroupsListProps {
  onEdit?: (group: SiteBenchmarkGroup | SiteBenchmarkGroupWithMembers) => void;
  onCreate?: () => void;
}

export function BenchmarkGroupsList({ onEdit, onCreate }: BenchmarkGroupsListProps) {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeMembers, setIncludeMembers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  const { toast } = useToast();

  // Fetch groups with members
  const { data: groups, isLoading, error } = useSiteBenchmarkGroups(includeInactive, includeMembers);

  // Delete mutation
  const deleteMutation = useDeleteSiteBenchmarkGroup();

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
      await deleteMutation.mutateAsync(deleteGroupId);
      toast({
        title: "Success",
        description: "Benchmark group deleted successfully",
      });
      setDeleteGroupId(null);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete benchmark group",
        variant: "destructive",
      });
    }
  };

  const getMemberCount = (group: SiteBenchmarkGroup | SiteBenchmarkGroupWithMembers): number => {
    if ('benchmarks' in group) {
      return group.benchmarks.length;
    }
    return 0;
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Benchmark Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Failed to load benchmark groups. Please try again."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Benchmark Groups</h1>
          <p className="text-muted-foreground mt-1">
            Organize benchmarks into named groups for easier selection in reports
          </p>
        </div>
        {onCreate && (
          <Button onClick={onCreate} data-testid="new-benchmark-group-button">
            <Plus className="mr-2 h-4 w-4" />
            New Group
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search groups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="search-groups"
                />
              </div>
            </div>

            {/* Toggle inactive */}
            <div className="flex items-center space-x-2">
              <Switch
                id="include-inactive"
                checked={includeInactive}
                onCheckedChange={setIncludeInactive}
                data-testid="include-inactive-toggle"
              />
              <Label htmlFor="include-inactive">Show Inactive</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredGroups && filteredGroups.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Benchmark Groups</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "No groups match your search criteria"
                  : "Get started by creating your first benchmark group"}
              </p>
              {!searchQuery && onCreate && (
                <Button onClick={onCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Group
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups Grid */}
      {!isLoading && filteredGroups && filteredGroups.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map((group) => (
            <Card key={group.id} className={!group.isActive ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                    {group.description && (
                      <CardDescription className="mt-1">{group.description}</CardDescription>
                    )}
                  </div>
                  {!group.isActive && (
                    <Badge variant="secondary" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Member Count */}
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="mr-2 h-4 w-4" />
                    <span>{getMemberCount(group)} benchmarks</span>
                  </div>

                  {/* Member Benchmarks List */}
                  {includeMembers && 'benchmarks' in group && Array.isArray(group.benchmarks) && group.benchmarks.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Benchmarks:</p>
                      <div className="flex flex-wrap gap-1">
                        {group.benchmarks.slice(0, 3).map((benchmark: any) => (
                          <Badge key={benchmark.id} variant="outline" className="text-xs">
                            {benchmark.name}
                          </Badge>
                        ))}
                        {group.benchmarks.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{group.benchmarks.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {onEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(group)}
                        className="flex-1"
                        data-testid={`edit-group-${group.id}`}
                      >
                        <Edit className="mr-2 h-3 w-3" />
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteGroupId(group.id)}
                      className="text-destructive hover:text-destructive"
                      data-testid={`delete-group-${group.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteGroupId} onOpenChange={() => setDeleteGroupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Benchmark Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this benchmark group. Benchmarks themselves will not be deleted,
              only their membership in this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
