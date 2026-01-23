import { BenchmarkList } from "@/components/benchmarks";
import { SiteBenchmarkSetList } from "@/components/benchmark-sets/SiteBenchmarkSetList";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Layers } from "lucide-react";

export default function BenchmarksPage() {
  const { user } = useAuth();

  // Only site admins can manage benchmarks
  if (!user?.isSiteAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Only site administrators can manage benchmarks.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Site Benchmarks</h1>
        <p className="text-muted-foreground mt-1">
          Manage global benchmark catalog for all organizations
        </p>
      </div>

      <Tabs defaultValue="benchmarks" className="space-y-6">
        <TabsList>
          <TabsTrigger value="benchmarks" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Benchmarks
          </TabsTrigger>
          <TabsTrigger value="sets" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Benchmark Sets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="benchmarks">
          <BenchmarkList />
        </TabsContent>

        <TabsContent value="sets">
          <SiteBenchmarkSetList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
