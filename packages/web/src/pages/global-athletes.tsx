import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGlobalAthletes, useGlobalAthleteStats } from "@/hooks/useAdminGlobalAthletes";
import { Search, ChevronLeft, ChevronRight, Users, Link as LinkIcon, TrendingUp, Activity } from "lucide-react";
import { format } from "date-fns";

export default function GlobalAthletes() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;

  // Redirect non-site-admins
  useEffect(() => {
    if (!user?.isSiteAdmin) {
      setLocation("/");
    }
  }, [user, setLocation]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(0); // Reset to first page on search
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const { data: stats, isLoading: statsLoading } = useGlobalAthleteStats();
  const { data: athletesData, isLoading: athletesLoading } = useGlobalAthletes({
    limit: pageSize,
    offset: currentPage * pageSize,
    search: debouncedSearch || undefined,
  });

  const athletes = athletesData?.athletes || [];
  const totalCount = athletesData?.count || 0;
  const hasNextPage = totalCount === pageSize; // If we got a full page, there might be more

  if (!user?.isSiteAdmin) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Global Athletes</h1>
          <p className="text-gray-600 mt-1">Manage cross-organization athlete identities</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Total Global Athletes</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-athletes">
              {statsLoading ? "..." : stats?.totalGlobalAthletes || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Total Linked Users</CardTitle>
              <LinkIcon className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-linked-users">
              {statsLoading ? "..." : stats?.totalLinkedUsers || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Multiple Links</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-multiple-links">
              {statsLoading ? "..." : stats?.athletesWithMultipleLinks || 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">Athletes with 2+ links</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Recent Links (7d)</CardTitle>
              <Activity className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-recent-links">
              {statsLoading ? "..." : stats?.recentLinkCount || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Global Athletes</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="search-input"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {athletesLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : athletes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {debouncedSearch ? "No athletes found matching your search" : "No global athletes yet"}
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-sm text-gray-600">
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">Primary Email</th>
                      <th className="pb-3 font-medium">Verified Emails</th>
                      <th className="pb-3 font-medium">Linked Users</th>
                      <th className="pb-3 font-medium">Cross-Org Linking</th>
                      <th className="pb-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {athletes.map((athlete) => (
                      <tr
                        key={athlete.id}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setLocation(`/global-athletes/${athlete.id}`)}
                        data-testid={`global-athlete-${athlete.id}`}
                      >
                        <td className="py-3">
                          <div className="font-medium text-blue-600 hover:text-blue-700">
                            {athlete.canonicalFullName}
                          </div>
                        </td>
                        <td className="py-3 text-sm text-gray-600">{athlete.primaryEmail}</td>
                        <td className="py-3">
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                            {athlete.verifiedEmails.length} email{athlete.verifiedEmails.length !== 1 ? 's' : ''}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Badge variant="secondary" className="bg-green-50 text-green-700">
                            {athlete.linkedUserCount} user{athlete.linkedUserCount !== 1 ? 's' : ''}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {athlete.allowCrossOrgLinking ? (
                            <Badge variant="secondary" className="bg-green-50 text-green-700">Enabled</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-700">Disabled</Badge>
                          )}
                        </td>
                        <td className="py-3 text-sm text-gray-500">
                          {format(new Date(athlete.createdAt), "MMM d, yyyy")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Showing {currentPage * pageSize + 1} - {currentPage * pageSize + athletes.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={!hasNextPage}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
