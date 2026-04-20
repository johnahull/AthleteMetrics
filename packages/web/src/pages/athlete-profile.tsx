import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMetricBadgeVariant } from "@/lib/metrics";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Calendar, MapPin, Trophy, TrendingUp, User, Zap, Edit, Plus, Mail, Phone, Edit2, Trash2, Clock, CalendarDays, Shield } from "lucide-react";
import { calculateFly10Speed } from "@/lib/speed-utils";
import AthleteModal from "@/components/athlete-modal";
import AthleteMeasurementForm from "@/components/athlete-measurement-form";
import { LlmExportButton } from "@/components/athletes/LlmExportButton";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { mutations } from "@/lib/api";
import type { Athlete, Team, Measurement, SiteSettings, Organization } from "@shared/schema";
import { BreadcrumbNavigation } from "@/components/ui/breadcrumb-navigation";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { AthleteHomeHero } from "@/components/athlete/AthleteHomeHero";
import { RecentActivityTimeline } from "@/components/athlete/RecentActivityTimeline";
import { WellnessStatusCard } from "@/components/athlete/WellnessStatusCard";
import { MetricProgressCard } from "@/components/athlete/MetricProgressCard";
import {
  calculateMonthlyMeasurementCount,
  getLastMeasurementDate,
  calculatePersonalRecords,
  generateActivityTimeline,
} from "@/utils/athlete-dashboard-utils";
import { getMetricDisplayName, getMetricUnits } from "@/lib/metrics";

// Edit measurement form schema
const editMeasurementSchema = z.object({
  value: z.string().min(1, "Value is required").refine(
    (val) => !isNaN(Number(val)) && Number(val) > 0,
    "Value must be a positive number"
  ),
  date: z.string().min(1, "Date is required"),
  age: z.string().min(1, "Age is required").refine(
    (val) => !isNaN(Number(val)) && Number(val) >= 10 && Number(val) <= 25,
    "Age must be between 10 and 25"
  ),
  flyInDistance: z.string().optional(),
  notes: z.string().optional(),
});

export default function AthleteProfile() {
  const { id: athleteId } = useParams();
  const [, setLocation] = useLocation();
  const { user, organizationContext } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddMeasurementModal, setShowAddMeasurementModal] = useState(false);
  
  // State for edit/delete functionality
  const [editingMeasurement, setEditingMeasurement] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // State for measurements display toggle (recent vs all)
  const [showAllMeasurements, setShowAllMeasurements] = useState(false);
  
  // Edit form
  const editForm = useForm<z.infer<typeof editMeasurementSchema>>({
    resolver: zodResolver(editMeasurementSchema),
    defaultValues: {
      value: "",
      date: "",
      age: "",
      flyInDistance: "",
      notes: "",
    },
  });

  const { data: athlete, isLoading: athleteLoading, error: athleteError } = useQuery({
    queryKey: ["/api/athletes", athleteId],
    queryFn: async () => {
      const response = await fetch(`/api/athletes/${athleteId}`);
      if (!response.ok) throw new Error('Failed to fetch athlete');
      return response.json();
    },
    enabled: !!athleteId,
  });

  const { data: measurements = [], isLoading: measurementsLoading } = useQuery({
    queryKey: ["/api/measurements", { athleteId }],
    queryFn: async () => {
      const response = await fetch(`/api/measurements?athleteId=${athleteId}`);
      if (!response.ok) throw new Error('Failed to fetch measurements');
      return response.json();
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["/api/teams"],
  }) as { data: any[] };

  // Fetch site settings to check wellness module status (use public endpoint for non-admins)
  const siteSettingsEndpoint = user?.isSiteAdmin
    ? "/api/site-settings"
    : "/api/site-settings/public";
  const { data: siteSettings } = useQuery<SiteSettings>({
    queryKey: [siteSettingsEndpoint],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch organization to check org-level wellness status
  const { data: organization } = useQuery<Organization>({
    queryKey: [`/api/organizations/${organizationContext}`],
    enabled: !!organizationContext,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Calculate wellness enabled status based on site and org settings
  const wellnessModuleEnabled = siteSettings?.wellnessModuleEnabled ?? true;
  const orgWellnessEnabled = organization?.wellnessEnabled ?? true;
  const isWellnessEnabled = wellnessModuleEnabled && orgWellnessEnabled;

  // Generate breadcrumbs
  const breadcrumbs = useBreadcrumbs('athlete', {
    firstName: athlete?.firstName,
    lastName: athlete?.lastName,
    fullName: athlete?.fullName
  });

  // Mutations for edit/delete functionality  
  const updateMeasurementMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => mutations.updateMeasurement(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/measurements", { athleteId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/athletes", athleteId] });
      toast({ title: "Success", description: "Measurement updated successfully" });
      setShowEditDialog(false);
      setEditingMeasurement(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update measurement",
        variant: "destructive" 
      });
    },
  });

  const deleteMeasurementMutation = useMutation({
    mutationFn: mutations.deleteMeasurement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/measurements", { athleteId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/athletes", athleteId] });
      toast({ title: "Success", description: "Measurement deleted successfully" });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete measurement",
        variant: "destructive" 
      });
      setDeleteConfirmId(null);
    },
  });

  // Check if user can edit measurements (coaches and site admins)
  const canEditMeasurements = user?.role === "coach" || user?.role === "org_admin" || user?.isSiteAdmin;

  // The LLM export button is gated to viewers who can read this athlete:
  //   site admins, coaches/org-admins, or the athlete viewing themselves.
  const canExportForLlm =
    !!user &&
    (user.isSiteAdmin ||
      user.role === "coach" ||
      user.role === "org_admin" ||
      (user.role === "athlete" && user.athleteId === athleteId));

  // Calculate dashboard data (memoized to avoid recalculation on every render)
  // IMPORTANT: Must be before any early returns to comply with Rules of Hooks
  const monthlyMeasurementCount = useMemo(
    () => calculateMonthlyMeasurementCount(measurements),
    [measurements]
  );
  const lastMeasurementDate = useMemo(
    () => getLastMeasurementDate(measurements),
    [measurements]
  );
  const personalRecords = useMemo(
    () => calculatePersonalRecords(measurements),
    [measurements]
  );
  const activityTimeline = useMemo(
    () => generateActivityTimeline(measurements),
    [measurements]
  );

  // Group measurements by metric for progress cards
  interface GroupedMeasurement {
    value: string | number;
    date: string;
    metric: string;
  }

  const measurementsByMetric = useMemo(() => {
    const grouped: Record<string, GroupedMeasurement[]> = {};
    measurements.forEach((m: GroupedMeasurement) => {
      if (!grouped[m.metric]) {
        grouped[m.metric] = [];
      }
      grouped[m.metric].push(m);
    });
    return grouped;
  }, [measurements]);

  // Get all unique metrics that have measurements
  const availableMetrics = useMemo(
    () => Object.keys(measurementsByMetric).sort(),
    [measurementsByMetric]
  );

  // Handler functions
  const handleEditMeasurement = (measurement: any) => {
    setEditingMeasurement(measurement);
    editForm.reset({
      value: measurement.value.toString(),
      date: measurement.date,
      age: measurement.age.toString(),
      flyInDistance: measurement.flyInDistance?.toString() || "",
      notes: measurement.notes || "",
    });
    setShowEditDialog(true);
  };
  
  const handleDeleteMeasurement = (id: string) => {
    setDeleteConfirmId(id);
  };
  
  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteMeasurementMutation.mutate(deleteConfirmId);
    }
  };
  
  const onEditSubmit = (values: z.infer<typeof editMeasurementSchema>) => {
    if (!editingMeasurement) return;
    
    const updateData = {
      value: parseFloat(values.value),
      date: values.date,
      age: parseInt(values.age),
      flyInDistance: values.flyInDistance ? parseFloat(values.flyInDistance) : null,
      notes: values.notes || null,
    };
    
    updateMeasurementMutation.mutate({ 
      id: editingMeasurement.id, 
      data: updateData 
    });
  };

  if (athleteLoading || measurementsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (athleteError) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Athlete Not Found</h2>
          <p className="text-gray-600 mb-4">The athlete you're looking for doesn't exist.</p>
          <Button onClick={() => setLocation('/athletes')}>Back to Athletes</Button>
        </div>
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  const fly10Measurements = measurements.filter((m: any) => m.metric === "FLY10_TIME");
  const verticalMeasurements = measurements.filter((m: any) => m.metric === "VERTICAL_JUMP");

  const bestFly10 = fly10Measurements.length > 0 
    ? Math.min(...fly10Measurements.map((m: any) => parseFloat(m.value)))
    : null;
  const bestVertical = verticalMeasurements.length > 0 
    ? Math.max(...verticalMeasurements.map((m: any) => parseFloat(m.value)))
    : null;

  const bestFly10Speed = bestFly10 ? calculateFly10Speed(bestFly10) : null;

  const getRecentMeasurements = () => {
    return measurements
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  };

  const getMeasurementsToDisplay = () => {
    if (showAllMeasurements) {
      return measurements
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else {
      return getRecentMeasurements();
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  // Wellness data - wellnessEnabled is calculated from site + org settings above
  // wellnessData will be fetched when the wellness API is integrated for athlete profiles
  const wellnessData = null;

  return (
    <div className="p-6">
      {/* Breadcrumb Navigation */}
      <BreadcrumbNavigation items={breadcrumbs} />

      {/* Header */}
      <div className="flex items-center mb-6">
        <Button
          variant="ghost"
          onClick={() => setLocation('/athletes')}
          className="mr-4"
          data-testid="button-back-to-athletes"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Athletes
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">{athlete?.fullName}</h1>
          <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
            <span className="flex items-center">
              <User className="h-4 w-4 mr-1" />
              Birth Year: {athlete?.birthYear}
            </span>
            {athlete?.gender && (
              <span className="flex items-center">
                <User className="h-4 w-4 mr-1" />
                Gender: {athlete.gender}
              </span>
            )}
            <span className="flex items-center">
              <Trophy className="h-4 w-4 mr-1" />
              {athlete?.teams && athlete.teams.length > 0 
                ? athlete.teams.map((team: any) => team.name).join(', ')
                : 'Independent Athlete'
              }
            </span>
            {athlete?.school && (
              <span className="flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                {athlete.school}
              </span>
            )}
            {athlete?.sports && athlete.sports.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {athlete.sports.map((sport: any, index: number) => (
                  <Badge key={index} variant="secondary">{sport}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex space-x-3 flex-wrap gap-y-2">
          <Button
            onClick={() => setShowEditModal(true)}
            variant="outline"
            data-testid="button-edit-athlete"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit Athlete
          </Button>
          {canExportForLlm && athleteId && (
            <LlmExportButton
              athleteId={athleteId}
              athleteName={athlete?.fullName || athlete?.userName}
            />
          )}
          {canEditMeasurements && (
            <Button
              onClick={() => setShowAddMeasurementModal(true)}
              data-testid="button-add-measurement"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Measurement
            </Button>
          )}
        </div>
      </div>

      {/* Athlete Home Hero */}
      <AthleteHomeHero
        athlete={athlete}
        measurementCount={monthlyMeasurementCount}
        lastMeasurementDate={lastMeasurementDate}
      />

      {/* Recent Activity & Wellness Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <RecentActivityTimeline activities={activityTimeline} />
        </div>
        <div>
          <WellnessStatusCard
            wellnessEnabled={isWellnessEnabled}
            wellnessData={wellnessData}
          />
        </div>
      </div>

      {/* Performance Metrics Grid (includes PRs) */}
      {availableMetrics.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance Progress</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableMetrics.map((metric) => (
              <MetricProgressCard
                key={metric}
                metric={metric}
                displayName={getMetricDisplayName(metric)}
                measurements={measurementsByMetric[metric]}
                units={getMetricUnits(metric)}
                personalRecord={personalRecords.find(pr => pr.metric === metric)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Contact Information */}
      {((athlete?.emails && athlete.emails.length > 0) || (athlete?.phoneNumbers && athlete.phoneNumbers.length > 0) || athlete?.parentEmail) && (
        <Card className="bg-white mb-8">
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Email Addresses */}
              {athlete?.emails && athlete.emails.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                    <Mail className="h-4 w-4 mr-2" />
                    Email Addresses
                  </h4>
                  <div className="space-y-2">
                    {athlete.emails.map((email: any, index: number) => (
                      <div key={index} className="flex items-center space-x-2">
                        <a
                          href={`mailto:${email}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                          data-testid={`link-email-${index}`}
                        >
                          {email}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phone Numbers */}
              {athlete?.phoneNumbers && athlete.phoneNumbers.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center">
                    <Phone className="h-4 w-4 mr-2" />
                    Phone Numbers
                  </h4>
                  <div className="space-y-2">
                    {athlete.phoneNumbers.map((phone: any, index: number) => (
                      <div key={index} className="flex items-center space-x-2">
                        <a
                          href={`tel:${phone}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                          data-testid={`link-phone-${index}`}
                        >
                          {phone}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Parent/Guardian Email */}
            {athlete.parentEmail && (
              <div className="mt-4 flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Parent/Guardian:</span>
                <span className="text-sm">{athlete.parentEmail}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Measurements */}
      <Card className="bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{showAllMeasurements ? 'All Measurements' : 'Recent Measurements'}</CardTitle>
            <div className="flex rounded-md border border-input bg-background">
              <Button
                variant={!showAllMeasurements ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setShowAllMeasurements(false)}
                className="h-8 px-3 text-sm rounded-r-none border-0"
              >
                <Clock className="h-4 w-4 mr-1" />
                Recent
              </Button>
              <Button
                variant={showAllMeasurements ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setShowAllMeasurements(true)}
                className="h-8 px-3 text-sm rounded-l-none border-0"
              >
                <CalendarDays className="h-4 w-4 mr-1" />
                All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {measurements.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No measurements recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Age</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Metric</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Value</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Speed (mph)</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Fly-In Distance</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Notes</th>
                    {canEditMeasurements && (
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {getMeasurementsToDisplay().map((measurement: any) => (
                    <tr key={measurement.id} className="border-b border-gray-100">
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {formatDate(measurement.date)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {measurement.age}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <Badge variant={getMetricBadgeVariant(measurement.metric)}>
                          {getMetricDisplayName(measurement.metric)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-gray-900">
                        {measurement.value}{measurement.units}
                      </td>
                      <td className="py-3 px-4 text-sm font-mono text-gray-600">
                        {measurement.metric === "FLY10_TIME" 
                          ? calculateFly10Speed(parseFloat(measurement.value)).toFixed(1) 
                          : '-'
                        }
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {measurement.flyInDistance ? `${measurement.flyInDistance}yd` : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {measurement.notes || '-'}
                      </td>
                      {canEditMeasurements && (
                        <td className="py-3 px-4 text-sm">
                          <div className="flex space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditMeasurement(measurement)}
                              data-testid={`button-edit-measurement-${measurement.id}`}
                              aria-label="Edit measurement"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteMeasurement(measurement.id)}
                              data-testid={`button-delete-measurement-${measurement.id}`}
                              aria-label="Delete measurement"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Athlete Edit Modal */}
      {athlete && (
        <AthleteModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          athlete={athlete}
        />
      )}

      {/* Add Measurement Modal */}
      {athlete && (
        <Dialog open={showAddMeasurementModal} onOpenChange={setShowAddMeasurementModal}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Measurement for {athlete.fullName}</DialogTitle>
              <DialogDescription>
                Record a new performance measurement for this athlete.
              </DialogDescription>
            </DialogHeader>
            <AthleteMeasurementForm 
              athleteId={athlete.id}
              athleteName={athlete.fullName}
              onSuccess={() => setShowAddMeasurementModal(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Measurement Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Measurement</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter measurement value"
                        {...field}
                        data-testid="input-edit-value"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        min="1970-01-01"
                        {...field}
                        data-testid="input-edit-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Age at time of measurement"
                        {...field}
                        data-testid="input-edit-age"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {editingMeasurement?.metric === 'FLY10_TIME' && (
                <FormField
                  control={editForm.control}
                  name="flyInDistance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fly In Distance (yards)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Optional"
                          {...field}
                          data-testid="input-edit-fly-distance"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional notes"
                        {...field}
                        data-testid="input-edit-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateMeasurementMutation.isPending}
                  data-testid="button-save-edit"
                >
                  {updateMeasurementMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Measurement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this measurement? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMeasurementMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMeasurementMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}