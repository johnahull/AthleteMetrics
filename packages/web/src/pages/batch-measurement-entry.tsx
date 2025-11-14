import React, { useState } from 'react';
import { FormProvider } from 'react-hook-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Save, Copy, Trash2 } from 'lucide-react';
import { BatchEntryGrid } from '@/components/batch-measurement-entry/batch-entry-grid';
import { BatchEntryCard } from '@/components/batch-measurement-entry/batch-entry-card';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useBatchMeasurementForm } from '@/components/batch-measurement-entry/use-batch-measurement-form';
import { useToast } from '@/hooks/use-toast';

export default function BatchMeasurementEntry() {
  const { toast } = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');

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
    <FormProvider {...form}>
      <div className="container mx-auto p-4 md:p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Batch Measurement Entry</h1>
          <p className="text-muted-foreground">
            Enter measurements for multiple athletes in a spreadsheet-style grid
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Batch Entry Grid</CardTitle>
            <CardDescription>
              Add rows, fill in data, and save all measurements at once
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
                onClick={clearAll}
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
      </div>
    </FormProvider>
  );
}
