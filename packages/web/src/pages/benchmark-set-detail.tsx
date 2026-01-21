/**
 * Benchmark Set Detail Page
 *
 * Route: /organizations/:id/benchmark-sets/:setId
 * Displays and manages a specific benchmark set's contents
 */

import { useParams } from "wouter";
import { BenchmarkSetDetail } from "@/components/benchmark-sets";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function BenchmarkSetDetailPage() {
  const { id: organizationId, setId } = useParams();

  if (!organizationId || !setId) {
    return <LoadingSpinner text="Loading benchmark set..." />;
  }

  return <BenchmarkSetDetail organizationId={organizationId} setId={setId} />;
}
