/**
 * Site Benchmark Set Detail Page
 *
 * Route: /benchmark-sets/:setId
 * Displays and manages a site-level benchmark set's contents
 * Only accessible by site admins
 */

import { useParams } from "wouter";
import { SiteBenchmarkSetDetail } from "@/components/benchmark-sets/SiteBenchmarkSetDetail";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SiteBenchmarkSetDetailPage() {
  const { setId } = useParams();
  const { user } = useAuth();

  // Only site admins can access site-level benchmark sets
  if (!user?.isSiteAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Only site administrators can manage site-level benchmark sets.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!setId) {
    return <LoadingSpinner text="Loading benchmark set..." />;
  }

  return <SiteBenchmarkSetDetail setId={setId} />;
}
