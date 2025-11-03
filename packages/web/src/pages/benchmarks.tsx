import { BenchmarkList } from "@/components/benchmarks";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  return <BenchmarkList />;
}
