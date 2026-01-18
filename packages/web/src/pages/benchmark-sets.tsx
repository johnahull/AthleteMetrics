/**
 * Benchmark Sets Page
 *
 * Route: /organizations/:id/benchmark-sets
 * Displays the list of benchmark sets for an organization
 */

import { useParams } from "wouter";
import { BenchmarkSetList } from "@/components/benchmark-sets";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function BenchmarkSetsPage() {
  const { id } = useParams();

  if (!id) {
    return <LoadingSpinner text="Loading benchmark sets..." />;
  }

  return <BenchmarkSetList organizationId={id} />;
}
