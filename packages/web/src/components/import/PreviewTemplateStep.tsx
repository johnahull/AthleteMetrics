/**
 * PreviewTemplateStep Component
 * Step 4: Preview generated template and download
 */

import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ChevronLeft, Download, Copy, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { TemplateWizardRequest, TemplateWizardResponse } from '@shared/import-types';

interface PreviewTemplateStepProps {
  importType: 'athletes' | 'measurements';
  teamIds: string[];
  metricCodes: string[];
  includeExamples: boolean;
  onToggleExamples: (include: boolean) => void;
  onBack: () => void;
  onComplete: () => void;
  onCancel: () => void;
}

export function PreviewTemplateStep({
  importType,
  teamIds,
  metricCodes,
  includeExamples,
  onToggleExamples,
  onBack,
  onComplete,
  onCancel
}: PreviewTemplateStepProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Generate template mutation
  const {
    data: templateData,
    mutate: generateTemplate,
    isPending,
    error
  } = useMutation<TemplateWizardResponse, Error, TemplateWizardRequest>({
    mutationFn: async (request) => {
      const response = await fetch('/api/import/templates/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to generate template' }));
        throw new Error(errorData.message || 'Failed to generate template');
      }

      return response.json();
    },
  });

  // Generate template on mount or when parameters change
  useEffect(() => {
    generateTemplate({
      type: importType,
      teamIds,
      metricCodes: importType === 'measurements' ? metricCodes : undefined,
      includeExamples,
    });
  }, [importType, teamIds, metricCodes, includeExamples, generateTemplate]);

  const handleDownload = () => {
    if (!templateData?.csvContent) return;

    const blob = new Blob([templateData.csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${importType}_import_template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Template downloaded',
      description: `Your ${importType} import template has been downloaded.`,
    });
  };

  const handleCopy = async () => {
    if (!templateData?.csvContent) return;

    try {
      await navigator.clipboard.writeText(templateData.csvContent);
      setCopied(true);
      toast({
        title: 'Copied to clipboard',
        description: 'Template CSV content has been copied.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: 'Copy failed',
        description: 'Failed to copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  const handleComplete = () => {
    handleDownload();
    onComplete();
  };

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Generating your template...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error.message || 'Failed to generate template. Please try again.'}
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Preview Template</h3>
        <p className="text-sm text-muted-foreground">
          Your CSV template is ready. Download it and fill in your data, then upload it for import.
        </p>
      </div>

      {/* Template info */}
      {templateData && (
        <div className="grid gap-3 text-sm">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-muted-foreground">Type:</span>
            <span className="font-medium capitalize">{importType}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-muted-foreground">Teams:</span>
            <span className="font-medium">{templateData.teams.length} selected</span>
          </div>
          {importType === 'measurements' && templateData.enabledMetrics && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-muted-foreground">Metrics:</span>
              <span className="font-medium">{templateData.enabledMetrics.length} selected</span>
            </div>
          )}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-muted-foreground">Columns:</span>
            <span className="font-medium">{templateData.headers.length} columns</span>
          </div>
        </div>
      )}

      {/* Toggle examples */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex-1">
          <Label htmlFor="include-examples" className="font-medium cursor-pointer">
            Include example rows
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            Add sample data to help you understand the format
          </p>
        </div>
        <Switch
          id="include-examples"
          checked={includeExamples}
          onCheckedChange={onToggleExamples}
        />
      </div>

      {/* CSV Preview */}
      {templateData?.csvContent && (
        <div className="space-y-2">
          <Label>CSV Preview</Label>
          <div className="relative">
            <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto max-h-[300px] overflow-y-auto font-mono">
              {templateData.csvContent}
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <Alert>
        <AlertDescription className="text-sm">
          <strong>Next steps:</strong>
          <ol className="mt-2 space-y-1 list-decimal list-inside">
            <li>Download the template CSV file</li>
            <li>Fill in your {importType} data following the column format</li>
            <li>Save the file and return to the import page</li>
            <li>Upload your filled template to complete the import</li>
          </ol>
        </AlertDescription>
      </Alert>

      {/* Navigation buttons */}
      <div className="flex gap-2 pt-4">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button onClick={handleDownload} variant="outline" className="ml-auto">
          <Download className="h-4 w-4 mr-2" />
          Download Template
        </Button>
        <Button onClick={handleComplete}>
          Done
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
