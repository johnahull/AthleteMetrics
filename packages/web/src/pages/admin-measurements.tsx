import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Filter, X, ChevronLeft, ChevronRight, Calendar, Building2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Measurement type from API
// Note: API returns only basic fields, not full user/org objects for submittedBy/verifiedBy
interface Measurement {
  id: string;
  userId: string;
  submittedBy: string;
  verifiedBy: string | null;
  isVerified: boolean;
  date: string;
  age: number;
  metric: string;
  value: string;
  units: string;
  flyInDistance: string | null;
  notes: string | null;
  teamId: string | null;
  teamNameSnapshot: string | null;
  organizationId: string | null;
  season: string | null;
  teamContextAuto: boolean;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    gender: string | null;
    birthYear: number | null;
    birthDate: string | null;
    sports: string[] | null;
    positions: string[] | null;
    teams?: Array<{
      id: string;
      name: string;
      organization: {
        id: string;
        name: string;
      };
    }>;
  };
}

// Filter schema matching API measurementQuerySchema
const filterSchema = z.object({
  metric: z.string().optional(),
  gender: z.string().optional(),
  sport: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  birthYearFrom: z.string().optional(),
  birthYearTo: z.string().optional(),
  ageFrom: z.string().optional(),
  ageTo: z.string().optional(),
  organizationId: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

type FilterFormData = z.infer<typeof filterSchema>;

const METRICS = [
  { value: "FLY10_TIME", label: "10-Yard Fly Time" },
  { value: "VERTICAL_JUMP", label: "Vertical Jump" },
  { value: "AGILITY_505", label: "5-0-5 Agility" },
  { value: "AGILITY_5105", label: "5-10-5 Agility" },
  { value: "T_TEST", label: "T-Test" },
  { value: "DASH_40YD", label: "40-Yard Dash" },
  { value: "RSI", label: "RSI" },
  { value: "TOP_SPEED", label: "Top Speed" },
];

const GENDERS = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Not Specified", label: "Not Specified" },
];

const ITEMS_PER_PAGE = 50;

export default function AdminMeasurementsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Redirect non-site admins
  useEffect(() => {
    if (user && !user.isSiteAdmin) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const form = useForm<FilterFormData>({
    resolver: zodResolver(filterSchema),
    defaultValues: {
      limit: String(ITEMS_PER_PAGE),
      offset: "0",
    },
  });

  const watchedFilters = form.watch();

  // Fetch organizations for filter dropdown
  const { data: organizations = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/organizations"],
    enabled: user?.isSiteAdmin === true,
  });

  // Build query params from form
  const buildQueryParams = (filters: FilterFormData) => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        params.append(key, value);
      }
    });

    // Ensure we're only fetching verified measurements
    params.append("includeUnverified", "false");

    return params.toString();
  };

  const queryParams = buildQueryParams(watchedFilters);
  const queryUrl = `/api/measurements${queryParams ? `?${queryParams}` : ''}`;

  // Fetch measurements
  const {
    data: measurements = [],
    isLoading,
    error,
  } = useQuery<Measurement[]>({
    queryKey: [queryUrl],
    enabled: user?.isSiteAdmin === true,
  });

  const onSubmit = (data: FilterFormData) => {
    // Reset to page 1 when filters change
    setCurrentPage(1);
    form.setValue("offset", "0");
  };

  const handleClearFilters = () => {
    form.reset({
      limit: String(ITEMS_PER_PAGE),
      offset: "0",
    });
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    const offset = (newPage - 1) * ITEMS_PER_PAGE;
    form.setValue("offset", String(offset));
    setCurrentPage(newPage);
  };

  const hasActiveFilters = Object.entries(watchedFilters).some(
    ([key, value]) => value && value !== "" && key !== "limit" && key !== "offset"
  );

  const totalPages = Math.ceil(measurements.length / ITEMS_PER_PAGE);

  // Format metric name for display
  const formatMetricName = (metric: string): string => {
    const found = METRICS.find((m) => m.value === metric);
    return found ? found.label : metric;
  };

  // Access control check
  if (!user?.isSiteAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Access denied. This page is only accessible to site administrators.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Site-Wide Measurements</h1>
        <p className="text-muted-foreground mt-2">
          View all verified measurements across all organizations. Site administrators have read-only access to all measurement data.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="font-semibold">Filters</span>
                  {hasActiveFilters && (
                    <Badge variant="secondary">{Object.keys(watchedFilters).filter(k => watchedFilters[k as keyof FilterFormData] && k !== "limit" && k !== "offset").length} active</Badge>
                  )}
                </div>
                <ChevronRight className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-90" : ""}`} />
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="pt-4">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Date Range */}
                      <FormField
                        control={form.control}
                        name="dateFrom"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date From</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="dateTo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date To</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Metric Type */}
                      <FormField
                        control={form.control}
                        name="metric"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Metric Type</FormLabel>
                            <FormControl>
                              <select
                                {...field}
                                className="w-full p-2 border border-gray-300 rounded-md"
                              >
                                <option value="">All Metrics</option>
                                {METRICS.map((metric) => (
                                  <option key={metric.value} value={metric.value}>
                                    {metric.label}
                                  </option>
                                ))}
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Gender */}
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender</FormLabel>
                            <FormControl>
                              <select
                                {...field}
                                className="w-full p-2 border border-gray-300 rounded-md"
                              >
                                <option value="">All Genders</option>
                                {GENDERS.map((gender) => (
                                  <option key={gender.value} value={gender.value}>
                                    {gender.label}
                                  </option>
                                ))}
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Sport */}
                      <FormField
                        control={form.control}
                        name="sport"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sport</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Soccer" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Organization */}
                      <FormField
                        control={form.control}
                        name="organizationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organization</FormLabel>
                            <FormControl>
                              <select
                                {...field}
                                className="w-full p-2 border border-gray-300 rounded-md"
                              >
                                <option value="">All Organizations</option>
                                {organizations.map((org) => (
                                  <option key={org.id} value={org.id}>
                                    {org.name}
                                  </option>
                                ))}
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Age Range */}
                      <FormField
                        control={form.control}
                        name="ageFrom"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Age From</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="Min age" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="ageTo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Age To</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="Max age" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Birth Year Range */}
                      <FormField
                        control={form.control}
                        name="birthYearFrom"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Birth Year From</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="e.g., 2000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="birthYearTo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Birth Year To</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="e.g., 2010" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button type="submit">
                        Apply Filters
                      </Button>
                      {hasActiveFilters && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleClearFilters}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </form>
                </Form>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </CardHeader>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Measurements</CardTitle>
          <CardDescription>
            {isLoading ? (
              "Loading measurements..."
            ) : error ? (
              "Error loading measurements"
            ) : (
              `Showing ${measurements.length} verified measurement${measurements.length !== 1 ? "s" : ""}`
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load measurements. Please try again.
              </AlertDescription>
            </Alert>
          ) : measurements.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No measurements found matching your filters.</p>
              {hasActiveFilters && (
                <Button variant="link" onClick={handleClearFilters} className="mt-2">
                  Clear filters to see all measurements
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Athlete</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Metric</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {measurements.map((measurement) => (
                      <TableRow key={measurement.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {new Date(measurement.date).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{measurement.user.fullName}</span>
                            {measurement.user.gender && (
                              <span className="text-xs text-muted-foreground">
                                {measurement.user.gender}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {measurement.user.teams && measurement.user.teams.length > 0 ? (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {measurement.user.teams[0].organization.name}
                            </div>
                          ) : measurement.organizationId ? (
                            <span className="text-xs text-muted-foreground" title={`Org ID: ${measurement.organizationId}`}>
                              {measurement.organizationId.substring(0, 8)}...
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {measurement.teamNameSnapshot || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {formatMetricName(measurement.metric)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {measurement.value} {measurement.units}
                        </TableCell>
                        <TableCell>{measurement.age}</TableCell>
                        <TableCell>
                          {measurement.isVerified ? (
                            <Badge variant="default" className="bg-green-600">
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              Unverified
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {measurement.notes ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm truncate block cursor-help">
                                    {measurement.notes.length > 30
                                      ? `${measurement.notes.substring(0, 30)}...`
                                      : measurement.notes}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-md">
                                  <p className="whitespace-normal">{measurement.notes}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {measurements.length >= ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{" "}
                    {Math.min(currentPage * ITEMS_PER_PAGE, measurements.length)} of{" "}
                    {measurements.length} results
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
