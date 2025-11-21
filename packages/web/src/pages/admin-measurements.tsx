import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Filter, X, ChevronLeft, ChevronRight, Calendar, Building2, AlertCircle, User, Download, CheckSquare, XSquare, ArrowUpDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatisticsSummaryCard } from "@/components/analytics/StatisticsSummaryCard";

// Measurement type from API
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
  submittedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
  } | null;
  verifiedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
  } | null;
}

// Constants
// Note: Fetching up to 1000 records for client-side filtering/sorting provides better UX
// for site admins. For datasets >1000 measurements, browser performance may degrade.
// Consider implementing virtual scrolling if this becomes an issue.
const MAX_API_FETCH = 1000; // Backend pagination limit
const TEAM_SELECT_MIN_HEIGHT = 100; // Height in pixels for team multi-select
const NOTE_TRUNCATE_LENGTH = 30; // Characters before truncating notes display

// Filter schema matching API measurementQuerySchema with validation
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
  teamIds: z.string().optional(), // Comma-separated team IDs
  verificationStatus: z.string().optional(), // "all", "verified", "unverified"
  athleteName: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
}).refine(
  (data) => {
    // Validate date range
    if (data.dateFrom && data.dateTo) {
      return new Date(data.dateFrom) <= new Date(data.dateTo);
    }
    return true;
  },
  { message: "Date From must be before or equal to Date To", path: ["dateFrom"] }
).refine(
  (data) => {
    // Validate age range
    if (data.ageFrom && data.ageTo) {
      return parseInt(data.ageFrom) <= parseInt(data.ageTo);
    }
    return true;
  },
  { message: "Age From must be less than or equal to Age To", path: ["ageFrom"] }
).refine(
  (data) => {
    // Validate birth year range
    if (data.birthYearFrom && data.birthYearTo) {
      return parseInt(data.birthYearFrom) <= parseInt(data.birthYearTo);
    }
    return true;
  },
  { message: "Birth Year From must be less than or equal to Birth Year To", path: ["birthYearFrom"] }
).refine(
  (data) => {
    // Validate team selection requires organization
    if (data.teamIds && data.teamIds.length > 0 && !data.organizationId) {
      return false;
    }
    return true;
  },
  { message: "Please select an organization before selecting teams", path: ["teamIds"] }
);

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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 0]; // 0 = "All"

export default function AdminMeasurementsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedMeasurements, setSelectedMeasurements] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [bulkAction, setBulkAction] = useState<'verify' | 'unverify' | null>(null);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Redirect non-site admins
  useEffect(() => {
    if (user && !user.isSiteAdmin) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const form = useForm<FilterFormData>({
    resolver: zodResolver(filterSchema),
    defaultValues: {
      verificationStatus: "verified", // Default to showing only verified
      limit: String(MAX_API_FETCH), // Fetch max records for client-side operations
    },
  });

  const watchedFilters = form.watch();

  // Fetch organizations for filter dropdown
  const { data: organizations = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/organizations"],
    enabled: user?.isSiteAdmin === true,
  });

  // Fetch teams for the selected organization
  const { data: teams = [], isLoading: teamsLoading } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/teams", watchedFilters.organizationId],
    queryFn: async () => {
      if (!watchedFilters.organizationId) return [];
      const response = await fetch(`/api/teams?organizationId=${watchedFilters.organizationId}`);
      if (!response.ok) throw new Error('Failed to fetch teams');
      return response.json();
    },
    enabled: !!watchedFilters.organizationId,
  });

  // Reset selected teams when organization changes
  useEffect(() => {
    setSelectedTeams([]);
    form.setValue('teamIds', '', { shouldValidate: false });
  }, [watchedFilters.organizationId]);

  // Sync selectedTeams state with form
  useEffect(() => {
    form.setValue('teamIds', selectedTeams.join(','), { shouldValidate: false });
  }, [selectedTeams]);

  // Build query params from form
  const buildQueryParams = (filters: FilterFormData) => {
    const params = new URLSearchParams();

    // Client-side filters that should NOT be sent to API
    const clientSideFilters = ['verificationStatus', 'athleteName'];

    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "" && !clientSideFilters.includes(key)) {
        params.append(key, value);
      }
    });

    // Handle verification status filter
    const verificationStatus = filters.verificationStatus || "verified";
    if (verificationStatus === "all") {
      params.append("includeUnverified", "true");
    } else if (verificationStatus === "verified") {
      params.append("includeUnverified", "false");
    } else if (verificationStatus === "unverified") {
      params.append("includeUnverified", "true");
      // Note: We'll need to filter on the client side for unverified only
      // since the API doesn't have an "only unverified" option
    }

    return params.toString();
  };

  const queryParams = buildQueryParams(watchedFilters);
  const queryUrl = `/api/measurements${queryParams ? `?${queryParams}` : ''}`;

  // Fetch measurements
  const {
    data: rawMeasurements = [],
    isLoading,
    error,
  } = useQuery<Measurement[]>({
    queryKey: [queryUrl],
    enabled: user?.isSiteAdmin === true,
  });

  // Callbacks for selection management
  const clearSelection = useCallback(() => setSelectedMeasurements([]), []);

  // Bulk verify mutation
  const bulkVerifyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/measurements/bulk-verify", { measurementIds: ids });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to verify measurements");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [queryUrl] });
      clearSelection();
      setBulkAction(null);

      // Handle partial success (207 Multi-Status)
      if (data.failed > 0) {
        // Log all errors to console for debugging
        if (data.errors?.length > 0) {
          console.error('Bulk verify errors:', data.errors);
        }

        const errorSummary = data.errors?.length > 1
          ? `First error: ${data.errors[0]?.message || data.errors[0]}. See console for all ${data.errors.length} errors.`
          : data.errors?.[0]?.message || data.errors?.[0] || 'Unknown error';

        toast({
          title: "Partial Success",
          description: `${data.verified} verified, ${data.failed} failed. ${errorSummary}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: `${data.verified} measurement(s) verified successfully`,
        });
      }
    },
    onError: (error: Error) => {
      setBulkAction(null);
      toast({
        title: "Error verifying measurements",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk unverify mutation
  const bulkUnverifyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/measurements/bulk-unverify", { measurementIds: ids });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to unverify measurements");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [queryUrl] });
      clearSelection();
      setBulkAction(null);

      // Handle partial success (207 Multi-Status)
      if (data.failed > 0) {
        // Log all errors to console for debugging
        if (data.errors?.length > 0) {
          console.error('Bulk unverify errors:', data.errors);
        }

        const errorSummary = data.errors?.length > 1
          ? `First error: ${data.errors[0]?.message || data.errors[0]}. See console for all ${data.errors.length} errors.`
          : data.errors?.[0]?.message || data.errors?.[0] || 'Unknown error';

        toast({
          title: "Partial Success",
          description: `${data.unverified} unverified, ${data.failed} failed. ${errorSummary}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: `${data.unverified} measurement(s) unverified successfully`,
        });
      }
    },
    onError: (error: Error) => {
      setBulkAction(null);
      toast({
        title: "Error unverifying measurements",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler for bulk action confirmation
  const handleBulkActionConfirm = useCallback(() => {
    if (bulkAction === 'verify') {
      bulkVerifyMutation.mutate(selectedMeasurements);
    } else if (bulkAction === 'unverify') {
      bulkUnverifyMutation.mutate(selectedMeasurements);
    }
  }, [bulkAction, selectedMeasurements, bulkVerifyMutation, bulkUnverifyMutation]);

  // Memoized filtering and sorting
  const measurements = useMemo(() => {
    // Step 1: Filter by verification status (client-side)
    const verificationStatus = watchedFilters.verificationStatus || "verified";
    let filtered = rawMeasurements.filter((measurement) => {
      if (verificationStatus === "unverified") {
        return !measurement.isVerified;
      }
      return true; // For "all" and "verified", API handles it
    });

    // Step 2: Filter by athlete name (client-side)
    if (watchedFilters.athleteName && watchedFilters.athleteName.trim()) {
      const searchTerm = watchedFilters.athleteName.toLowerCase().trim();
      filtered = filtered.filter((measurement) =>
        measurement.user.fullName.toLowerCase().includes(searchTerm)
      );
    }

    // Step 3: Sort (create new array to avoid mutation)
    if (sortField) {
      return [...filtered].sort((a, b) => {
        let aVal: string | number | Date;
        let bVal: string | number | Date;

        if (sortField === 'date') {
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
        } else if (sortField === 'athlete') {
          aVal = a.user.fullName;
          bVal = b.user.fullName;
        } else if (sortField === 'metric') {
          aVal = a.metric;
          bVal = b.metric;
        } else if (sortField === 'value') {
          aVal = parseFloat(a.value);
          bVal = parseFloat(b.value);
        } else if (sortField === 'age') {
          aVal = a.age;
          bVal = b.age;
        } else {
          return 0;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [rawMeasurements, watchedFilters.verificationStatus, watchedFilters.athleteName, sortField, sortDirection]);

  // Calculate pagination
  const totalMeasurements = measurements.length;
  const itemsPerPage = pageSize === 0 ? totalMeasurements : pageSize; // 0 means "All"
  const totalPages = pageSize === 0 ? 1 : Math.ceil(totalMeasurements / pageSize);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = pageSize === 0 ? totalMeasurements : startIndex + itemsPerPage;
  const paginatedMeasurements = useMemo(() =>
    measurements.slice(startIndex, endIndex),
    [measurements, startIndex, endIndex]
  );

  // Reset to page 1 if current page exceeds total pages
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Format metric name for display
  const formatMetricName = useCallback((metric: string): string => {
    const found = METRICS.find((m) => m.value === metric);
    return found ? found.label : metric;
  }, []);

  // Selection functions
  const toggleMeasurementSelection = useCallback((id: string) => {
    setSelectedMeasurements(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    // Check if all measurements on current page are selected
    const allPageSelected = paginatedMeasurements.every(m => selectedMeasurements.includes(m.id));

    if (allPageSelected) {
      // Deselect all on current page
      setSelectedMeasurements(prev =>
        prev.filter(id => !paginatedMeasurements.find(m => m.id === id))
      );
    } else {
      // Select all on current page
      const pageIds = paginatedMeasurements.map(m => m.id);
      setSelectedMeasurements(prev => [...new Set([...prev, ...pageIds])]);
    }
  }, [paginatedMeasurements, selectedMeasurements]);

  // CSV Export function with proper error handling
  const exportToCSV = useCallback(() => {
    try {
      // Warn for large exports (>500 records)
      if (measurements.length > 500 && !showExportConfirm) {
        setShowExportConfirm(true);
        return;
      }

      // Reset confirmation state
      setShowExportConfirm(false);

      const headers = ['Date', 'Athlete', 'Organization', 'Team', 'Metric', 'Value', 'Units', 'Age', 'Submitted By', 'Verified By', 'Status', 'Notes'];

      const rows = measurements.map(m => [
        new Date(m.date).toLocaleDateString(),
        m.user.fullName,
        m.user.teams?.[0]?.organization.name || m.organizationId || '-',
        m.teamNameSnapshot || '-',
        formatMetricName(m.metric),
        m.value,
        m.units,
        m.age,
        m.submittedByUser?.fullName || 'Unknown',
        m.verifiedByUser?.fullName || '-',
        m.isVerified ? 'Verified' : 'Unverified',
        m.notes || ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
          // Sanitize formula injection (CSV Injection vulnerability)
          // Cells starting with =, +, -, @ can execute as formulas in Excel/Google Sheets
          let sanitized = String(cell);
          if (/^[=+\-@]/.test(sanitized)) {
            sanitized = "'" + sanitized; // Prefix with single quote to prevent formula execution
          }

          // Escape double quotes, newlines, and carriage returns for CSV
          const escaped = sanitized
            .replace(/"/g, '""')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
          return `"${escaped}"`;
        }).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);

      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `measurements-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
      } finally {
        // Always revoke the object URL to prevent memory leaks
        URL.revokeObjectURL(url);
      }

      toast({
        title: "Export successful",
        description: `Exported ${measurements.length} measurement(s) to CSV`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export CSV",
        variant: "destructive",
      });
    }
  }, [measurements, formatMetricName, toast, showExportConfirm]);

  // Sorting function
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const onSubmit = (data: FilterFormData) => {
    // Reset to page 1 when filters change
    setCurrentPage(1);
  };

  const handleClearFilters = useCallback(() => {
    form.reset({
      verificationStatus: "verified", // Reset to verified only
      limit: String(MAX_API_FETCH), // Maintain max fetch limit
    });
    setSelectedTeams([]);
    setCurrentPage(1);
  }, [form]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to page 1 when changing page size
  };

  const hasActiveFilters = useMemo(() =>
    Object.entries(watchedFilters).some(
      ([key, value]) => {
        // Don't count default verification status as an active filter
        if (key === "verificationStatus") {
          return value && value !== "verified";
        }
        return value && value !== "" && key !== "limit" && key !== "offset";
      }
    ),
    [watchedFilters]
  );

  // Memoized statistics cards
  const statisticsCards = useMemo(() => {
    if (measurements.length === 0) return null;

    if (watchedFilters.metric) {
      // Show statistics for the selected metric
      const metricMeasurements = measurements.filter((m) => m.metric === watchedFilters.metric);
      if (metricMeasurements.length === 0) return null;

      return (
        <div className="grid grid-cols-1 gap-6">
          <StatisticsSummaryCard
            measurements={metricMeasurements as any}
            metric={watchedFilters.metric}
          />
        </div>
      );
    } else {
      // Show statistics for the top 2 metrics with the most measurements
      const metricCounts = measurements.reduce((acc, m) => {
        acc[m.metric] = (acc[m.metric] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topMetrics = Object.entries(metricCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([metric]) => metric);

      if (topMetrics.length === 0) return null;

      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {topMetrics.map((metric) => (
            <StatisticsSummaryCard
              key={metric}
              measurements={measurements.filter((m) => m.metric === metric) as any}
              metric={metric}
            />
          ))}
        </div>
      );
    }
  }, [measurements, watchedFilters.metric]);

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

                      {/* Verification Status */}
                      <FormField
                        control={form.control}
                        name="verificationStatus"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Verification Status</FormLabel>
                            <FormControl>
                              <select
                                {...field}
                                className="w-full p-2 border border-gray-300 rounded-md"
                              >
                                <option value="verified">Verified Only</option>
                                <option value="unverified">Unverified Only</option>
                                <option value="all">All Measurements</option>
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

                      {/* Athlete Name Search */}
                      <FormField
                        control={form.control}
                        name="athleteName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Athlete Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Search by name..." {...field} />
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

                      {/* Teams */}
                      <FormField
                        control={form.control}
                        name="teamIds"
                        render={() => (
                          <FormItem>
                            <FormLabel>Teams (Hold Ctrl/Cmd to select multiple)</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <select
                                  multiple
                                  value={selectedTeams}
                                  onChange={(e) => {
                                    const options = Array.from(e.target.selectedOptions);
                                    setSelectedTeams(options.map(opt => opt.value));
                                  }}
                                  disabled={!watchedFilters.organizationId || teamsLoading || teams.length === 0}
                                  className={`w-full p-2 border border-gray-300 rounded-md`}
                                  style={{ minHeight: `${TEAM_SELECT_MIN_HEIGHT}px` }}
                                  aria-label="Select teams to filter measurements"
                                >
                                  {!watchedFilters.organizationId ? (
                                    <option disabled>Select an organization first</option>
                                  ) : teamsLoading ? (
                                    <option disabled>Loading teams...</option>
                                  ) : teams.length === 0 ? (
                                    <option disabled>No teams available</option>
                                  ) : (
                                    teams.map((team) => (
                                      <option key={team.id} value={team.id}>
                                        {team.name}
                                      </option>
                                    ))
                                  )}
                                </select>
                                {selectedTeams.length > 0 && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {selectedTeams.length} team{selectedTeams.length !== 1 ? 's' : ''} selected
                                  </div>
                                )}
                              </div>
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

      {/* Statistics Summary */}
      {statisticsCards}

      {/* Results */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div>
              <CardTitle>Measurements</CardTitle>
              <CardDescription>
                {isLoading ? (
                  "Loading measurements..."
                ) : error ? (
                  "Error loading measurements"
                ) : (
                  `Showing ${startIndex + 1}-${Math.min(endIndex, totalMeasurements)} of ${totalMeasurements} measurement${totalMeasurements !== 1 ? "s" : ""}`
                )}
              </CardDescription>
            </div>
            <Button onClick={exportToCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
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
          ) : totalMeasurements === 0 ? (
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
              {/* Bulk Actions */}
              {selectedMeasurements.length > 0 && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-sm font-medium">
                    {selectedMeasurements.length} selected
                  </span>
                  <Button size="sm" variant="outline" onClick={clearSelection}>
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkAction('verify')}
                    disabled={bulkVerifyMutation.isPending}
                  >
                    <CheckSquare className="h-4 w-4 mr-1" />
                    {bulkVerifyMutation.isPending ? "Verifying..." : "Verify Selected"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkAction('unverify')}
                    disabled={bulkUnverifyMutation.isPending}
                  >
                    <XSquare className="h-4 w-4 mr-1" />
                    {bulkUnverifyMutation.isPending ? "Unverifying..." : "Unverify Selected"}
                  </Button>
                </div>
              )}

              {/* Table */}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-4">
                        <input
                          type="checkbox"
                          checked={paginatedMeasurements.length > 0 && paginatedMeasurements.every(m => selectedMeasurements.includes(m.id))}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300"
                          aria-label="Select all measurements on current page"
                        />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('date')}>
                        <div className="flex items-center gap-1">
                          Date
                          {sortField === 'date' && (
                            <ArrowUpDown className="h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('athlete')}>
                        <div className="flex items-center gap-1">
                          Athlete
                          {sortField === 'athlete' && (
                            <ArrowUpDown className="h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('metric')}>
                        <div className="flex items-center gap-1">
                          Metric
                          {sortField === 'metric' && (
                            <ArrowUpDown className="h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('value')}>
                        <div className="flex items-center gap-1">
                          Value
                          {sortField === 'value' && (
                            <ArrowUpDown className="h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('age')}>
                        <div className="flex items-center gap-1">
                          Age
                          {sortField === 'age' && (
                            <ArrowUpDown className="h-4 w-4" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead>Submitted By</TableHead>
                      <TableHead>Verified By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMeasurements.map((measurement) => (
                      <TableRow key={measurement.id}>
                        <TableCell className="w-4">
                          <input
                            type="checkbox"
                            checked={selectedMeasurements.includes(measurement.id)}
                            onChange={() => toggleMeasurementSelection(measurement.id)}
                            className="rounded border-gray-300"
                            aria-label={`Select measurement for ${measurement.user.fullName}`}
                          />
                        </TableCell>
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
                          {measurement.submittedByUser ? (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{measurement.submittedByUser.fullName}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {measurement.verifiedByUser ? (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-green-600" />
                              <span className="text-sm">{measurement.verifiedByUser.fullName}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
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
                                    {measurement.notes.length > NOTE_TRUNCATE_LENGTH
                                      ? `${measurement.notes.substring(0, NOTE_TRUNCATE_LENGTH)}...`
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
              {totalMeasurements > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-4">
                    {/* Page size selector */}
                    <div className="flex items-center gap-2">
                      <select
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                      >
                        {PAGE_SIZE_OPTIONS.map(size => (
                          <option key={size} value={size}>
                            {size === 0 ? 'All' : size}
                          </option>
                        ))}
                      </select>
                      <span className="text-sm text-muted-foreground">
                        {totalMeasurements} result{totalMeasurements !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Pagination controls (hide if showing all) */}
                  {pageSize !== 0 && totalPages > 1 && (
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
                      <div className="flex items-center px-3 text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </div>
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
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Confirmation Dialog */}
      <AlertDialog open={bulkAction !== null} onOpenChange={() => setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === 'verify' ? 'Verify Measurements' : 'Unverify Measurements'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === 'verify'
                ? `Are you sure you want to verify ${selectedMeasurements.length} measurement${selectedMeasurements.length !== 1 ? 's' : ''}? This will mark them as verified.`
                : `Are you sure you want to unverify ${selectedMeasurements.length} measurement${selectedMeasurements.length !== 1 ? 's' : ''}? This will remove their verified status.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkActionConfirm}>
              {bulkAction === 'verify' ? 'Verify' : 'Unverify'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Export Confirmation Dialog */}
      <AlertDialog open={showExportConfirm} onOpenChange={setShowExportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Large CSV Export</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to export {measurements.length} measurements to CSV. This may take a moment and could impact browser performance. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={exportToCSV}>
              Export {measurements.length} Records
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
