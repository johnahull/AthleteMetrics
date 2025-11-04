import { useParams } from "wouter";
import { CustomBenchmarkList } from "@/components/benchmarks";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function CustomBenchmarksPage() {
  const { id } = useParams();

  if (!id) {
    return <LoadingSpinner text="Loading custom benchmarks..." />;
  }

  return <CustomBenchmarkList organizationId={id} />;
}
