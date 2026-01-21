import { useState } from "react";
import { useCustomOrgMetrics } from "@/lib/custom-metrics-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, Search, Filter, Ruler, AlertCircle } from "lucide-react";
import { CustomOrgMetricCard } from "./CustomOrgMetricCard";
import { CustomOrgMetricForm } from "./CustomOrgMetricForm";
import { useAuth } from "@/lib/auth";
import type { CustomOrgMetric } from "@shared/schema";

interface CustomOrgMetricListProps {
  organizationId: string;
  /** When true, hides the page header and info banner (for embedding in parent page) */
  embedded?: boolean;
}

const METRIC_CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "speed", label: "Speed" },
  { value: "power", label: "Power" },
  { value: "agility", label: "Agility" },
  { value: "endurance", label: "Endurance" },
  { value: "strength", label: "Strength" },
  { value: "flexibility", label: "Flexibility" },
  { value: "body_composition", label: "Body Composition" },
  { value: "sport_specific", label: "Sport Specific" },
  { value: "recovery", label: "Recovery" },
  { value: "custom", label: "Custom" },
];

export function CustomOrgMetricList({ organizationId, embedded = false }: CustomOrgMetricListProps) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingMetric, setEditingMetric] = useState<CustomOrgMetric | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Fetch custom metrics for this organization
  const { data: metrics, isLoading, error } = useCustomOrgMetrics(
    organizationId,
    { includeArchived, category: categoryFilter === "all" ? undefined : categoryFilter }
  );

  // Filter metrics by search query
  const filteredMetrics = metrics?.filter((metric) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      metric.label.toLowerCase().includes(query) ||
      metric.code.toLowerCase().includes(query) ||
      metric.description?.toLowerCase().includes(query) ||
      metric.category?.toLowerCase().includes(query)
    );
  });

  const handleEdit = (metric: CustomOrgMetric) => {
    setEditingMetric(metric);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingMetric(null);
  };

  const handleNewMetric = () => {
    setEditingMetric(null);
    setShowForm(true);
  };

  // Check if user can create/edit metrics (org admin or site admin)
  const canEditMetrics = user?.isSiteAdmin || user?.role === 'org_admin';

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Custom Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Failed to load custom metrics. Please try again."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "container mx-auto p-6"}>
      {/* Header - hidden when embedded */}
      {!embedded && (
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Custom Metrics</h1>
            <p className="text-muted-foreground mt-1">
              Create organization-specific metrics tailored to your needs
            </p>
          </div>
          {canEditMetrics && (
            <Button onClick={handleNewMetric} data-testid="new-custom-metric-button">
              <Plus className="mr-2 h-4 w-4" />
              New Custom Metric
            </Button>
          )}
        </div>
      )}

      {/* Embedded header with just the button */}
      {embedded && canEditMetrics && (
        <div className="flex justify-end mb-4">
          <Button onClick={handleNewMetric} data-testid="new-custom-metric-button">
            <Plus className="mr-2 h-4 w-4" />
            New Custom Metric
          </Button>
        </div>
      )}

      {/* Info Banner - hidden when embedded */}
      {!embedded && (
        <Card className="mb-6 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Organization-Specific Metrics
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Custom metrics are only visible to your organization and can be used for
                  measurements, analytics, and benchmarks. You can also create derived metrics
                  that automatically calculate from other measurements.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search custom metrics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {METRIC_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Include Archived Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="include-archived-metrics"
                checked={includeArchived}
                onCheckedChange={setIncludeArchived}
              />
              <label
                htmlFor="include-archived-metrics"
                className="text-sm font-medium cursor-pointer"
              >
                Show Archived
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics List */}
      {isLoading ? (
        <LoadingSpinner text="Loading custom metrics..." />
      ) : !filteredMetrics || filteredMetrics.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Ruler className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Custom Metrics Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || categoryFilter !== "all"
                  ? "No custom metrics match your search criteria."
                  : "Create your first custom metric to get started."}
              </p>
              {!searchQuery && categoryFilter === "all" && canEditMetrics && (
                <Button onClick={handleNewMetric}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Custom Metric
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredMetrics.map((metric) => (
            <CustomOrgMetricCard
              key={metric.id}
              metric={metric}
              organizationId={organizationId}
              onEdit={handleEdit}
              canEdit={canEditMetrics}
            />
          ))}
        </div>
      )}

      {/* Custom Metric Form Modal */}
      {showForm && (
        <CustomOrgMetricForm
          open={showForm}
          onClose={handleCloseForm}
          organizationId={organizationId}
          metric={editingMetric}
        />
      )}
    </div>
  );
}
