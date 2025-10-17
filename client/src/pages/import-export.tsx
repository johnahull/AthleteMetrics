import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CloudUpload, Download, Copy, Info, AlertTriangle, Users, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  downloadCSV,
  parseCSV,
  chunkCSVData,
  createCSVFromChunk,
  needsBatchProcessing,
  getBatchInfo,
  aggregateBatchResults
} from "@/lib/csv";
import { PhotoUpload } from "@/components/photo-upload";
import { ColumnMappingDialog } from "@/components/import/ColumnMappingDialog";
import { PreviewTableDialog } from "@/components/import/PreviewTableDialog";
import type { Team } from "@shared/schema";
import type {
  ImportPreview,
  CSVParseResult,
  PreviewRow,
  AthleteImportMode,
  MeasurementImportMode,
  TeamHandlingMode,
  ImportOptions
} from "@shared/import-types";
import {
  ATHLETE_MODE_DESCRIPTIONS,
  MEASUREMENT_MODE_DESCRIPTIONS,
  TEAM_HANDLING_DESCRIPTIONS
} from "@shared/import-types";
import { useAuth } from "@/lib/auth";

export default function ImportExport() {
  const [importType, setImportType] = useState<"athletes" | "measurements">("athletes");

  // New import mode states
  const [athleteMode, setAthleteMode] = useState<AthleteImportMode>("smart_import");
  const [measurementMode, setMeasurementMode] = useState<MeasurementImportMode>("match_only");
  const [teamHandling, setTeamHandling] = useState<TeamHandlingMode>("auto_create_confirm");

  // Additional options
  const [updateExisting, setUpdateExisting] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Legacy states (kept for backward compatibility during transition)
  const [importMode, setImportMode] = useState<"match" | "create">("match");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [importResults, setImportResults] = useState<any>(null);
  const [batchResults, setBatchResults] = useState<Map<string, any>>(new Map());
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);
  const [fileRowCounts, setFileRowCounts] = useState<Map<string, number>>(new Map());
  const [importStartTime, setImportStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cancelImport, setCancelImport] = useState(false);
  const [previewData, setPreviewData] = useState<ImportPreview | null>(null);
  const [showTeamConfirmDialog, setShowTeamConfirmDialog] = useState(false);
  const [selectedOrgForTeams, setSelectedOrgForTeams] = useState("");
  const [useColumnMapping, setUseColumnMapping] = useState(false);
  const [csvParseResult, setCsvParseResult] = useState<CSVParseResult | null>(null);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [showColumnMappingDialog, setShowColumnMappingDialog] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showBatchSplitDialog, setShowBatchSplitDialog] = useState(false);
  const [largeParsedFile, setLargeParsedFile] = useState<{ file: File; data: any[]; headers: string[] } | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; rowsProcessed: number } | null>(null);
  const { toast } = useToast();
  const { user, userOrganizations, organizationContext } = useAuth();

  const { data: teams = [] } = useQuery({
    queryKey: ["/api/teams"],
  }) as { data: Team[] };

  // Helper: Count rows in CSV file
  // PERFORMANCE: Skip row counting for large files to avoid loading entire file into memory
  const countCSVRows = async (file: File): Promise<number> => {
    // Skip row counting for files > 1MB to prevent performance issues
    // For large files, we just won't show row count in the UI
    if (file.size > 1 * 1024 * 1024) {
      return 0; // Return 0 to indicate "not counted" rather than "0 rows"
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          // Subtract 1 for header row
          resolve(Math.max(0, lines.length - 1));
        } catch (error) {
          resolve(0);
        }
      };
      reader.onerror = () => resolve(0);
      reader.readAsText(file);
    });
  };

  // Helper: Format elapsed time
  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Timer effect for elapsed time
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (importStartTime !== null) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - importStartTime) / 1000);
        setElapsedSeconds(elapsed);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [importStartTime]);

  // Parse CSV and return headers with suggested mappings
  const parseCsvMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: string }) => {
      // Fetch CSRF token first
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });

      if (!csrfResponse.ok) {
        throw new Error('Failed to fetch CSRF token');
      }

      const { csrfToken } = await csrfResponse.json();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await fetch('/api/import/parse-csv', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken
        },
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to parse CSV: ${errorText}`);
      }

      return response.json() as Promise<CSVParseResult>;
    },
    onSuccess: (data) => {
      setCsvParseResult(data);
      setShowColumnMappingDialog(true);
    },
    onError: (error: any) => {
      toast({
        title: "Parse Failed",
        description: error instanceof Error ? error.message : "Failed to parse CSV file",
        variant: "destructive",
      });
    },
  });

  // Generate preview with validation (simplified for now)
  const generatePreviewRows = (parseResult: CSVParseResult, mappings: Record<string, string>): PreviewRow[] => {
    return parseResult.rows.map((row, index) => {
      const mappedData: Record<string, any> = {};
      const validations: any[] = [];

      // Apply column mappings
      Object.entries(mappings).forEach(([csvColumn, systemField]) => {
        if (systemField) {
          mappedData[csvColumn] = row[csvColumn];

          // Basic validation
          const value = row[csvColumn];
          if (!value && ['firstName', 'lastName', 'date', 'metric', 'value'].includes(systemField)) {
            validations.push({
              rowIndex: index,
              field: systemField,
              status: 'error',
              message: 'Required field is empty'
            });
          } else if (value) {
            validations.push({
              rowIndex: index,
              field: systemField,
              status: 'valid'
            });
          }
        }
      });

      return {
        rowIndex: index,
        data: mappedData,
        validations,
        matchStatus: importMode === 'create' ? 'will_create' : 'will_match',
      };
    });
  };

  const previewMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('preview', 'true');

      const response = await fetch(`/api/import/${type}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Preview failed: ${errorText}`);
      }

      return response.json() as Promise<ImportPreview>;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      if (data.requiresConfirmation && data.missingTeams.length > 0) {
        // Auto-select first organization if user has only one
        if (userOrganizations && userOrganizations.length === 1) {
          setSelectedOrgForTeams(userOrganizations[0].organizationId);
        }
        setShowTeamConfirmDialog(true);
      } else {
        // No missing teams, proceed with import
        executeImport(data.previewData);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Preview Failed",
        description: error instanceof Error ? error.message : "Failed to preview CSV file",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({ file, type, mode, teamId, confirmData, options }: {
      file: File;
      type: string;
      mode?: string;
      teamId?: string;
      confirmData?: any;
      options?: ImportOptions;
    }) => {
      // Start timer for single file imports (batch handles its own timer)
      if (uploadFiles.length === 1) {
        setImportStartTime(Date.now());
        setElapsedSeconds(0);
      }

      const formData = new FormData();
      formData.append('file', file);

      // Legacy fields for backward compatibility
      if (mode === 'create' && teamId) {
        formData.append('teamId', teamId);
      }
      formData.append('createMissing', mode === 'create' ? 'true' : 'false');

      if (confirmData) {
        formData.append('confirmData', JSON.stringify(confirmData));
      }

      // New options object
      if (options) {
        formData.append('options', JSON.stringify(options));
      }

      const response = await fetch(`/api/import/${type === 'athletes' ? 'athletes' : type}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Import failed: ${errorText}`);
      }

      return response.json();
    },
    onSuccess: (data) => {
      setImportResults(data);
      setShowTeamConfirmDialog(false);

      // Reset timer for single file imports
      if (uploadFiles.length === 1) {
        setImportStartTime(null);
        setElapsedSeconds(0);
      }
      const hasResults = data.results.length > 0;
      const hasErrors = data.errors.length > 0;
      const hasWarnings = data.warnings?.length > 0;
      const createdTeamsCount = data.createdTeams?.length || 0;
      const createdAthletesCount = data.createdAthletes?.length || 0;

      // Build detailed description
      const summary = data.summary || {};
      const parts: string[] = [`Processed ${data.totalRows} rows`];

      if (summary.created > 0) parts.push(`${summary.created} created`);
      if (summary.updated > 0) parts.push(`${summary.updated} updated`);
      if (summary.matched > 0) parts.push(`${summary.matched} matched`);
      if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);
      if (hasErrors) parts.push(`${data.errors.length} errors`);
      if (hasWarnings) parts.push(`${data.warnings.length} warnings`);

      let description = parts.join(', ') + '.';

      if (createdTeamsCount > 0) {
        description += ` Created ${createdTeamsCount} new team${createdTeamsCount > 1 ? 's' : ''}.`;
      }
      if (createdAthletesCount > 0) {
        description += ` Created ${createdAthletesCount} new athlete${createdAthletesCount > 1 ? 's' : ''}.`;
      }

      toast({
        title: hasResults ? "Import Complete" : "Import Issues",
        description,
        variant: hasResults ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      console.error("Import error:", error);
      setShowTeamConfirmDialog(false);

      // Reset timer for single file imports
      if (uploadFiles.length === 1) {
        setImportStartTime(null);
        setElapsedSeconds(0);
      }

      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to process CSV file",
        variant: "destructive",
      });
    },
  });

  // Build import options from current state
  const buildImportOptions = (): ImportOptions => {
    const options: ImportOptions = {
      athleteMode: importType === 'athletes' ? athleteMode : undefined,
      measurementMode: importType === 'measurements' ? measurementMode : undefined,
      teamHandling,
      updateExisting,
      skipDuplicates,
      columnMappings: Object.keys(columnMappings).length > 0 ? columnMappings : undefined,
    };

    // Add organization ID if available
    if (selectedOrgForTeams) {
      options.organizationId = selectedOrgForTeams;
    } else if (userOrganizations && userOrganizations.length === 1) {
      options.organizationId = userOrganizations[0].organizationId;
    }

    return options;
  };

  const executeImport = (previewDataToUse?: any) => {
    if (uploadFiles.length === 0) return;
    const uploadFile = uploadFiles[0]; // For single file imports with preview

    const options = buildImportOptions();

    const confirmData = previewDataToUse ? {
      createMissingTeams: teamHandling === 'auto_create_confirm' || teamHandling === 'auto_create_silent',
      organizationId: options.organizationId,
      previewData: previewDataToUse,
      options
    } : undefined;

    importMutation.mutate({
      file: uploadFile,
      type: importType,
      mode: importMode, // Legacy field for backward compatibility
      teamId: selectedTeamId, // Legacy field
      confirmData,
      options // New options object
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      const files = Array.from(fileList).filter(f =>
        f.name.endsWith('.csv') || f.name.endsWith('.xlsx')
      );
      setUploadFiles(files);
      setImportResults(null);
      setBatchResults(new Map());

      // Count rows for each file
      const rowCounts = new Map<string, number>();
      for (const file of files) {
        const count = await countCSVRows(file);
        rowCounts.set(file.name, count);
      }
      setFileRowCounts(rowCounts);
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    const fileList = event.dataTransfer.files;
    if (fileList && fileList.length > 0) {
      const files = Array.from(fileList).filter(f =>
        f.name.endsWith('.csv') || f.name.endsWith('.xlsx')
      );
      setUploadFiles(files);
      setImportResults(null);
      setBatchResults(new Map());

      // Count rows for each file
      const rowCounts = new Map<string, number>();
      for (const file of files) {
        const count = await countCSVRows(file);
        rowCounts.set(file.name, count);
      }
      setFileRowCounts(rowCounts);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const removeFile = (index: number) => {
    const fileToRemove = uploadFiles[index];
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
    setFileRowCounts(prev => {
      const newCounts = new Map(prev);
      newCounts.delete(fileToRemove.name);
      return newCounts;
    });
  };

  const clearAllFiles = () => {
    setUploadFiles([]);
    setImportResults(null);
    setBatchResults(new Map());
    setFileRowCounts(new Map());
  };

  const processBatch = async () => {
    if (uploadFiles.length === 0) return;

    const results = new Map<string, any>();
    setProcessingProgress({ current: 0, total: uploadFiles.length });
    setCancelImport(false); // Reset cancel flag at start

    for (let i = 0; i < uploadFiles.length; i++) {
      // Check if import was cancelled
      if (cancelImport) {
        // Mark remaining files as cancelled
        for (let j = i; j < uploadFiles.length; j++) {
          results.set(uploadFiles[j].name, {
            success: false,
            error: 'Import cancelled by user',
            file: uploadFiles[j],
            cancelled: true
          });
        }
        break;
      }

      const file = uploadFiles[i];
      setProcessingProgress({ current: i + 1, total: uploadFiles.length });

      // Start timer for this file
      setImportStartTime(Date.now());
      setElapsedSeconds(0);

      try {
        const options = buildImportOptions();

        // For batch imports, automatically create teams without confirmation
        // to avoid showing multiple dialogs
        if (options.teamHandling === 'auto_create_confirm') {
          options.teamHandling = 'auto_create_silent';
        }

        const result = await importMutation.mutateAsync({
          file,
          type: importType,
          mode: importMode,
          teamId: selectedTeamId,
          options
        });
        results.set(file.name, { success: true, data: result, file });
      } catch (error) {
        results.set(file.name, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          file
        });
      }
    }

    setBatchResults(results);
    setProcessingProgress(null);
    setImportStartTime(null);
    setElapsedSeconds(0);
    setCancelImport(false); // Reset cancel flag

    // Show summary toast
    const successCount = Array.from(results.values()).filter(r => r.success).length;
    const cancelledCount = Array.from(results.values()).filter((r: any) => r.cancelled).length;
    const failCount = results.size - successCount - cancelledCount;

    // Count total created teams across all files
    const totalCreatedTeams = Array.from(results.values())
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.data?.createdTeams?.length || 0), 0);

    let title = cancelledCount > 0 ? "Batch Import Cancelled" : "Batch Import Complete";
    let description = `${successCount} file${successCount !== 1 ? 's' : ''} imported successfully`;
    if (cancelledCount > 0) {
      description += `, ${cancelledCount} cancelled`;
    }
    if (failCount > 0) {
      description += `, ${failCount} failed`;
    }
    if (totalCreatedTeams > 0) {
      description += `. ${totalCreatedTeams} team${totalCreatedTeams !== 1 ? 's' : ''} created automatically`;
    }

    toast({
      title,
      description,
      variant: failCount > 0 ? "destructive" : cancelledCount > 0 ? "default" : "default",
    });
  };

  // Process a large file that exceeds 10k rows by splitting into batches
  const processLargeFile = async (file: File, data: any[], headers: string[]) => {
    const MAX_ROWS_PER_BATCH = 10000;
    const batchInfo = getBatchInfo(data.length, MAX_ROWS_PER_BATCH);

    setBatchProgress({ current: 0, total: batchInfo.batchCount, rowsProcessed: 0 });
    setImportStartTime(Date.now());
    setElapsedSeconds(0);
    setCancelImport(false);

    // Split data into chunks
    const chunks = chunkCSVData(data, MAX_ROWS_PER_BATCH);
    const batchResults: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
      // Check if cancelled
      if (cancelImport) {
        setBatchProgress(null);
        setImportStartTime(null);
        setElapsedSeconds(0);
        toast({
          title: "Import Cancelled",
          description: `Cancelled after processing ${i} of ${chunks.length} batches (${i * MAX_ROWS_PER_BATCH} rows)`,
          variant: "default",
        });
        return;
      }

      const chunk = chunks[i];
      const rowsProcessed = i * MAX_ROWS_PER_BATCH + chunk.length;
      setBatchProgress({ current: i + 1, total: chunks.length, rowsProcessed });

      try {
        // Create CSV from chunk
        const csvContent = createCSVFromChunk(chunk, headers);
        const csvBlob = new Blob([csvContent], { type: 'text/csv' });
        const batchFile = new File([csvBlob], file.name, { type: 'text/csv' });

        const options = buildImportOptions();

        // For batch imports, automatically create teams without confirmation
        if (options.teamHandling === 'auto_create_confirm') {
          options.teamHandling = 'auto_create_silent';
        }

        const result = await importMutation.mutateAsync({
          file: batchFile,
          type: importType,
          mode: importMode,
          teamId: selectedTeamId,
          options
        });

        batchResults.push(result);
      } catch (error) {
        // On error, still continue processing remaining batches but track the error
        batchResults.push({
          error: error instanceof Error ? error.message : 'Unknown error',
          totalRows: chunk.length,
          errors: [{ message: error instanceof Error ? error.message : 'Unknown error' }],
          summary: { created: 0, updated: 0, matched: 0, skipped: chunk.length }
        });
      }
    }

    // Aggregate results
    const aggregated = aggregateBatchResults(batchResults);
    setImportResults(aggregated);

    setBatchProgress(null);
    setImportStartTime(null);
    setElapsedSeconds(0);
    setCancelImport(false);

    // Show success toast
    const hasErrors = aggregated.errors.length > 0;
    const parts: string[] = [`Processed ${aggregated.totalRows} rows in ${batchInfo.batchCount} batches`];

    if (aggregated.summary.created > 0) parts.push(`${aggregated.summary.created} created`);
    if (aggregated.summary.updated > 0) parts.push(`${aggregated.summary.updated} updated`);
    if (aggregated.summary.matched > 0) parts.push(`${aggregated.summary.matched} matched`);
    if (aggregated.summary.skipped > 0) parts.push(`${aggregated.summary.skipped} skipped`);
    if (hasErrors) parts.push(`${aggregated.errors.length} errors`);

    const description = parts.join(', ') + '.';

    toast({
      title: hasErrors ? "Batch Import Complete with Errors" : "Batch Import Complete",
      description,
      variant: hasErrors ? "destructive" : "default",
    });
  };

  const handleImport = async () => {
    if (uploadFiles.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one file to import",
        variant: "destructive",
      });
      return;
    }

    // If multiple files, process as batch
    if (uploadFiles.length > 1) {
      // Notify user if teams will be auto-created during batch import
      if (teamHandling === 'auto_create_confirm') {
        toast({
          title: "Batch Import Starting",
          description: "Any missing teams will be created automatically for batch imports",
        });
      }
      processBatch();
      return;
    }

    // Single file - check if it needs batch processing (>10k rows)
    const uploadFile = uploadFiles[0];
    const rowCount = fileRowCounts.get(uploadFile.name);

    // If row count is available and exceeds 10k, parse and offer batch processing
    if (rowCount && needsBatchProcessing(rowCount)) {
      // Parse the file to get the data
      const text = await uploadFile.text();
      const parsed = parseCSV(text);

      if (parsed.length === 0) {
        toast({
          title: "Error",
          description: "CSV file appears to be empty or invalid",
          variant: "destructive",
        });
        return;
      }

      // Extract headers
      const headers = Object.keys(parsed[0]);
      const batchInfo = getBatchInfo(parsed.length);

      // Store parsed data and show confirmation dialog
      setLargeParsedFile({ file: uploadFile, data: parsed, headers });
      setShowBatchSplitDialog(true);

      return;
    }

    // Regular single file processing - use existing flow
    // uploadFile is already declared above at line 678

    // If column mapping is enabled, start with CSV parsing
    if (useColumnMapping) {
      parseCsvMutation.mutate({
        file: uploadFile,
        type: importType,
      });
      return;
    }

    // Check if we need team confirmation dialog
    const needsTeamConfirmation = teamHandling === 'auto_create_confirm' &&
      (importType === 'athletes' || (importType === 'measurements' && measurementMode === 'create_athletes'));

    // For athletes import or measurements with create mode, preview to check for missing teams
    if (needsTeamConfirmation) {
      previewMutation.mutate({
        file: uploadFile,
        type: importType,
      });
    } else {
      // Proceed directly with import
      const options = buildImportOptions();
      importMutation.mutate({
        file: uploadFile,
        type: importType,
        mode: importMode, // Legacy
        teamId: selectedTeamId, // Legacy
        options
      });
    }
  };

  const handleColumnMappingConfirm = (mappings: Record<string, string>) => {
    setColumnMappings(mappings);
    setShowColumnMappingDialog(false);

    // Generate preview rows with validation
    if (csvParseResult) {
      const preview = generatePreviewRows(csvParseResult, mappings);
      setPreviewRows(preview);
      setShowPreviewDialog(true);
    }
  };

  const handlePreviewConfirm = () => {
    setShowPreviewDialog(false);
    if (uploadFiles.length === 0) return;
    const uploadFile = uploadFiles[0];

    // Check for missing teams if in create mode
    if (importType === "athletes" && importMode === "create") {
      previewMutation.mutate({
        file: uploadFile,
        type: importType,
      });
    } else {
      // Proceed with import
      if (importMode === "create" && !selectedTeamId) {
        toast({
          title: "Error",
          description: "Please select a team for creating missing athletes",
          variant: "destructive",
        });
        return;
      }

      importMutation.mutate({
        file: uploadFile,
        type: importType,
        mode: importMode,
        teamId: selectedTeamId,
      });
    }
  };

  const handleExport = async (exportType: string) => {
    try {
      // Get effective organization ID
      const effectiveOrgId = organizationContext || userOrganizations?.[0]?.organizationId;

      // Build URL with organizationId parameter if available
      let url = `/api/export/${exportType}`;
      if (effectiveOrgId) {
        url += `?organizationId=${encodeURIComponent(effectiveOrgId)}`;
      }

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You do not have permission to export from this organization');
        }
        throw new Error('Export failed');
      }

      const csvData = await response.text();
      downloadCSV(csvData, `${exportType}.csv`);

      toast({
        title: "Success",
        description: `${exportType} data exported successfully`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : `Failed to export ${exportType} data`,
        variant: "destructive",
      });
    }
  };

  const athletesTemplate = `firstName,lastName,birthDate,birthYear,graduationYear,gender,emails,phoneNumbers,sports,height,weight,school,teamName
Mia,Chen,2009-03-15,2009,2027,Female,"mia.chen@email.com,mia.chen.athlete@gmail.com","512-555-0123,512-555-4567","Soccer,Track & Field",66,125,Westlake HS,Lonestar 09G Navy
Elise,Ramos,2008-08-22,2008,2026,Female,elise.ramos@email.com,512-555-0234,Soccer,64,118,Anderson HS,Thunder Elite
Jordan,Williams,2009-01-10,2009,2027,Male,"jordan.williams@email.com,j.williams@school.edu","512-555-0345,512-555-6789","Track & Field,Basketball",68,140,Lake Travis HS,Lightning 08G`;

  const measurementsTemplate = `firstName,lastName,gender,teamName,date,age,metric,value,units,flyInDistance,notes
Mia,Chen,Female,FIERCE 08G,2025-01-20,15,FLY10_TIME,1.26,s,20,Electronic gates - outdoor track
Elise,Ramos,Female,Thunder Elite,2025-01-19,16,VERTICAL_JUMP,21.5,in,,Jump mat measurement
Jordan,Williams,Male,Lightning 08G,2025-01-18,15,FLY10_TIME,1.31,s,15,Manual timing - indoor facility
Alex,Johnson,Male,FIERCE 08G,2025-01-17,17,VERTICAL_JUMP,24.2,in,,Approach jump
Taylor,Rodriguez,Female,Thunder Elite,2025-01-16,16,AGILITY_505,2.45,s,,Left foot turn
Morgan,Lee,Male,Lightning 08G,2025-01-15,15,T_TEST,9.8,s,,Standard protocol
Casey,Thompson,Female,FIERCE 08G,2025-01-14,17,DASH_40YD,5.2,s,,Hand timed
Jamie,Anderson,Not Specified,Thunder Elite,2025-01-13,16,RSI,2.1,,,Drop jump test
Avery,Smith,Female,FIERCE 08G,2025-01-12,16,TOP_SPEED,18.5,mph,,Measured with radar gun`;

  const copyToClipboard = (text: string, name: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${name} template copied to clipboard`,
    });
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Import & Export Data</h1>

        {/* Import Section */}
        <Card className="bg-white mb-8">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Import Data</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* File Upload */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">Import {importType === "athletes" ? "Athletes" : "Measurements"}</h4>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Import Type</label>
                  <Select value={importType} onValueChange={(value) => setImportType(value as "athletes" | "measurements")}>
                    <SelectTrigger data-testid="select-import-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="athletes">Athletes</SelectItem>
                      <SelectItem value="measurements">Measurements</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Upload ${importType} CSV file. Press Enter or Space to browse files, or drag and drop files here`}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      document.getElementById('file-upload')?.click();
                    }
                  }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  data-testid="file-drop-zone"
                >
                  <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">
                    {uploadFiles.length > 0
                      ? `${uploadFiles.length} file${uploadFiles.length !== 1 ? 's' : ''} selected`
                      : `Drop your ${importType} CSV file(s) here, or`}
                  </p>
                  <Button variant="ghost" className="text-primary hover:text-blue-700 font-medium">
                    click to browse
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">Supports CSV and XLSX files (multiple files supported)</p>

                  <Input
                    id="file-upload"
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleFileUpload}
                    className="hidden"
                    data-testid="input-file-upload"
                    multiple
                  />
                </div>

                {/* File List */}
                {uploadFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-gray-700">
                        Selected Files ({uploadFiles.length})
                      </h5>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFiles}
                        className="text-red-600 hover:text-red-700 text-xs"
                      >
                        Clear All
                      </Button>
                    </div>
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-40 overflow-y-auto">
                      {uploadFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 hover:bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                            <p className="text-xs text-gray-500">
                              {(file.size / 1024).toFixed(1)} KB
                              {fileRowCounts.get(file.name) && fileRowCounts.get(file.name)! > 0 && ` • ${fileRowCounts.get(file.name)} rows`}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(index);
                            }}
                            className="ml-2 text-gray-400 hover:text-red-600"
                          >
                            ✕
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <Button
                    variant="ghost"
                    onClick={() => copyToClipboard(
                      importType === "athletes" ? athletesTemplate : measurementsTemplate,
                      importType === "athletes" ? "athletes" : importType
                    )}
                    className="text-primary hover:text-blue-700 text-sm"
                    data-testid="button-download-template"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download {importType === "athletes" ? "athletes" : importType} template
                  </Button>
                </div>
              </div>

              {/* Import Options */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">Import Options</h4>

                {/* Preset Workflows */}
                <div className="mb-4 pb-4 border-b">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quick Presets</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (importType === 'athletes') {
                          setAthleteMode('smart_import');
                          setTeamHandling('auto_create_silent');
                          setUpdateExisting(true);
                          setSkipDuplicates(false);
                        } else {
                          setMeasurementMode('create_athletes');
                          setTeamHandling('auto_create_silent');
                        }
                      }}
                      className="text-xs"
                    >
                      🚀 Quick Import
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (importType === 'athletes') {
                          setAthleteMode('smart_import');
                          setTeamHandling('auto_create_confirm');
                          setUpdateExisting(true);
                          setSkipDuplicates(false);
                        } else {
                          setMeasurementMode('review_low_confidence');
                          setTeamHandling('auto_create_confirm');
                        }
                      }}
                      className="text-xs"
                    >
                      🔍 Careful Import
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (importType === 'athletes') {
                          setAthleteMode('match_and_update');
                          setTeamHandling('require_existing');
                          setUpdateExisting(true);
                          setSkipDuplicates(true);
                        } else {
                          setMeasurementMode('match_only');
                          setTeamHandling('require_existing');
                        }
                      }}
                      className="text-xs"
                    >
                      ✏️ Update Only
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (importType === 'athletes') {
                          setAthleteMode('create_only');
                          setTeamHandling('auto_create_silent');
                          setUpdateExisting(false);
                          setSkipDuplicates(false);
                        } else {
                          setMeasurementMode('create_athletes');
                          setTeamHandling('auto_create_silent');
                        }
                      }}
                      className="text-xs"
                    >
                      ➕ Create All New
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Click a preset to quickly configure all options, or customize below
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Column Mapping Toggle */}
                  <div className="pb-3 border-b">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useColumnMapping}
                        onChange={(e) => setUseColumnMapping(e.target.checked)}
                        className="text-primary focus:ring-primary rounded"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          Preview & Map Columns
                        </div>
                        <div className="text-xs text-gray-500">
                          Map your CSV columns and preview data before importing
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Import Mode Selector */}
                  {importType === "athletes" ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        Import Mode
                        <span className="text-xs text-blue-600" title="How to handle athlete records">ℹ️</span>
                      </label>
                      <Select
                        value={athleteMode}
                        onValueChange={(value) => setAthleteMode(value as AthleteImportMode)}
                      >
                        <SelectTrigger data-testid="select-athlete-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ATHLETE_MODE_DESCRIPTIONS).map(([mode, { label, description }]) => (
                            <SelectItem key={mode} value={mode}>
                              <div>
                                <div className="font-medium">{label}</div>
                                <div className="text-xs text-gray-500">{description}</div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {athleteMode === 'smart_import' && (
                        <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-800">
                          💡 Recommended for most imports. Automatically creates new athletes or updates existing ones.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        Import Mode
                        <span className="text-xs text-blue-600" title="How to match measurements to athletes">ℹ️</span>
                      </label>
                      <Select
                        value={measurementMode}
                        onValueChange={(value) => setMeasurementMode(value as MeasurementImportMode)}
                      >
                        <SelectTrigger data-testid="select-measurement-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(MEASUREMENT_MODE_DESCRIPTIONS).map(([mode, { label, description }]) => (
                            <SelectItem key={mode} value={mode}>
                              <div>
                                <div className="font-medium">{label}</div>
                                <div className="text-xs text-gray-500">{description}</div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {measurementMode === 'create_athletes' && (
                        <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-800">
                          💡 New athletes will be created automatically for any measurements without matching athletes.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Team Handling */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Team Handling</label>
                    <Select
                      value={teamHandling}
                      onValueChange={(value) => setTeamHandling(value as TeamHandlingMode)}
                    >
                      <SelectTrigger data-testid="select-team-handling">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TEAM_HANDLING_DESCRIPTIONS).map(([mode, { label, description }]) => (
                          <SelectItem key={mode} value={mode}>
                            <div>
                              <div className="font-medium">{label}</div>
                              <div className="text-xs text-gray-500">{description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Advanced Options Toggle */}
                  <div className="pt-2">
                    <button
                      onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      {showAdvancedOptions ? '▼' : '▶'} Advanced Options
                    </button>
                  </div>

                  {/* Advanced Options Panel */}
                  {showAdvancedOptions && (
                    <div className="space-y-3 pl-4 border-l-2 border-gray-200">
                      {athleteMode !== 'create_only' && importType === "athletes" && (
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={updateExisting}
                            onChange={(e) => setUpdateExisting(e.target.checked)}
                            className="text-primary focus:ring-primary rounded"
                          />
                          <div className="text-sm">
                            <div className="font-medium text-gray-700">Update Existing Athletes</div>
                            <div className="text-xs text-gray-500">Update athlete info when matching</div>
                          </div>
                        </label>
                      )}

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={skipDuplicates}
                          onChange={(e) => setSkipDuplicates(e.target.checked)}
                          className="text-primary focus:ring-primary rounded"
                        />
                        <div className="text-sm">
                          <div className="font-medium text-gray-700">Skip Duplicates</div>
                          <div className="text-xs text-gray-500">Skip rows that would create duplicate records</div>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Progress Indicator */}
                  {(processingProgress || batchProgress) && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between text-sm text-blue-800 mb-2">
                        <div className="flex-1">
                          <div className="font-medium">
                            {batchProgress
                              ? `Processing Large File in Batches`
                              : `Processing ${uploadFiles[processingProgress!.current - 1]?.name || 'file'}`
                            }
                          </div>
                          <div className="text-xs text-blue-600 mt-1">
                            {batchProgress ? (
                              <>
                                {batchProgress.rowsProcessed.toLocaleString()} rows processed
                                {elapsedSeconds > 0 && ` • ⏱ ${formatElapsedTime(elapsedSeconds)} elapsed`}
                              </>
                            ) : processingProgress && (() => {
                              const currentFile = uploadFiles[processingProgress.current - 1];
                              const rowCount = currentFile ? fileRowCounts.get(currentFile.name) : 0;
                              return (
                                <>
                                  {rowCount && rowCount > 0 && <>{rowCount} rows • </>}
                                  {currentFile && <>{(currentFile.size / 1024).toFixed(1)} KB</>}
                                  {elapsedSeconds > 0 && ` • ⏱ ${formatElapsedTime(elapsedSeconds)} elapsed`}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <span className="text-xs font-medium">
                          {batchProgress
                            ? `Batch ${batchProgress.current}/${batchProgress.total}`
                            : processingProgress && `${processingProgress.current}/${processingProgress.total}`
                          }
                        </span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: batchProgress
                              ? `${(batchProgress.current / batchProgress.total) * 100}%`
                              : processingProgress
                              ? `${(processingProgress.current / processingProgress.total) * 100}%`
                              : '0%'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={handleImport}
                      disabled={uploadFiles.length === 0 || importMutation.isPending || processingProgress !== null || batchProgress !== null}
                      className="flex-1"
                      data-testid="button-import"
                    >
                      {batchProgress
                        ? `Processing Batch ${batchProgress.current}/${batchProgress.total}...`
                        : processingProgress
                        ? `Processing ${processingProgress.current}/${processingProgress.total}...`
                        : importMutation.isPending && uploadFiles.length === 1
                        ? (() => {
                            const file = uploadFiles[0];
                            const rowCount = file ? fileRowCounts.get(file.name) : undefined;
                            if (rowCount && rowCount > 0) {
                              return `Importing ${rowCount} rows${elapsedSeconds > 0 ? ` (${formatElapsedTime(elapsedSeconds)})` : '...'}`;
                            }
                            return `Importing${elapsedSeconds > 0 ? ` (${formatElapsedTime(elapsedSeconds)})` : '...'}`;
                          })()
                        : importMutation.isPending
                        ? "Importing..."
                        : `Import ${uploadFiles.length > 1 ? `${uploadFiles.length} Files` : 'Data'}`}
                    </Button>

                    {(processingProgress !== null || batchProgress !== null || importMutation.isPending) && (
                      <Button
                        onClick={() => setCancelImport(true)}
                        variant="outline"
                        className="px-4"
                        data-testid="button-cancel-import"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Batch Results - Multiple Files */}
            {batchResults.size > 0 && (
              <div className="mt-6 space-y-4">
                {/* Summary */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h5 className="font-medium text-blue-900 mb-2">Batch Import Summary</h5>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-900">{batchResults.size}</p>
                      <p className="text-blue-700">Total Files</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {Array.from(batchResults.values()).filter(r => r.success).length}
                      </p>
                      <p className="text-blue-700">Successful</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">
                        {Array.from(batchResults.values()).filter(r => !r.success).length}
                      </p>
                      <p className="text-blue-700">Failed</p>
                    </div>
                  </div>
                </div>

                {/* Individual File Results */}
                <div className="space-y-3">
                  <h5 className="font-medium text-gray-900">File Results</h5>
                  {Array.from(batchResults.entries()).map(([filename, result]) => (
                    <details key={filename} className="border border-gray-200 rounded-lg">
                      <summary className="cursor-pointer p-3 hover:bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {result.success ? '✓ Success' : '✗ Failed'}
                          </span>
                          <span className="font-medium text-gray-900">{filename}</span>
                        </div>
                        {result.success && result.data && (
                          <span className="text-sm text-gray-600">
                            {result.data.totalRows} rows • {result.data.results?.length || 0} valid
                          </span>
                        )}
                      </summary>
                      <div className="p-4 border-t border-gray-200 bg-gray-50">
                        {result.success && result.data ? (
                          <>
                            <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                              <div className="text-center">
                                <p className="text-xl font-bold text-gray-900">{result.data.totalRows}</p>
                                <p className="text-gray-600">Total Rows</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xl font-bold text-green-600">{result.data.results?.length || 0}</p>
                                <p className="text-gray-600">Valid</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xl font-bold text-red-600">{result.data.errors?.length || 0}</p>
                                <p className="text-gray-600">Errors</p>
                              </div>
                            </div>
                            {result.data.errors?.length > 0 && (
                              <div className="mt-3">
                                <h6 className="font-medium text-red-800 mb-2 text-sm">Errors:</h6>
                                <div className="max-h-32 overflow-y-auto space-y-1 border border-red-200 rounded p-2 bg-red-50">
                                  {result.data.errors.slice(0, 10).map((error: any, index: number) => (
                                    <p key={index} className="text-xs text-red-600">
                                      Row {error.row}: {error.error}
                                    </p>
                                  ))}
                                  {result.data.errors.length > 10 && (
                                    <p className="text-xs text-red-500 italic">
                                      ...and {result.data.errors.length - 10} more errors
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-sm text-red-600">
                            <p className="font-medium mb-1">Import Failed:</p>
                            <p>{result.error || 'Unknown error'}</p>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Import Results - Single File */}
            {importResults && (
              <div className="mt-6 p-4 border border-gray-200 rounded-lg">
                <h5 className="font-medium text-gray-900 mb-3">Import Results</h5>
                <div className={`grid gap-4 text-sm ${importResults.warnings?.length > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{importResults.totalRows}</p>
                    <p className="text-gray-600">Total Rows</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{importResults.results.length}</p>
                    <p className="text-gray-600">Valid</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{importResults.errors.length}</p>
                    <p className="text-gray-600">Errors</p>
                  </div>
                  {importResults.warnings?.length > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-bold text-yellow-600">{importResults.warnings.length}</p>
                      <p className="text-gray-600">Warnings</p>
                    </div>
                  )}
                </div>

                {importResults.warnings?.length > 0 && (
                  <div className="mt-4">
                    <h6 className="font-medium text-yellow-800 mb-2">Smart Data Placement:</h6>
                    <div className="max-h-48 overflow-y-auto space-y-1 border border-yellow-200 rounded p-3 bg-yellow-50">
                      {importResults.warnings.map((warning: any, index: number) => (
                        <p key={index} className="text-sm text-yellow-600">
                          {warning.row}: {warning.warning}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {importResults.errors.length > 0 && (
                  <div className="mt-4">
                    <h6 className="font-medium text-red-800 mb-2">Errors:</h6>
                    <div className="max-h-48 overflow-y-auto space-y-1 border border-red-200 rounded p-3 bg-red-50">
                      {importResults.errors.map((error: any, index: number) => (
                        <p key={index} className="text-sm text-red-600">
                          Row {index + 1}: {error.error}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CSV Templates & Examples */}
        <Card className="bg-white mb-8">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">CSV Templates & Examples</h3>

            <div className="space-y-8">
              {/* Athletes CSV Format */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">Athletes CSV Format</h4>
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-600 mb-2"># athletes.csv</div>
                  <pre className="whitespace-pre-wrap">{athletesTemplate}</pre>
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    <span className="font-medium">Required:</span> firstName, lastName, birthDate (YYYY-MM-DD) • 
                    <span className="font-medium">Optional:</span> teamName, birthYear, graduationYear, emails, phoneNumbers, sports, height (36-84 in), weight (50-400 lbs), school
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(athletesTemplate, "Athletes")}
                    data-testid="button-copy-athletes-template"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>

              {/* Measurements CSV Format */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">Measurements CSV Format</h4>
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-600 mb-2"># measurements.csv</div>
                  <pre className="whitespace-pre-wrap">{measurementsTemplate}</pre>
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    <span className="font-medium">Required:</span> firstName, lastName, teamName, date (YYYY-MM-DD), metric (FLY10_TIME, VERTICAL_JUMP, AGILITY_505, AGILITY_5105, T_TEST, DASH_40YD, RSI), value (positive number) • 
                    <span className="font-medium">Optional:</span> age (10-25), units (s/in), flyInDistance, notes
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(measurementsTemplate, "Measurements")}
                    data-testid="button-copy-measurements-template"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Import Guidelines:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• <strong>Smart Contact Detection:</strong> Emails and phone numbers are automatically validated and placed in correct fields regardless of which column they're in</li>
                    <li>• Metric values: FLY10_TIME (seconds) or VERTICAL_JUMP (inches)</li>
                    <li>• Units will be auto-detected if missing (s for FLY10_TIME, in for VERTICAL_JUMP)</li>
                    <li>• FlyInDistance optional field (in yards) for FLY10_TIME measurements only</li>
                    <li>• Date format: YYYY-MM-DD</li>
                    <li>• Athlete matching is case-sensitive</li>
                    <li>• Phone numbers support US format: (555) 123-4567, 555-123-4567, or 5551234567</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Photo OCR Import Section */}
        <PhotoUpload onSuccess={() => {
          toast({
            title: "Success",
            description: "Measurements imported successfully from photo",
          });
          setImportResults(null); // Clear CSV results since this is a different import method
        }} />

        {/* Export Section */}
        <Card className="bg-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Export Data</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Download className="h-6 w-6 text-blue-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Export Athletes</h4>
                <p className="text-sm text-gray-600 mb-4">Download all athlete information including team assignments</p>
                <Button 
                  onClick={() => handleExport("athletes")}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  data-testid="button-export-athletes"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Athletes CSV
                </Button>
              </div>

              <div className="text-center p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Download className="h-6 w-6 text-green-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Export Measurements</h4>
                <p className="text-sm text-gray-600 mb-4">Download all measurement data with current filters applied</p>
                <Button 
                  onClick={() => handleExport("measurements")}
                  className="w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-export-measurements"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Measurements CSV
                </Button>
              </div>

              <div className="text-center p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Download className="h-6 w-6 text-purple-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Full Export</h4>
                <p className="text-sm text-gray-600 mb-4">Download complete database backup including all teams and data</p>
                <Button 
                  onClick={() => {
                    handleExport("athletes");
                    handleExport("measurements");
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  data-testid="button-export-all"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export All Data
                </Button>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-1 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">Export Notes:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Exported files will include all data visible in your current view/filters</li>
                    <li>• Use the analytics page filters to customize what gets exported</li>
                    <li>• Full export includes all teams, athletes, and measurements</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Creation Confirmation Dialog */}
        <Dialog open={showTeamConfirmDialog} onOpenChange={setShowTeamConfirmDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create Missing Teams?</DialogTitle>
              <DialogDescription>
                The following teams don't exist in your organization. Would you like to create them?
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              {/* Organization Selection */}
              {userOrganizations && userOrganizations.length > 1 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Organization for New Teams
                  </label>
                  <Select value={selectedOrgForTeams} onValueChange={setSelectedOrgForTeams}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select organization..." />
                    </SelectTrigger>
                    <SelectContent>
                      {userOrganizations.map((org) => (
                        <SelectItem key={org.organizationId} value={org.organizationId}>
                          {org.organizationName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Missing Teams List */}
              <div className="space-y-3">
                {previewData?.missingTeams.map((team, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-blue-600" />
                        <div>
                          <h4 className="font-medium text-gray-900">{team.teamName}</h4>
                          <p className="text-sm text-gray-600">
                            {team.athleteCount} athlete{team.athleteCount > 1 ? 's' : ''} will be added
                          </p>
                        </div>
                      </div>
                    </div>
                    {team.athleteNames.length <= 5 && (
                      <div className="mt-2 text-xs text-gray-500">
                        {team.athleteNames.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowTeamConfirmDialog(false);
                  setPreviewData(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedOrgForTeams && userOrganizations && userOrganizations.length > 0) {
                    toast({
                      title: "Organization Required",
                      description: "Please select an organization for the new teams",
                      variant: "destructive",
                    });
                    return;
                  }
                  executeImport(previewData?.previewData);
                }}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending ? "Creating Teams & Importing..." : "Create Teams & Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Batch Split Confirmation Dialog */}
        <Dialog open={showBatchSplitDialog} onOpenChange={setShowBatchSplitDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Large File Detected</DialogTitle>
              <DialogDescription>
                This file contains {largeParsedFile?.data.length.toLocaleString()} rows, which exceeds the 10,000 row limit.
                {largeParsedFile && (() => {
                  const batchInfo = getBatchInfo(largeParsedFile.data.length);
                  return (
                    <>
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="font-medium text-blue-900 mb-2">Auto-Split Details:</h4>
                        <ul className="text-sm text-blue-800 space-y-1">
                          <li>• File will be split into <strong>{batchInfo.batchCount} batches</strong></li>
                          <li>• Each batch will contain up to <strong>10,000 rows</strong></li>
                          <li>• Last batch will have <strong>{batchInfo.lastBatchSize.toLocaleString()} rows</strong></li>
                          <li>• Batches will be processed sequentially</li>
                          <li>• Results will be aggregated automatically</li>
                        </ul>
                      </div>
                      <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                        <AlertTriangle className="h-4 w-4 inline mr-1" />
                        <strong>Note:</strong> Teams will be created automatically without confirmation during batch processing.
                      </div>
                    </>
                  );
                })()}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowBatchSplitDialog(false);
                  setLargeParsedFile(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowBatchSplitDialog(false);
                  if (largeParsedFile) {
                    processLargeFile(largeParsedFile.file, largeParsedFile.data, largeParsedFile.headers);
                  }
                }}
              >
                Proceed with Auto-Split
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Column Mapping Dialog */}
        <ColumnMappingDialog
          open={showColumnMappingDialog}
          onOpenChange={setShowColumnMappingDialog}
          parseResult={csvParseResult}
          importType={importType}
          onConfirm={handleColumnMappingConfirm}
        />

        {/* Preview Table Dialog */}
        <PreviewTableDialog
          open={showPreviewDialog}
          onOpenChange={setShowPreviewDialog}
          previewRows={previewRows}
          columnMappings={columnMappings}
          onConfirm={handlePreviewConfirm}
          isLoading={importMutation.isPending}
        />
      </div>
    </div>
  );
}