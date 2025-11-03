import { useState } from "react";
import { useCustomBenchmarks } from "@/lib/benchmarks-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, Search, Filter, AlertCircle } from "lucide-react";
import { CustomBenchmarkCard } from "./CustomBenchmarkCard";
import { CustomBenchmarkForm } from "./CustomBenchmarkForm";
import { useAuth } from "@/lib/auth";
import type { CustomBenchmark } from "@shared/schema";

interface CustomBenchmarkListProps {
  organizationId: string;
}

export function CustomBenchmarkList({ organizationId }: CustomBenchmarkListProps) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingBenchmark, setEditingBenchmark] = useState<CustomBenchmark | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch custom benchmarks for this organization
  const { data: benchmarks, isLoading, error } = useCustomBenchmarks(
    organizationId,
    includeInactive
  );

  // Filter benchmarks by search query
  const filteredBenchmarks = benchmarks?.filter((benchmark) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      benchmark.name.toLowerCase().includes(query) ||
      benchmark.metricCode.toLowerCase().includes(query) ||
      benchmark.description?.toLowerCase().includes(query)
    );
  });

  const handleEdit = (benchmark: CustomBenchmark) => {
    setEditingBenchmark(benchmark);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingBenchmark(null);
  };

  const handleNewBenchmark = () => {
    setEditingBenchmark(null);
    setShowForm(true);
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Custom Benchmarks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Failed to load custom benchmarks. Please try again."}
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
          <h1 className="text-3xl font-bold">Custom Benchmarks</h1>
          <p className="text-muted-foreground mt-1">
            Create organization-specific benchmarks tailored to your needs
          </p>
        </div>
        <Button onClick={handleNewBenchmark}>
          <Plus className="mr-2 h-4 w-4" />
          New Custom Benchmark
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="mb-6 bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">Organization-Specific Benchmarks</p>
              <p className="text-sm text-blue-700 mt-1">
                Custom benchmarks are only visible to your organization and can be tailored to your specific
                performance goals and athlete groups.
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
                placeholder="Search custom benchmarks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Include Inactive Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="include-inactive-custom"
                checked={includeInactive}
                onCheckedChange={setIncludeInactive}
              />
              <label
                htmlFor="include-inactive-custom"
                className="text-sm font-medium cursor-pointer"
              >
                Show Inactive
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Benchmarks List */}
      {isLoading ? (
        <LoadingSpinner text="Loading custom benchmarks..." />
      ) : !filteredBenchmarks || filteredBenchmarks.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Filter className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Custom Benchmarks Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "No custom benchmarks match your search criteria."
                  : "Create your first custom benchmark to get started."}
              </p>
              {!searchQuery && (
                <Button onClick={handleNewBenchmark}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Custom Benchmark
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredBenchmarks.map((benchmark) => (
            <CustomBenchmarkCard
              key={benchmark.id}
              benchmark={benchmark}
              organizationId={organizationId}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {/* Custom Benchmark Form Modal */}
      {showForm && (
        <CustomBenchmarkForm
          open={showForm}
          onClose={handleCloseForm}
          organizationId={organizationId}
          benchmark={editingBenchmark}
        />
      )}
    </div>
  );
}
