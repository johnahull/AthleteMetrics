import { useState } from "react";
import { useAthleteBenchmarkStatus } from "@/lib/benchmarks-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, Target } from "lucide-react";
import { BenchmarkProgressBar } from "./BenchmarkProgressBar";
import { BenchmarkBadge } from "./BenchmarkBadge";
import { BenchmarkComparison } from "./BenchmarkComparison";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AthleteBenchmarkStatusProps {
  organizationId: string;
  athleteId: string;
  athleteName?: string;
}

export function AthleteBenchmarkStatus({
  organizationId,
  athleteId,
  athleteName,
}: AthleteBenchmarkStatusProps) {
  const [filterStatus, setFilterStatus] = useState<"all" | "met" | "unmet">("all");

  const { data: benchmarks, isLoading, error } = useAthleteBenchmarkStatus(
    organizationId,
    athleteId
  );

  // Filter benchmarks by met/unmet status
  const filteredBenchmarks = benchmarks?.filter((benchmark) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "met") return benchmark.isMet;
    if (filterStatus === "unmet") return !benchmark.isMet;
    return true;
  });

  // Calculate stats
  const totalBenchmarks = benchmarks?.length || 0;
  const metBenchmarks = benchmarks?.filter((b) => b.isMet).length || 0;
  const unmetBenchmarks = totalBenchmarks - metBenchmarks;
  const completionPercentage = totalBenchmarks > 0
    ? Math.round((metBenchmarks / totalBenchmarks) * 100)
    : 0;

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Benchmark Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : "Failed to load benchmark status."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Benchmark Status
                {athleteName && <span className="text-muted-foreground">- {athleteName}</span>}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Track your performance against established benchmarks
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{completionPercentage}%</div>
              <div className="text-sm text-muted-foreground">Complete</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{totalBenchmarks}</div>
              <div className="text-sm text-muted-foreground">Total Benchmarks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{metBenchmarks}</div>
              <div className="text-sm text-muted-foreground">Met</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{unmetBenchmarks}</div>
              <div className="text-sm text-muted-foreground">Unmet</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium">Filter by Status:</label>
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Benchmarks</SelectItem>
                <SelectItem value="met">Met Only</SelectItem>
                <SelectItem value="unmet">Unmet Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Benchmarks List */}
      {isLoading ? (
        <LoadingSpinner text="Loading benchmark status..." />
      ) : !filteredBenchmarks || filteredBenchmarks.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Target className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Benchmarks</h3>
              <p className="text-muted-foreground">
                {filterStatus === "all"
                  ? "No benchmarks are currently enabled for your profile."
                  : `No ${filterStatus} benchmarks found.`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredBenchmarks.map((benchmark) => (
            <Card key={benchmark.benchmarkId}>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{benchmark.benchmarkName}</h4>
                        <Badge variant="outline">{benchmark.metricCode}</Badge>
                      </div>
                    </div>
                    <BenchmarkBadge isMet={benchmark.isMet} progress={benchmark.progress} />
                  </div>

                  {/* Progress Bar */}
                  <BenchmarkProgressBar
                    progress={benchmark.progress}
                    isMet={benchmark.isMet}
                    comparisonOperator={benchmark.comparisonOperator}
                  />

                  {/* Comparison */}
                  <BenchmarkComparison
                    athleteValue={benchmark.athleteValue}
                    benchmarkValue={benchmark.benchmarkValue}
                    minValue={benchmark.minValue}
                    maxValue={benchmark.maxValue}
                    comparisonOperator={benchmark.comparisonOperator}
                    metricCode={benchmark.metricCode}
                    isMet={benchmark.isMet}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
