/**
 * Preview Table Dialog for CSV Import
 * Shows preview of data with validation status before import
 */

import * as React from 'react';
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, AlertTriangle, X, Users, UserPlus } from 'lucide-react';
import type { PreviewRow } from '@shared/import-types';
import { IMPORT_CONFIG } from '@/config/import';

interface PreviewTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewRows: PreviewRow[];
  columnMappings: Record<string, string>;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function PreviewTableDialog({
  open,
  onOpenChange,
  previewRows,
  columnMappings,
  onConfirm,
  isLoading = false,
}: PreviewTableDialogProps) {
  // PERFORMANCE: Limit displayed rows to prevent browser freeze with large datasets
  const displayedRows = previewRows.slice(0, IMPORT_CONFIG.MAX_DISPLAYED_ROWS);
  const hasMoreRows = previewRows.length > IMPORT_CONFIG.MAX_DISPLAYED_ROWS;

  const getStatusIcon = (status?: 'will_create' | 'will_match' | 'duplicate' | 'error') => {
    switch (status) {
      case 'will_create':
        return <UserPlus className="h-4 w-4 text-blue-600" />;
      case 'will_match':
        return <Users className="h-4 w-4 text-green-600" />;
      case 'duplicate':
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case 'error':
        return <X className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status?: 'will_create' | 'will_match' | 'duplicate' | 'error') => {
    switch (status) {
      case 'will_create':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Will Create</Badge>;
      case 'will_match':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Will Match</Badge>;
      case 'duplicate':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Duplicate?</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return null;
    }
  };

  // PERFORMANCE: Memoize expensive computations to prevent recalculation on every render
  const hasErrors = useMemo(() =>
    previewRows.some(row =>
      row.validations.some(v => v.status === 'error') || row.matchStatus === 'error'
    ),
    [previewRows]
  );

  const hasWarnings = useMemo(() =>
    previewRows.some(row =>
      row.validations.some(v => v.status === 'warning') || row.matchStatus === 'duplicate'
    ),
    [previewRows]
  );

  // Get list of mapped columns to display
  const displayColumns = useMemo(() =>
    Object.entries(columnMappings)
      .filter(([_, systemField]) => systemField)
      .map(([csvColumn, systemField]) => ({ csvColumn, systemField })),
    [columnMappings]
  );

  const summary = useMemo(() => ({
    total: previewRows.length,
    willCreate: previewRows.filter(r => r.matchStatus === 'will_create').length,
    willMatch: previewRows.filter(r => r.matchStatus === 'will_match').length,
    errors: previewRows.filter(r => r.matchStatus === 'error').length,
    duplicates: previewRows.filter(r => r.matchStatus === 'duplicate').length,
  }), [previewRows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Import Data</DialogTitle>
          <DialogDescription>
            Review the data before importing. Showing mapped columns only.
            {hasMoreRows && (
              <span className="text-amber-600 font-medium">
                {' '}Displaying first {IMPORT_CONFIG.MAX_DISPLAYED_ROWS} of {previewRows.length} rows for performance.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Performance Warning for Large Datasets */}
        {hasMoreRows && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Large dataset detected</p>
              <p>Preview limited to {IMPORT_CONFIG.MAX_DISPLAYED_ROWS} rows for performance. All {previewRows.length} rows will be imported if you proceed.</p>
            </div>
          </div>
        )}

        {/* DEFENSIVE: Show error if no rows provided */}
        {previewRows.length === 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">No data to preview</p>
              <p>The CSV file appears to be empty or contains no valid data rows.</p>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {previewRows.length > 0 && (
        <>
        <div className="grid grid-cols-5 gap-4 py-4 border-b">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
            <div className="text-sm text-gray-600">Total Rows</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.willCreate}</div>
            <div className="text-sm text-gray-600">Will Create</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{summary.willMatch}</div>
            <div className="text-sm text-gray-600">Will Match</div>
          </div>
          {summary.duplicates > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{summary.duplicates}</div>
              <div className="text-sm text-gray-600">Duplicates</div>
            </div>
          )}
          {summary.errors > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{summary.errors}</div>
              <div className="text-sm text-gray-600">Errors</div>
            </div>
          )}
        </div>

        {/* Validation Messages */}
        {(hasErrors || hasWarnings) && (
          <div className="space-y-2 py-2 border-b">
            {hasErrors && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <X className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-medium">Errors found</p>
                  <p>Some rows have validation errors and cannot be imported.</p>
                </div>
              </div>
            )}
            {hasWarnings && !hasErrors && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Warnings detected</p>
                  <p>Some rows have warnings. Review before proceeding.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preview Table */}
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead className="w-32">Status</TableHead>
                {displayColumns.map(({ csvColumn, systemField }) => (
                  <TableHead key={systemField}>
                    <div className="text-xs text-gray-500">{csvColumn}</div>
                    <div className="font-medium">{systemField}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedRows.map((row) => {
                const rowHasError = row.validations.some(v => v.status === 'error');
                const rowHasWarning = row.validations.some(v => v.status === 'warning');

                return (
                  <TableRow
                    key={row.rowIndex}
                    className={rowHasError ? 'bg-red-50' : rowHasWarning ? 'bg-amber-50' : ''}
                  >
                    <TableCell className="font-medium">{row.rowIndex + 1}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {getStatusBadge(row.matchStatus)}
                        {row.matchedAthleteName && (
                          <div className="text-xs text-gray-600">
                            → {row.matchedAthleteName}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    {displayColumns.map(({ csvColumn, systemField }) => {
                      const value = row.data[csvColumn];
                      const validation = row.validations.find(v => v.field === systemField);

                      return (
                        <TableCell key={systemField}>
                          <div className="flex items-center gap-2">
                            {validation?.status === 'valid' && <Check className="h-4 w-4 text-green-600" />}
                            {validation?.status === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                            {validation?.status === 'error' && <X className="h-4 w-4 text-red-600" />}
                            <span className={validation?.status === 'error' ? 'text-red-600' : ''}>
                              {/* BUG FIX: Use nullish check to allow 0 and false as valid values */}
                              {value !== null && value !== undefined && value !== '' ? value : <span className="text-gray-400 italic">empty</span>}
                            </span>
                          </div>
                          {validation?.message && (
                            <div className="text-xs text-gray-600 mt-1">{validation.message}</div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={hasErrors || isLoading}
          >
            {isLoading ? 'Importing...' : `Import ${summary.total} Row${summary.total > 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
