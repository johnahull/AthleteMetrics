/**
 * Column Mapping Dialog for CSV Import
 * Allows users to map CSV columns to system fields
 */

import * as React from 'react';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Check } from 'lucide-react';
import type { ColumnMapping, CSVParseResult } from '@shared/import-types';

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parseResult: CSVParseResult | null;
  importType: 'athletes' | 'measurements';
  onConfirm: (mappings: Record<string, string>) => void;
}

export function ColumnMappingDialog({
  open,
  onOpenChange,
  parseResult,
  importType,
  onConfirm,
}: ColumnMappingDialogProps) {
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const systemFields = importType === 'athletes'
    ? [
        { value: 'firstName', label: 'First Name', required: true },
        { value: 'lastName', label: 'Last Name', required: true },
        { value: 'birthDate', label: 'Birth Date (YYYY-MM-DD)', required: false },
        { value: 'birthYear', label: 'Birth Year', required: false },
        { value: 'graduationYear', label: 'Graduation Year', required: false },
        { value: 'gender', label: 'Gender', required: false },
        { value: 'emails', label: 'Email(s)', required: false },
        { value: 'phoneNumbers', label: 'Phone Number(s)', required: false },
        { value: 'sports', label: 'Sport(s)', required: false },
        { value: 'height', label: 'Height (inches)', required: false },
        { value: 'weight', label: 'Weight (lbs)', required: false },
        { value: 'school', label: 'School', required: false },
        { value: 'teamName', label: 'Team Name', required: false },
      ]
    : [
        { value: 'firstName', label: 'First Name', required: true },
        { value: 'lastName', label: 'Last Name', required: true },
        { value: 'teamName', label: 'Team Name', required: true },
        { value: 'date', label: 'Date (YYYY-MM-DD)', required: true },
        { value: 'metric', label: 'Metric', required: true },
        { value: 'value', label: 'Value', required: true },
        { value: 'age', label: 'Age', required: false },
        { value: 'units', label: 'Units', required: false },
        { value: 'flyInDistance', label: 'Fly-In Distance', required: false },
        { value: 'notes', label: 'Notes', required: false },
        { value: 'gender', label: 'Gender', required: false },
      ];

  // Initialize mappings from suggested mappings when dialog opens
  // PERFORMANCE: Reset on dialog open to avoid infinite loop from unstable dependencies
  useEffect(() => {
    if (open && parseResult?.suggestedMappings) {
      const initialMappings: Record<string, string> = {};
      parseResult.suggestedMappings.forEach((mapping) => {
        initialMappings[mapping.csvColumn] = mapping.systemField;
      });
      setMappings(initialMappings);
    }
  }, [open, parseResult]);

  const handleMappingChange = (csvColumn: string, systemField: string) => {
    setMappings((prev) => ({
      ...prev,
      [csvColumn]: systemField === 'none' ? '' : systemField,
    }));
  };

  const getRequiredFields = () => {
    return systemFields.filter(f => f.required).map(f => f.value);
  };

  const getMissingRequiredFields = () => {
    const requiredFields = getRequiredFields();
    const mappedFields = Object.values(mappings).filter(Boolean);
    return requiredFields.filter(field => !mappedFields.includes(field));
  };

  const canConfirm = () => {
    return getMissingRequiredFields().length === 0;
  };

  const handleConfirm = () => {
    onConfirm(mappings);
  };

  const missingRequired = getMissingRequiredFields();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map CSV Columns to Fields</DialogTitle>
          <DialogDescription>
            Match your CSV columns to the expected system fields. Required fields are marked with an asterisk.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* DEFENSIVE: Show error if parseResult is missing */}
          {!parseResult && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Error: No CSV data available</p>
                <p>Please upload a valid CSV file to continue.</p>
              </div>
            </div>
          )}

          {missingRequired.length > 0 && parseResult && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Missing required fields:</p>
                <p>{missingRequired.map(f => systemFields.find(sf => sf.value === f)?.label).join(', ')}</p>
              </div>
            </div>
          )}

          {parseResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-sm font-medium text-gray-700 pb-2 border-b">
                <div className="col-span-5">CSV Column</div>
                <div className="col-span-1 text-center">→</div>
                <div className="col-span-6">System Field</div>
              </div>

              {parseResult.headers.map((header) => (
              <div key={header} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5">
                  <div className="text-sm font-medium text-gray-900 truncate" title={header}>
                    {header}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {parseResult.rows[0]?.[header] || 'N/A'}
                  </div>
                </div>

                <div className="col-span-1 text-center text-gray-400">
                  →
                </div>

                <div className="col-span-6">
                  <Select
                    value={mappings[header] || 'none'}
                    onValueChange={(value) => handleMappingChange(header, value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select field..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-gray-400">Don't import</span>
                      </SelectItem>
                      {systemFields.map((field) => {
                        const isAlreadyMapped = Object.entries(mappings).some(
                          ([col, val]) => col !== header && val === field.value
                        );
                        return (
                          <SelectItem
                            key={field.value}
                            value={field.value}
                            disabled={isAlreadyMapped}
                          >
                            <div className="flex items-center gap-2">
                              {field.label}
                              {field.required && <span className="text-red-500">*</span>}
                              {mappings[header] === field.value && (
                                <Check className="h-4 w-4 text-green-600" />
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm()}
          >
            Continue to Preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
