import { useState } from "react";
import { useOrganizationBenchmarks } from "@/lib/benchmarks-api";
import { useMetricConfig } from "@/hooks/use-metric-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, Search, Filter, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BenchmarkCatalog } from "./BenchmarkCatalog";
import { BenchmarkEnablementToggle } from "./BenchmarkEnablementToggle";
import { BenchmarkFilters } from "./BenchmarkFilters";
import { Link } from "wouter";
import { getMetricDisplayName } from "@/constants/metrics";
import type { OrganizationBenchmarkWithDetails } from "@shared/schema";

interface OrganizationBenchmarksListProps {
  organizationId: string;
}

export function OrganizationBenchmarksList({ organizationId }: OrganizationBenchmarksListProps) {
  const [showCatalog, setShowCatalog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { getMetricConfig } = useMetricConfig();
  const [filters, setFilters] = useState<{
    metricCode?: string;
    gender?: string;
    ageMin?: number;
    ageMax?: number;
    level?: string;
  }>({});

  // Fetch enabled benchmarks for this organization with full details
  const { data: orgBenchmarks, isLoading, error } = useOrganizationBenchmarks(
    organizationId,
    false // only active
  );

  // Filter benchmarks by search query and filters
  const filteredBenchmarks = orgBenchmarks?.filter((benchmark) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        benchmark.name.toLowerCase().includes(query) ||
        benchmark.metricCode.toLowerCase().includes(query) ||
        benchmark.description?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Metric code filter
    if (filters.metricCode && benchmark.metricCode !== filters.metricCode) {
      return false;
    }

    // Gender filter
    if (filters.gender && benchmark.gender !== filters.gender) {
      return false;
    }

    // Age filter
    if (filters.ageMin !== undefined && benchmark.ageMax !== null && benchmark.ageMax < filters.ageMin) {
      return false;
    }
    if (filters.ageMax !== undefined && benchmark.ageMin !== null && benchmark.ageMin > filters.ageMax) {
      return false;
    }

    // Level filter
    if (filters.level && benchmark.level !== filters.level) {
      return false;
    }

    return true;
  });

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
          <h1 className="text-3xl font-bold">Organization Benchmarks</h1>
          <p className="text-muted-foreground mt-1">
            Manage enabled benchmarks for your organization
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/organizations/${organizationId}/custom-benchmarks`}>
            <Button variant="outline">
              <Sparkles className="mr-2 h-4 w-4" />
              Custom Benchmarks
            </Button>
          </Link>
          <Button onClick={() => setShowCatalog(true)} data-testid="browse-catalog-button">
            <Plus className="mr-2 h-4 w-4" />
            Browse Catalog
          </Button>
        </div>
      </div>

      {/* Filters */}
      <BenchmarkFilters organizationId={organizationId} filters={filters} onFiltersChange={setFilters} />

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search enabled benchmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
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
              <h3 className="text-lg font-semibold mb-2">No Enabled Benchmarks</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || Object.keys(filters).length > 0
                  ? "No benchmarks match your search or filters."
                  : "Get started by browsing the benchmark catalog and enabling benchmarks for your organization."}
              </p>
              {!searchQuery && Object.keys(filters).length === 0 && (
                <Button onClick={() => setShowCatalog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Browse Benchmark Catalog
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredBenchmarks.map((benchmark) => {
            const unit = getMetricConfig(benchmark.metricCode)?.unit || '';
            return (
            <Card key={benchmark.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">
                        {benchmark.customName || benchmark.name}
                      </h3>
                      <Badge variant="secondary">
                        {benchmark.benchmarkType === "site" ? "Site" : "Custom"}
                      </Badge>
                      {benchmark.isActive === false && (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                    {benchmark.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {benchmark.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 text-sm">
                      <div>
                        <span className="font-medium">Metric:</span>{" "}
                        <span className="text-muted-foreground">{getMetricDisplayName(benchmark.metricCode)}</span>
                      </div>
                      <div>
                        <span className="font-medium">Target:</span>{" "}
                        <span className="text-muted-foreground">
                          {benchmark.comparisonOperator === "range" ? (
                            <>
                              ↔ {benchmark.minValue} – {benchmark.maxValue}{unit ? ` ${unit}` : ''}
                            </>
                          ) : (
                            <>
                              {benchmark.comparisonOperator === "lte" && "≤ "}
                              {benchmark.comparisonOperator === "gte" && "≥ "}
                              {benchmark.comparisonOperator === "eq" && "= "}
                              {benchmark.benchmarkValue}{unit ? ` ${unit}` : ''}
                            </>
                          )}
                        </span>
                      </div>
                      {(benchmark.ageMin !== null || benchmark.ageMax !== null) && (
                        <div>
                          <span className="font-medium">Age:</span>{" "}
                          <span className="text-muted-foreground">
                            {benchmark.ageMin || "Any"} - {benchmark.ageMax || "Any"}
                          </span>
                        </div>
                      )}
                      {benchmark.gender && (
                        <div>
                          <span className="font-medium">Gender:</span>{" "}
                          <span className="text-muted-foreground capitalize">{benchmark.gender}</span>
                        </div>
                      )}
                      {benchmark.level && (
                        <div>
                          <span className="font-medium">Level:</span>{" "}
                          <span className="text-muted-foreground capitalize">
                            {benchmark.level.replace('_', ' ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ml-4">
                    <BenchmarkEnablementToggle
                      organizationId={organizationId}
                      benchmarkId={benchmark.benchmarkId}
                      benchmarkType={benchmark.benchmarkType as 'site' | 'custom'}
                      isEnabled={benchmark.isEnabled}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Benchmark Catalog Modal */}
      {showCatalog && (
        <BenchmarkCatalog
          open={showCatalog}
          onClose={() => setShowCatalog(false)}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}
