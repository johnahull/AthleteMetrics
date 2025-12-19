/**
 * ImportWizardExample Component
 * Example usage of the ImportWizard component
 *
 * This file demonstrates how to integrate the Import Wizard
 * into your application. You can copy this pattern to any page
 * where you want to provide CSV template generation.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileSpreadsheet, Users, Activity } from 'lucide-react';
import { ImportWizard } from './ImportWizard';

export function ImportWizardExample() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [initialType, setInitialType] = useState<'athletes' | 'measurements'>('athletes');

  const handleOpenWizard = (type: 'athletes' | 'measurements') => {
    setInitialType(type);
    setWizardOpen(true);
  };

  const handleComplete = () => {
    setWizardOpen(false);
    // Optional: Show success message or redirect
    console.log('Template downloaded successfully');
  };

  const handleCancel = () => {
    setWizardOpen(false);
    // Optional: Track cancellation analytics
    console.log('Wizard cancelled');
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import Data</h1>
        <p className="text-muted-foreground mt-2">
          Generate CSV templates for importing your data into AthleteMetrics.
        </p>
      </div>

      {/* Option cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Athletes import */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-700 rounded-lg">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <CardTitle>Import Athletes</CardTitle>
                <CardDescription>Add athlete profiles in bulk</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Create a customized CSV template for importing athlete information including
              personal details, team assignments, and contact information.
            </p>
            <Button
              onClick={() => handleOpenWizard('athletes')}
              className="w-full"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Generate Athletes Template
            </Button>
          </CardContent>
        </Card>

        {/* Measurements import */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 text-green-700 rounded-lg">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <CardTitle>Import Measurements</CardTitle>
                <CardDescription>Add performance data in bulk</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Create a CSV template with your organization's enabled metrics for importing
              test results and performance measurements.
            </p>
            <Button
              onClick={() => handleOpenWizard('measurements')}
              className="w-full"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Generate Measurements Template
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
              1
            </div>
            <div>
              <strong>Generate Template</strong>
              <p className="text-muted-foreground">
                Click a button above to launch the wizard. Select your teams and metrics to create a customized template.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
              2
            </div>
            <div>
              <strong>Fill in Data</strong>
              <p className="text-muted-foreground">
                Download the CSV template and fill it with your data. Follow the column format and example rows provided.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
              3
            </div>
            <div>
              <strong>Upload & Import</strong>
              <p className="text-muted-foreground">
                Return here and use the upload section to import your filled CSV. Review any warnings before finalizing.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Wizard Dialog */}
      <ImportWizard
        open={wizardOpen}
        initialType={initialType}
        onComplete={handleComplete}
        onCancel={handleCancel}
      />
    </div>
  );
}
