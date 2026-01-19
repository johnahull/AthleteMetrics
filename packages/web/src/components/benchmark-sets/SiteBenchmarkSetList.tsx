/**
 * SiteBenchmarkSetList - Card grid of site-level benchmark sets
 * Site-level sets (organizationId = NULL) are templates managed by site admins
 * that can be referenced by organizations in reports.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useSiteBenchmarkSets } from "@/lib/benchmark-sets-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, Layers, AlertCircle, MoreVertical, Pencil, Trash2, Eye } from "lucide-react";
import { SiteBenchmarkSetForm } from "./SiteBenchmarkSetForm";
import type { BenchmarkSet } from "@shared/schema";
import { useDeleteSiteBenchmarkSet, useUpdateSiteBenchmarkSet } from "@/lib/benchmark-sets-api";
import { useToast } from "@/hooks/use-toast";

export function SiteBenchmarkSetList() {
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [editingSet, setEditingSet] = useState<BenchmarkSet | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  // Fetch site-level benchmark sets
  const { data: sets, isLoading, error } = useSiteBenchmarkSets(includeInactive);

  const deleteMutation = useDeleteSiteBenchmarkSet();

  // Filter sets by search query
  const filteredSets = sets?.filter((set) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      set.name.toLowerCase().includes(query) ||
      set.description?.toLowerCase().includes(query) ||
      set.sport?.toLowerCase().includes(query) ||
      set.level?.toLowerCase().includes(query)
    );
  });

  const handleEdit = (set: BenchmarkSet) => {
    setEditingSet(set);
    setShowForm(true);
  };

  const handleView = (set: BenchmarkSet) => {
    navigate(`/benchmark-sets/${set.id}`);
  };

  const handleDelete = async (set: BenchmarkSet) => {
    if (!confirm(`Are you sure you want to delete "${set.name}"?`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(set.id);
      toast({
        title: "Benchmark set deleted",
        description: `"${set.name}" has been deleted.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete benchmark set",
        variant: "destructive",
      });
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingSet(null);
  };

  const handleNewSet = () => {
    setEditingSet(null);
    setShowForm(true);
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">
            Error Loading Site Benchmark Sets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "Failed to load site benchmark sets. Please try again."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-muted-foreground">
            Site-level benchmark sets serve as templates that organizations can reference
          </p>
        </div>
        <Button onClick={handleNewSet} data-testid="new-site-benchmark-set-button">
          <Plus className="mr-2 h-4 w-4" />
          New Benchmark Set
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                Site-Level Benchmark Sets
              </p>
              <p className="text-sm text-blue-700 mt-1">
                These benchmark sets are available site-wide and can only contain site benchmarks
                (not organization-specific custom benchmarks). Organizations can reference these
                sets as templates for their reports.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search benchmark sets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Include Inactive Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="include-inactive-site-sets"
                checked={includeInactive}
                onCheckedChange={setIncludeInactive}
              />
              <label
                htmlFor="include-inactive-site-sets"
                className="text-sm font-medium cursor-pointer"
              >
                Show Inactive
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sets List */}
      {isLoading ? (
        <LoadingSpinner text="Loading site benchmark sets..." />
      ) : !filteredSets || filteredSets.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Layers className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Site Benchmark Sets Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "No benchmark sets match your search criteria."
                  : "Create your first site-level benchmark set to group benchmarks together."}
              </p>
              {!searchQuery && (
                <Button onClick={handleNewSet}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Benchmark Set
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSets.map((set) => (
            <SiteBenchmarkSetCard
              key={set.id}
              benchmarkSet={set}
              onEdit={() => handleEdit(set)}
              onView={() => handleView(set)}
              onDelete={() => handleDelete(set)}
            />
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <SiteBenchmarkSetForm
        open={showForm}
        onClose={handleCloseForm}
        benchmarkSet={editingSet}
      />
    </div>
  );
}

/**
 * Card component for a single site benchmark set
 */
interface SiteBenchmarkSetCardProps {
  benchmarkSet: BenchmarkSet;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
}

function SiteBenchmarkSetCard({
  benchmarkSet,
  onEdit,
  onView,
  onDelete,
}: SiteBenchmarkSetCardProps) {
  const { toast } = useToast();
  const updateMutation = useUpdateSiteBenchmarkSet(benchmarkSet.id);

  const handleToggleActive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateMutation.mutateAsync({ isActive: !benchmarkSet.isActive });
      toast({
        title: benchmarkSet.isActive ? "Set Deactivated" : "Set Activated",
        description: `"${benchmarkSet.name}" is now ${benchmarkSet.isActive ? "inactive" : "active"}.`,
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer ${
        !benchmarkSet.isActive ? "opacity-60" : ""
      }`}
      onClick={onView}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{benchmarkSet.name}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(); }}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {benchmarkSet.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {benchmarkSet.description}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {benchmarkSet.sport && (
            <Badge variant="secondary">{benchmarkSet.sport}</Badge>
          )}
          {benchmarkSet.level && (
            <Badge variant="outline">{benchmarkSet.level}</Badge>
          )}
          {benchmarkSet.gender && (
            <Badge variant="outline">{benchmarkSet.gender}</Badge>
          )}
          {benchmarkSet.isTemplate && (
            <Badge variant="default">Template</Badge>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <label
            htmlFor={`active-site-${benchmarkSet.id}`}
            className="text-xs font-medium cursor-pointer"
          >
            Active
          </label>
          <Switch
            id={`active-site-${benchmarkSet.id}`}
            checked={benchmarkSet.isActive}
            onCheckedChange={() => handleToggleActive({ stopPropagation: () => {} } as React.MouseEvent)}
            disabled={updateMutation.isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
