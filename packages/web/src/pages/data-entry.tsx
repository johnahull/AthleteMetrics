import { useState, useEffect, lazy, Suspense } from "react";
import { FormProvider } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Save, Copy, Trash2, Wand2, Loader2, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import MeasurementForm from "@/components/measurement-form";
import { BatchEntryGrid } from '@/components/batch-measurement-entry/batch-entry-grid';
import { BatchEntryCard } from '@/components/batch-measurement-entry/batch-entry-card';
import { BatchWizard, BatchWizardConfig } from '@/components/batch-measurement-entry/batch-wizard';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useBatchMeasurementForm } from '@/components/batch-measurement-entry/use-batch-measurement-form';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { RESPONSIVE_BREAKPOINTS } from '@shared/constants';
import type { UserOrganization } from '@shared/schema';

// Lazy load the Import/Export panel to keep initial page load fast
const ImportExportPanel = lazy(() => import('@/components/import/ImportExportPanel'));

// Lazy load device import components
const DeviceImportDialog = lazy(() => import('@/components/device-import').then(m => ({ default: m.DeviceImportDialog })));
const ImportBatchHistory = lazy(() => import('@/components/device-import').then(m => ({ default: m.ImportBatchHistory })));

export default function DataEntry() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canDeviceImport = user?.isSiteAdmin || user?.role === 'org_admin' || user?.role === 'coach';
  const isMobile = useMediaQuery(`(max-width: ${RESPONSIVE_BREAKPOINTS.MOBILE_BREAKPOINT - 1}px)`);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const searchString = useSearch();

  const { data: userOrganizations } = useQuery<UserOrganization[]>({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id,
  });
  const organizationId = userOrganizations?.[0]?.organizationId;

  // Derive tab from URL query parameter
  const getTabFromUrl = (search: string) => {
    const params = new URLSearchParams(search);
    const tabParam = params.get('tab');
    if (tabParam === 'batch') return 'batch';
    if (tabParam === 'import') return 'import';
    if (tabParam === 'device') return 'device';
    return 'single';
  };

  const [activeTab, setActiveTab] = useState(() => getTabFromUrl(searchString));

  // Sync tab state when URL changes externally (e.g., browser back/forward)
  useEffect(() => {
    const newTab = getTabFromUrl(searchString);
    setActiveTab(newTab);
  }, [searchString]);

  // Update URL when tab changes (without adding to history)
  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    const newUrl = newTab === 'single' ? '/data-entry' : `/data-entry?tab=${newTab}`;
    window.history.replaceState(null, '', newUrl);
  };

  const { data: recentMeasurements = [] } = useQuery({
    queryKey: ["/api/measurements"],
  }) as { data: any[] };

  const {
    form,
    fields,
    addRow,
    append,
    deleteRow,
    copyPreviousRow,
    clearAll,
    save,
    saving,
    errors,
  } = useBatchMeasurementForm();

  const handleSaveAll = async () => {
    const result = await save();

    if (result.success) {
      toast({
        title: 'Success',
        description: `${result.count} measurements saved successfully`,
        variant: 'default',
      });
    } else {
      toast({
        title: 'Error',
        description: result.errors?.join(', ') || 'Failed to save measurements',
        variant: 'destructive',
      });
    }
  };

  const handleWizardComplete = (config: BatchWizardConfig) => {
    const totalRows = config.athleteIds.length * config.metrics.length * config.measurementsPerAthlete;

    // Safety limit to prevent browser crashes
    const MAX_ROWS = 500;
    if (totalRows > MAX_ROWS) {
      toast({
        title: 'Too Many Rows',
        description: `Cannot generate ${totalRows} rows (max: ${MAX_ROWS}). Please reduce athletes, metrics, or measurements per athlete.`,
        variant: 'destructive',
      });
      return;
    }

    // Generate all rows at once for better performance (batch operation)
    // athleteIds × metrics × measurementsPerAthlete
    const newRows = config.athleteIds.flatMap(athleteId =>
      config.metrics.flatMap(metric =>
        Array.from({ length: config.measurementsPerAthlete }, () => ({
          athleteId: athleteId,
          metric: metric, // Accept any valid metric code from the selector
          date: config.date,
          value: 0,
          notes: '',
        }))
      )
    );

    // Use setValue for atomic update (better performance than multiple append calls)
    form.setValue('measurements', [...fields, ...newRows], { shouldDirty: true });

    toast({
      title: 'Grid Generated',
      description: `${totalRows} rows created and ready for data entry`,
    });
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Data Entry</h1>
        </div>

        {/* Tabs for Single, Batch, and Import/Export Entry */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-6">
          <TabsList className={`grid w-full max-w-2xl ${canDeviceImport ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="single">Single Entry</TabsTrigger>
            <TabsTrigger value="batch">Batch Entry</TabsTrigger>
            <TabsTrigger value="import" data-testid="import-export-tab">Import/Export</TabsTrigger>
            {canDeviceImport && (
              <TabsTrigger value="device" data-testid="device-import-tab">Device Import</TabsTrigger>
            )}
          </TabsList>

          {/* Single Entry Tab */}
          <TabsContent value="single">
            <Card className="bg-white mb-6">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Add New Measurement</h3>
                <MeasurementForm />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Batch Entry Tab */}
          <TabsContent value="batch">
            <FormProvider {...form}>
              <Card>
                <CardHeader>
                  <CardTitle>Batch Measurement Entry</CardTitle>
                  <CardDescription>
                    Enter measurements for multiple athletes at once
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Toolbar */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button
                      type="button"
                      onClick={() => setWizardOpen(true)}
                      data-testid="batch-quick-setup"
                      variant="default"
                      size="sm"
                      className="bg-primary"
                    >
                      <Wand2 className="h-4 w-4 mr-2" />
                      Quick Setup
                    </Button>

                    <Button
                      type="button"
                      onClick={addRow}
                      data-testid="batch-add-row"
                      variant="outline"
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Row
                    </Button>

                    <Button
                      type="button"
                      onClick={copyPreviousRow}
                      data-testid="batch-copy-row"
                      variant="outline"
                      size="sm"
                      disabled={fields.length === 0}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Previous Row
                    </Button>

                    <Button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      data-testid="batch-clear-all"
                      variant="outline"
                      size="sm"
                      disabled={fields.length === 0}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>

                    <div className="ml-auto">
                      <Button
                        type="button"
                        onClick={handleSaveAll}
                        data-testid="batch-save-all"
                        disabled={saving || fields.length === 0}
                        size="sm"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : 'Save All'}
                      </Button>
                    </div>
                  </div>

                  {/* Grid or Card View based on screen size */}
                  {isMobile ? (
                    <BatchEntryCard fields={fields} deleteRow={deleteRow} />
                  ) : (
                    <BatchEntryGrid fields={fields} deleteRow={deleteRow} />
                  )}

                  {/* Empty State */}
                  {fields.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>No measurements yet. Click "Add Row" to start adding measurements.</p>
                    </div>
                  )}

                  {/* Row Count */}
                  {fields.length > 0 && (
                    <div className="mt-4 text-sm text-muted-foreground">
                      {fields.length} {fields.length === 1 ? 'row' : 'rows'}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Clear All Confirmation Dialog */}
              <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all rows?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all {fields.length} {fields.length === 1 ? 'row' : 'rows'} from the grid.
                      Any unsaved data will be lost. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        clearAll();
                        setShowClearConfirm(false);
                        toast({
                          title: 'Cleared',
                          description: 'All rows have been removed',
                        });
                      }}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Quick Setup Wizard */}
              <BatchWizard
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onComplete={handleWizardComplete}
              />
            </FormProvider>
          </TabsContent>

          {/* Import/Export Tab - Lazy Loaded */}
          <TabsContent value="import">
            <Suspense fallback={
              <Card className="bg-white">
                <CardContent className="p-12 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading Import/Export...</p>
                  </div>
                </CardContent>
              </Card>
            }>
              <ImportExportPanel />
            </Suspense>
          </TabsContent>

          {/* Device Import Tab - Lazy Loaded (coach/admin only) */}
          {canDeviceImport && <TabsContent value="device">
            <Suspense fallback={
              <Card className="bg-white">
                <CardContent className="p-12 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading Device Import...</p>
                  </div>
                </CardContent>
              </Card>
            }>
              {organizationId ? (
                <>
                  <Card className="bg-white mb-6">
                    <CardHeader>
                      <CardTitle>Import Device Data</CardTitle>
                      <CardDescription>
                        Upload timing gate data (Dashr CSV) to automatically create athlete measurements.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => setDeviceDialogOpen(true)} className="w-full sm:w-auto">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Device File
                      </Button>
                      <DeviceImportDialog
                        organizationId={organizationId}
                        open={deviceDialogOpen}
                        onOpenChange={setDeviceDialogOpen}
                      />
                    </CardContent>
                  </Card>
                  <ImportBatchHistory organizationId={organizationId} />
                </>
              ) : (
                <Card className="bg-white">
                  <CardHeader>
                    <CardTitle>No Organization</CardTitle>
                    <CardDescription>
                      You need to be a member of an organization to import device data.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
            </Suspense>
          </TabsContent>}
        </Tabs>

        {/* Recent Entries */}
        <Card className="bg-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent Entries</h3>
            <div className="space-y-4">
              {recentMeasurements?.slice(0, 10).map((measurement) => (
                <div key={measurement.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {measurement.user.firstName.charAt(0)}{measurement.user.lastName.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{measurement.user.fullName}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>
                          {measurement.metric === "FLY10_TIME" ? "Fly-10" : "Vertical"}: {measurement.value}{measurement.units}
                        </span>
                        <span>•</span>
                        <span>{measurement.date}</span>
                        {measurement.notes && (
                          <>
                            <span>•</span>
                            <span>{measurement.notes}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="ghost" size="sm">
                      <i className="fas fa-edit"></i>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </div>
              ))}
              
              {(!recentMeasurements || recentMeasurements.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <p>No recent measurements found.</p>
                  <p className="text-sm">Start by adding a new measurement above.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
