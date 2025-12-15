import { useState, useMemo } from "react";
import { useSiteBenchmarksForOrg, useCustomBenchmarks, useOrganizationBenchmarks } from "@/lib/benchmarks-api";
import { useMetricConfig } from "@/hooks/use-metric-config";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Search, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BenchmarkEnablementToggle } from "./BenchmarkEnablementToggle";

interface BenchmarkCatalogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

export function BenchmarkCatalog({ open, onClose, organizationId }: BenchmarkCatalogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { getMetricConfig } = useMetricConfig();

  // Fetch site benchmarks available for this organization (filtered by org type)
  const { data: siteBenchmarks, isLoading: loadingSite } = useSiteBenchmarksForOrg(organizationId, false);
  const { data: customBenchmarks, isLoading: loadingCustom } = useCustomBenchmarks(
    organizationId,
    false
  );

  // Fetch organization enablement status for all benchmarks (include inactive to see all)
  const { data: orgBenchmarks, isLoading: loadingOrgBenchmarks } = useOrganizationBenchmarks(
    organizationId,
    true // include all, even disabled ones
  );

  const isLoading = loadingSite || loadingCustom || loadingOrgBenchmarks;

  // Create a map of benchmark enablement status for this org
  const enablementMap = useMemo(() => {
    const map = new Map<string, boolean>();
    orgBenchmarks?.forEach(ob => {
      map.set(ob.benchmarkId, ob.isEnabled);
    });
    return map;
  }, [orgBenchmarks]);

  // Filter site benchmarks
  const filteredSiteBenchmarks = siteBenchmarks?.filter((benchmark) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      benchmark.name.toLowerCase().includes(query) ||
      benchmark.metricCode.toLowerCase().includes(query) ||
      benchmark.description?.toLowerCase().includes(query)
    );
  });

  // Filter custom benchmarks
  const filteredCustomBenchmarks = customBenchmarks?.filter((benchmark) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      benchmark.name.toLowerCase().includes(query) ||
      benchmark.metricCode.toLowerCase().includes(query) ||
      benchmark.description?.toLowerCase().includes(query)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Benchmark Catalog</DialogTitle>
          <DialogDescription>
            Browse and enable benchmarks for your organization
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search benchmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs for Site vs Custom */}
        <Tabs defaultValue="site" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="site">
              Site Benchmarks ({filteredSiteBenchmarks?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="custom">
              Custom Benchmarks ({filteredCustomBenchmarks?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Site Benchmarks Tab */}
          <TabsContent value="site" className="overflow-y-auto max-h-[50vh] mt-4">
            {isLoading ? (
              <LoadingSpinner text="Loading site benchmarks..." />
            ) : !filteredSiteBenchmarks || filteredSiteBenchmarks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {searchQuery ? "No site benchmarks match your search." : "No site benchmarks available."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSiteBenchmarks.map((benchmark) => {
                  const unit = getMetricConfig(benchmark.metricCode)?.unit || '';
                  return (
                  <Card key={benchmark.id} data-benchmark-id={benchmark.id}>
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4" />
                            <h4 className="font-semibold">{benchmark.name}</h4>
                            <Badge variant="outline">{benchmark.metricCode}</Badge>
                          </div>
                          {benchmark.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {benchmark.description}
                            </p>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="outline">
                              Target: {benchmark.benchmarkValue}{unit ? ` ${unit}` : ''}
                            </Badge>
                            {benchmark.gender && (
                              <Badge variant="secondary">Gender: {benchmark.gender}</Badge>
                            )}
                            {(benchmark.ageMin || benchmark.ageMax) && (
                              <Badge variant="secondary">
                                Age: {benchmark.ageMin || "0"}-{benchmark.ageMax || "∞"}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <BenchmarkEnablementToggle
                            organizationId={organizationId}
                            benchmarkId={benchmark.id}
                            benchmarkType="site"
                            isEnabled={enablementMap.get(benchmark.id) ?? false}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Custom Benchmarks Tab */}
          <TabsContent value="custom" className="overflow-y-auto max-h-[50vh] mt-4">
            {isLoading ? (
              <LoadingSpinner text="Loading custom benchmarks..." />
            ) : !filteredCustomBenchmarks || filteredCustomBenchmarks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {searchQuery ? "No custom benchmarks match your search." : "No custom benchmarks created yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCustomBenchmarks.map((benchmark) => {
                  const unit = getMetricConfig(benchmark.metricCode)?.unit || '';
                  return (
                  <Card key={benchmark.id} data-benchmark-id={benchmark.id}>
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4" />
                            <h4 className="font-semibold">{benchmark.name}</h4>
                            <Badge variant="outline">{benchmark.metricCode}</Badge>
                            <Badge variant="secondary">Custom</Badge>
                          </div>
                          {benchmark.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {benchmark.description}
                            </p>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="outline">
                              Target: {benchmark.benchmarkValue}{unit ? ` ${unit}` : ''}
                            </Badge>
                            {benchmark.gender && (
                              <Badge variant="secondary">Gender: {benchmark.gender}</Badge>
                            )}
                            {(benchmark.ageMin || benchmark.ageMax) && (
                              <Badge variant="secondary">
                                Age: {benchmark.ageMin || "0"}-{benchmark.ageMax || "∞"}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <BenchmarkEnablementToggle
                            organizationId={organizationId}
                            benchmarkId={benchmark.id}
                            benchmarkType="custom"
                            isEnabled={enablementMap.get(benchmark.id) ?? false}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
