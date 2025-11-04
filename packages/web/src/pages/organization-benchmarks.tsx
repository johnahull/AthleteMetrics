import { useParams } from "wouter";
import { OrganizationBenchmarksList } from "@/components/benchmarks";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function OrganizationBenchmarksPage() {
  const { id } = useParams();

  if (!id) {
    return <LoadingSpinner text="Loading organization benchmarks..." />;
  }

  return <OrganizationBenchmarksList organizationId={id} />;
}
