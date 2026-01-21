/**
 * Organization Benchmarks Page
 *
 * Displays benchmarks and benchmark sets for an organization using a tabbed interface.
 * Matches the site admin benchmarks page pattern.
 *
 * Access restricted to coaches, org admins, and site admins.
 * Athletes cannot access this page.
 */

import { useParams, Redirect } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Target, Layers } from "lucide-react";
import { OrganizationBenchmarksList } from "@/components/benchmarks";
import { BenchmarkSetList } from "@/components/benchmark-sets";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuth } from "@/lib/auth";

export default function OrganizationBenchmarksPage() {
  const { id } = useParams();
  const { user, userOrganizations, isLoading: authLoading } = useAuth();

  // Show loading while auth is being established
  if (authLoading) {
    return <LoadingSpinner text="Loading benchmarks..." />;
  }

  if (!id) {
    return <LoadingSpinner text="Loading benchmarks..." />;
  }

  // Check access - must be site admin, or coach/org_admin for this org
  // Athletes cannot access the benchmarks management page
  const hasAccess = user?.isSiteAdmin ||
    userOrganizations?.some(o =>
      o.organizationId === id && (o.role === 'org_admin' || o.role === 'coach')
    );

  if (!hasAccess) {
    return <Redirect to="/" />;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Benchmarks</h1>
        <p className="text-muted-foreground mt-1">
          Manage benchmarks and benchmark sets for your organization
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
          <OrganizationBenchmarksList organizationId={id} />
        </TabsContent>

        <TabsContent value="sets">
          <BenchmarkSetList organizationId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
