/**
 * MeasurementHistoryTable Component
 *
 * Displays athlete measurement history in a sortable table format
 * with expandable rows for notes and verification status badges.
 * Supports edit/delete actions for unverified (self-entered) measurements.
 */

import React, { useState, useMemo, useCallback } from 'react';
import type { Measurement } from '@shared/schema';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { VerificationBadge } from './VerificationBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Download, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMetricDisplayName } from '@/constants/metrics';

export interface MeasurementHistoryTableProps {
  measurements: Measurement[];
  isLoading?: boolean;
  onExport?: () => void;
  /** Callback when edit is clicked for an unverified measurement */
  onEdit?: (measurement: Measurement) => void;
  /** Callback when delete is clicked for an unverified measurement */
  onDelete?: (measurement: Measurement) => void;
}

type SortField = 'date' | 'metric' | 'value';
type SortDirection = 'asc' | 'desc';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MeasurementHistoryTable({
  measurements,
  isLoading = false,
  onExport,
  onEdit,
  onDelete,
}: MeasurementHistoryTableProps) {
  const showActions = Boolean(onEdit || onDelete);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Sort measurements
  const sortedMeasurements = useMemo(() => {
    const sorted = [...measurements];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'metric':
          comparison = getMetricDisplayName(a.metric).localeCompare(
            getMetricDisplayName(b.metric)
          );
          break;
        case 'value':
          comparison = parseFloat(a.value) - parseFloat(b.value);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [measurements, sortField, sortDirection]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  const handleRowClick = useCallback((measurementId: string) => {
    setExpandedRowId(expandedRowId === measurementId ? null : measurementId);
  }, [expandedRowId]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="ml-1 h-4 w-4 inline-block" />
    ) : (
      <ChevronDown className="ml-1 h-4 w-4 inline-block" />
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {onExport && (
          <div className="flex justify-end">
            <Skeleton className="h-10 w-24" />
          </div>
        )}
        <Table aria-busy="true">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Status</TableHead>
              {showActions && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-20" />
                </TableCell>
                {showActions && (
                  <TableCell>
                    <Skeleton className="h-8 w-16" />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (measurements.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No measurements found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {onExport && (
        <div className="flex justify-end">
          <Button onClick={onExport} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="cursor-pointer hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              onClick={() => handleSort('date')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSort('date');
                }
              }}
              tabIndex={0}
              aria-sort={sortField === 'date' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              role="columnheader"
            >
              Date
              <SortIcon field="date" />
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              onClick={() => handleSort('metric')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSort('metric');
                }
              }}
              tabIndex={0}
              aria-sort={sortField === 'metric' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              role="columnheader"
            >
              Metric
              <SortIcon field="metric" />
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              onClick={() => handleSort('value')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSort('value');
                }
              }}
              tabIndex={0}
              aria-sort={sortField === 'value' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              role="columnheader"
            >
              Value
              <SortIcon field="value" />
            </TableHead>
            <TableHead>Status</TableHead>
            {showActions && <TableHead className="w-24">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedMeasurements.map((measurement) => {
            const isExpanded = expandedRowId === measurement.id;

            return (
              <React.Fragment key={measurement.id}>
                <TableRow
                  className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  onClick={() => handleRowClick(measurement.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(measurement.id);
                    }
                  }}
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`${getMetricDisplayName(measurement.metric)}: ${measurement.value} ${measurement.units}. Press Enter to ${isExpanded ? 'collapse' : 'expand'} notes.`}
                >
                  <TableCell>{formatDate(measurement.date)}</TableCell>
                  <TableCell>{getMetricDisplayName(measurement.metric)}</TableCell>
                  <TableCell>
                    {measurement.value} {measurement.units}
                  </TableCell>
                  <TableCell>
                    <VerificationBadge
                      isVerified={measurement.isVerified}
                      size="sm"
                    />
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      {/* Only show edit/delete for unverified (self-entered) measurements */}
                      {!measurement.isVerified ? (
                        <div className="flex items-center gap-1">
                          {onEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(measurement);
                              }}
                              aria-label={`Edit ${getMetricDisplayName(measurement.metric)} measurement`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(measurement);
                              }}
                              aria-label={`Delete ${getMetricDisplayName(measurement.metric)} measurement`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>

                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={showActions ? 5 : 4} className="bg-muted/30">
                      <div className="py-2 px-4">
                        <h4 className="font-semibold text-sm mb-1">Notes:</h4>
                        <p className="text-sm text-muted-foreground">
                          {measurement.notes || 'No notes'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
