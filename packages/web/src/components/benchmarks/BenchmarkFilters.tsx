import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface BenchmarkFiltersProps {
  organizationId?: string;
  filters: {
    metricCode?: string;
    gender?: string;
    ageMin?: number;
    ageMax?: number;
    level?: string;
  };
  onFiltersChange: (filters: any) => void;
}

export function BenchmarkFilters({ organizationId, filters, onFiltersChange }: BenchmarkFiltersProps) {
  // Fetch available metrics for filter (filtered by organization type if organizationId provided)
  const { data: metrics = [] } = useQuery({
    queryKey: ["/api/metrics", organizationId],
    queryFn: async () => {
      const headers = organizationId ? { 'x-organization-id': organizationId } : {};
      const response = await fetch("/api/metrics?includeInactive=false", { headers });
      if (!response.ok) throw new Error("Failed to fetch metrics");
      return response.json();
    },
  });

  const hasFilters = Object.keys(filters).some((key) => filters[key as keyof typeof filters]);

  const clearFilters = () => {
    onFiltersChange({});
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Filters</h3>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8"
            >
              <X className="mr-1 h-3 w-3" />
              Clear All
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Metric</label>
            <Select
              value={filters.metricCode || "all"}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  metricCode: value === "all" ? undefined : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Metrics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Metrics</SelectItem>
                {metrics.map((metric: any) => (
                  <SelectItem key={metric.code} value={metric.code}>
                    {metric.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Gender Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Gender</label>
            <Select
              value={filters.gender || "all"}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  gender: value === "all" ? undefined : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Genders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genders</SelectItem>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Age Min Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Min Age</label>
            <Input
              type="number"
              placeholder="Any"
              value={filters.ageMin ?? ""}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  ageMin: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
            />
          </div>

          {/* Age Max Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Max Age</label>
            <Input
              type="number"
              placeholder="Any"
              value={filters.ageMax ?? ""}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  ageMax: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
