import { useState } from "react";
import { useSiteBenchmarks } from "@/lib/benchmarks-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, Search, Filter } from "lucide-react";
import { BenchmarkCard } from "./BenchmarkCard";
import { BenchmarkForm } from "./BenchmarkForm";
import type { SiteBenchmark } from "@shared/schema";

export function BenchmarkList() {
  const [showForm, setShowForm] = useState(false);
  const [editingBenchmark, setEditingBenchmark] = useState<SiteBenchmark | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch benchmarks with includeInactive filter
  const { data: benchmarks, isLoading, error } = useSiteBenchmarks(includeInactive);

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

  const handleEdit = (benchmark: SiteBenchmark) => {
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
            <CardTitle className="text-destructive">Error Loading Benchmarks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Failed to load benchmarks. Please try again."}
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
          <h1 className="text-3xl font-bold">Site Benchmarks</h1>
          <p className="text-muted-foreground mt-1">
            Manage global benchmark catalog for all organizations
          </p>
        </div>
        <Button onClick={handleNewBenchmark} data-testid="new-benchmark-button">
          <Plus className="mr-2 h-4 w-4" />
          New Benchmark
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search benchmarks by name, metric, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Include Inactive Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="include-inactive"
                checked={includeInactive}
                onCheckedChange={setIncludeInactive}
              />
              <label
                htmlFor="include-inactive"
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
        <LoadingSpinner text="Loading benchmarks..." />
      ) : !filteredBenchmarks || filteredBenchmarks.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Filter className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Benchmarks Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "No benchmarks match your search criteria. Try a different search term."
                  : "Get started by creating your first benchmark."}
              </p>
              {!searchQuery && (
                <Button onClick={handleNewBenchmark}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Benchmark
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredBenchmarks.map((benchmark) => (
            <BenchmarkCard
              key={benchmark.id}
              benchmark={benchmark}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {/* Benchmark Form Modal */}
      {showForm && (
        <BenchmarkForm
          open={showForm}
          onClose={handleCloseForm}
          benchmark={editingBenchmark}
        />
      )}
    </div>
  );
}
