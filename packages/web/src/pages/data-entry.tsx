import { useState } from "react";
import { FormProvider } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUp, Plus, Save, Copy, Trash2 } from "lucide-react";
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
import { useMediaQuery } from '@/hooks/use-media-query';
import { useBatchMeasurementForm } from '@/components/batch-measurement-entry/use-batch-measurement-form';
import { useToast } from '@/hooks/use-toast';

export default function DataEntry() {
  const { toast } = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState('single');

  const { data: recentMeasurements = [] } = useQuery({
    queryKey: ["/api/measurements"],
  }) as { data: any[] };

  const {
    form,
    fields,
    addRow,
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

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Data Entry</h1>
          <Button variant="outline" className="bg-gray-600 text-white hover:bg-gray-700">
            <FileUp className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
        </div>

        {/* Tabs for Single vs Batch Entry */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="single">Single Entry</TabsTrigger>
            <TabsTrigger value="batch">Batch Entry</TabsTrigger>
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
            </FormProvider>
          </TabsContent>
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
