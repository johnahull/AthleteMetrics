/**
 * BenchmarkSetList - Card grid of benchmark sets
 */

import { useState } from "react";
import { useBenchmarkSets, type BenchmarkSetWithVisibility } from "@/lib/benchmark-sets-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, Search, Layers, AlertCircle, EyeOff } from "lucide-react";
import { BenchmarkSetCard } from "./BenchmarkSetCard";
import { BenchmarkSetForm } from "./BenchmarkSetForm";
import { useAuth } from "@/lib/auth";

interface BenchmarkSetListProps {
  organizationId: string;
}

export function BenchmarkSetList({ organizationId }: BenchmarkSetListProps) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingSet, setEditingSet] = useState<BenchmarkSetWithVisibility | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showHiddenSiteSets, setShowHiddenSiteSets] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Check if user can manage site set visibility (coaches, org admins, site admins)
  const canManageVisibility = user?.role === 'coach' || user?.role === 'org_admin' || user?.isSiteAdmin;

  // Fetch benchmark sets for this organization
  const { data: sets, isLoading, error } = useBenchmarkSets(organizationId, {
    includeInactive,
    includeHiddenSiteSets: showHiddenSiteSets,
  });

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

  const handleEdit = (set: BenchmarkSetWithVisibility) => {
    setEditingSet(set);
    setShowForm(true);
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
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">
              Error Loading Benchmark Sets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "Failed to load benchmark sets. Please try again."}
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
          <h1 className="text-3xl font-bold">Benchmark Sets</h1>
          <p className="text-muted-foreground mt-1">
            Create named collections of benchmarks for use in reports and analytics
          </p>
        </div>
        <Button onClick={handleNewSet} data-testid="new-benchmark-set-button">
          <Plus className="mr-2 h-4 w-4" />
          New Benchmark Set
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="mb-6 bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                Benchmark Sets for Quick Selection
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Benchmark sets allow you to group multiple benchmarks together (e.g., "NCAA D1
                Women's Soccer") for quick selection in reports and analytics. Create sets
                based on sport, level, or any criteria that makes sense for your organization.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="mb-6">
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
                id="include-inactive-sets"
                checked={includeInactive}
                onCheckedChange={setIncludeInactive}
              />
              <label
                htmlFor="include-inactive-sets"
                className="text-sm font-medium cursor-pointer"
              >
                Show Inactive
              </label>
            </div>

            {/* Show Hidden Site Sets Toggle (Org Admin Only) */}
            {canManageVisibility && (
              <div className="flex items-center gap-2">
                <Switch
                  id="show-hidden-site-sets"
                  checked={showHiddenSiteSets}
                  onCheckedChange={setShowHiddenSiteSets}
                />
                <label
                  htmlFor="show-hidden-site-sets"
                  className="text-sm font-medium cursor-pointer flex items-center gap-1"
                >
                  <EyeOff className="h-4 w-4" />
                  Show Hidden
                </label>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sets List */}
      {isLoading ? (
        <LoadingSpinner text="Loading benchmark sets..." />
      ) : !filteredSets || filteredSets.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Layers className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Benchmark Sets Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "No benchmark sets match your search criteria."
                  : "Create your first benchmark set to group benchmarks together."}
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
            <BenchmarkSetCard
              key={set.id}
              benchmarkSet={set}
              organizationId={organizationId}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <BenchmarkSetForm
        open={showForm}
        onClose={handleCloseForm}
        organizationId={organizationId}
        benchmarkSet={editingSet}
      />
    </div>
  );
}
