/**
 * My Measurements Page
 *
 * Displays the athlete's full measurement history including:
 * - Table view of all measurements (verified + unverified) with edit/delete for unverified
 * - Timeline view showing measurements grouped by month with visual timeline
 * - Filters for metric type and verification status
 * - Add Entry button to create new self-entry measurements
 *
 * This page is for athletes viewing their complete measurement history.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useAthleteContext } from '@/hooks/useAthleteContext';
import {
  useAthleteMeasurementHistory,
  useUpdateSelfMeasurement,
  useDeleteSelfMeasurement,
} from '@/hooks/useAthleteMeasurements';
import { MeasurementHistoryTable } from '@/components/athlete/MeasurementHistoryTable';
import { MeasurementTimeline } from '@/components/athlete/MeasurementTimeline';
import { MeasurementProgressChart } from '@/components/athlete/MeasurementProgressChart';
import { EditMeasurementModal, EditMeasurementData } from '@/components/athlete/EditMeasurementModal';
import { DeleteMeasurementDialog } from '@/components/athlete/DeleteMeasurementDialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle, Plus, Table as TableIcon, Calendar, LineChart, Filter } from 'lucide-react';
import { Redirect, Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAvailableMetrics } from '@/hooks/use-available-metrics';
import type { Measurement } from '@shared/schema';

type StatusFilter = 'all' | 'verified' | 'unverified';

export default function MyMeasurementsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { athleteId, isLoading: contextLoading } = useAthleteContext();
  const { toast } = useToast();

  // State for filters
  const [metricFilter, setMetricFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeView, setActiveView] = useState<'table' | 'timeline' | 'chart'>('table');
  const [showBestOnly, setShowBestOnly] = useState(true); // Default to best per date

  // State for edit/delete modals
  const [measurementToEdit, setMeasurementToEdit] = useState<Measurement | null>(null);
  const [measurementToDelete, setMeasurementToDelete] = useState<Measurement | null>(null);

  // Fetch measurement history (includes unverified)
  const {
    data: measurements = [],
    isLoading: measurementsLoading,
    isError,
    error,
  } = useAthleteMeasurementHistory(athleteId);

  // Get available metrics for labels
  const { metrics: availableMetrics } = useAvailableMetrics();

  // Build dynamic metric filter options based on athlete's actual measurements
  const metricTypes = useMemo(() => {
    // Get unique metric codes from athlete's measurements
    const uniqueMetricCodes = [...new Set(measurements.map((m: Measurement) => m.metric))];

    // Create a lookup map from available metrics for labels
    const metricLabelMap = new Map(availableMetrics.map(m => [m.code, m.label]));

    // Build options for metrics the athlete has data for
    const metricOptions = uniqueMetricCodes
      .map(code => ({
        value: code,
        label: metricLabelMap.get(code) || code, // Fallback to code if label not found
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [
      { value: 'all', label: 'All Metrics' },
      ...metricOptions,
    ];
  }, [measurements, availableMetrics]);

  // Reset metric filter if selected metric is no longer available (e.g., after deleting measurements)
  useEffect(() => {
    if (metricFilter !== 'all' && !metricTypes.some(m => m.value === metricFilter)) {
      setMetricFilter('all');
    }
  }, [metricFilter, metricTypes]);

  // Mutations for update and delete
  const updateMutation = useUpdateSelfMeasurement();
  const deleteMutation = useDeleteSelfMeasurement();

  // Handle edit measurement
  const handleEditMeasurement = useCallback((measurement: Measurement) => {
    setMeasurementToEdit(measurement);
  }, []);

  // Handle delete measurement
  const handleDeleteMeasurement = useCallback((measurement: Measurement) => {
    setMeasurementToDelete(measurement);
  }, []);

  // Handle save edited measurement
  const handleSaveEdit = useCallback((data: EditMeasurementData) => {
    updateMutation.mutate(data, {
      onSuccess: () => {
        toast({
          title: 'Measurement Updated',
          description: 'Your measurement has been updated successfully.',
        });
        setMeasurementToEdit(null);
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to update measurement.',
          variant: 'destructive',
        });
      },
    });
  }, [updateMutation, toast]);

  // Handle confirm delete
  const handleConfirmDelete = useCallback((measurementId: string) => {
    deleteMutation.mutate(measurementId, {
      onSuccess: () => {
        toast({
          title: 'Measurement Deleted',
          description: 'Your measurement has been deleted.',
        });
        setMeasurementToDelete(null);
      },
      onError: (error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to delete measurement.',
          variant: 'destructive',
        });
      },
    });
  }, [deleteMutation, toast]);

  // Filter measurements based on selected filters
  const filteredMeasurements = useMemo(() => {
    let filtered = measurements;

    // Filter by metric type
    if (metricFilter !== 'all') {
      filtered = filtered.filter((m: Measurement) => m.metric === metricFilter);
    }

    // Filter by verification status
    if (statusFilter === 'verified') {
      filtered = filtered.filter((m: Measurement) => m.isVerified);
    } else if (statusFilter === 'unverified') {
      filtered = filtered.filter((m: Measurement) => !m.isVerified);
    }

    return filtered;
  }, [measurements, metricFilter, statusFilter]);

  // Redirect if not logged in
  if (!authLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Redirect if not an athlete
  if (!authLoading && user && !user.athleteId) {
    return <Redirect to="/dashboard" />;
  }

  // Loading state
  const isLoading = authLoading || contextLoading || measurementsLoading;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading your measurements...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Measurements</h2>
          <p className="text-gray-500 mb-4">
            {error?.message || 'Unable to load your measurement history'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Measurements</h1>
          <p className="text-sm sm:text-base text-gray-500 mt-1">
            View and track your performance data
          </p>
        </div>
        <Link href="/my-measurements/add">
          <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </Link>
      </div>

      {/* View Toggle and Filters */}
      <Card>
        <CardContent className="p-4">
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'table' | 'timeline' | 'chart')}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* View Toggle */}
              <TabsList>
                <TabsTrigger value="table" className="flex items-center gap-2">
                  <TableIcon className="h-4 w-4" />
                  Table
                </TabsTrigger>
                <TabsTrigger value="timeline" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="chart" className="flex items-center gap-2">
                  <LineChart className="h-4 w-4" />
                  Chart
                </TabsTrigger>
              </TabsList>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Metric Filter */}
                <Select value={metricFilter} onValueChange={setMetricFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]" aria-label="Filter by metric">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {metricTypes.map((metric) => (
                      <SelectItem key={metric.value} value={metric.value}>
                        {metric.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status Filter */}
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by status">
                    <SelectValue placeholder="All measurements" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All measurements</SelectItem>
                    <SelectItem value="verified">Official only</SelectItem>
                    <SelectItem value="unverified">Self-entered only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table View */}
            <TabsContent value="table" className="mt-6">
              {measurements.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                  <TableIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Measurements Yet</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    Start tracking your performance by adding your first measurement.
                  </p>
                  <Link href="/my-measurements/add">
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Entry
                    </Button>
                  </Link>
                </div>
              ) : (
                <MeasurementHistoryTable
                  measurements={filteredMeasurements}
                  isLoading={measurementsLoading}
                  onEdit={handleEditMeasurement}
                  onDelete={handleDeleteMeasurement}
                />
              )}
            </TabsContent>

            {/* Timeline View */}
            <TabsContent value="timeline" className="mt-6">
              {measurements.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                  <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Measurements Yet</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    Start tracking your performance by adding your first measurement.
                  </p>
                  <Link href="/my-measurements/add">
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Entry
                    </Button>
                  </Link>
                </div>
              ) : (
                <MeasurementTimeline
                  measurements={filteredMeasurements}
                  isLoading={measurementsLoading}
                />
              )}
            </TabsContent>

            {/* Chart View */}
            <TabsContent value="chart" className="mt-6">
              {measurements.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                  <LineChart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Measurements Yet</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    Start tracking your performance by adding your first measurement.
                  </p>
                  <Link href="/my-measurements/add">
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Entry
                    </Button>
                  </Link>
                </div>
              ) : (
                <MeasurementProgressChart
                  measurements={filteredMeasurements}
                  isLoading={measurementsLoading}
                  showBestOnly={showBestOnly}
                  onShowBestOnlyChange={setShowBestOnly}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Back to Dashboard Link */}
      <div className="pt-4 border-t border-gray-200">
        <Link href="/my-dashboard" className="text-blue-600 hover:underline text-sm">
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Edit Measurement Modal */}
      <EditMeasurementModal
        open={!!measurementToEdit}
        measurement={measurementToEdit}
        onSave={handleSaveEdit}
        onClose={() => setMeasurementToEdit(null)}
        isSaving={updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteMeasurementDialog
        open={!!measurementToDelete}
        measurement={measurementToDelete}
        onConfirm={handleConfirmDelete}
        onCancel={() => setMeasurementToDelete(null)}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
