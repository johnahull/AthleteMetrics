/**
 * BenchmarkFilter Component
 * Allows filtering analytics data by benchmark achievement status
 */

import React, { useState, useEffect } from 'react';
import { useOrganizationBenchmarks } from '@/lib/benchmarks-api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Target } from 'lucide-react';

export interface BenchmarkFilterProps {
  organizationId: string;
  value?: {
    benchmarkId: string;
    benchmarkName: string;
    status: 'met' | 'unmet' | 'no_data';
  };
  onChange: (filter: { benchmarkId: string; benchmarkName: string; status: 'met' | 'unmet' | 'no_data' } | undefined) => void;
}

export function BenchmarkFilter({ organizationId, value, onChange }: BenchmarkFilterProps) {
  const { data: benchmarks, isLoading, error } = useOrganizationBenchmarks(organizationId || '');

  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string | undefined>(value?.benchmarkId);
  const [selectedStatus, setSelectedStatus] = useState<'met' | 'unmet' | 'no_data' | undefined>(
    value?.status
  );

  // Sync internal state with prop changes
  useEffect(() => {
    setSelectedBenchmarkId(value?.benchmarkId);
    setSelectedStatus(value?.status);
  }, [value?.benchmarkId, value?.status]);

  const selectedBenchmark = benchmarks?.find((b) => b.benchmarkId === selectedBenchmarkId);

  const handleBenchmarkChange = (benchmarkId: string) => {
    if (benchmarkId === 'none') {
      // Clear selection
      setSelectedBenchmarkId(undefined);
      setSelectedStatus(undefined);
      onChange(undefined);
      return;
    }

    const benchmark = benchmarks?.find((b) => b.benchmarkId === benchmarkId);
    if (!benchmark) return;

    setSelectedBenchmarkId(benchmarkId);
    // Reset status when changing benchmarks
    setSelectedStatus(undefined);

    // If there was a previous filter, clear it (user needs to select status again)
    if (value) {
      onChange(undefined);
    }
  };

  const handleStatusChange = (status: 'met' | 'unmet' | 'no_data') => {
    if (!selectedBenchmark) return;

    // Don't trigger onChange if clicking already selected status
    if (selectedStatus === status) {
      return;
    }

    setSelectedStatus(status);
    onChange({
      benchmarkId: selectedBenchmark.benchmarkId,
      benchmarkName: selectedBenchmark.name,
      status,
    });
  };

  const handleClear = () => {
    setSelectedBenchmarkId(undefined);
    setSelectedStatus(undefined);
    onChange(undefined);
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Benchmark Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading benchmarks...</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Benchmark Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Failed to load benchmarks</p>
        </CardContent>
      </Card>
    );
  }

  // No benchmarks available
  if (!benchmarks || benchmarks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Benchmark Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No benchmarks available for this organization</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Benchmark Filter
            {value && (
              <Badge variant="secondary" className="ml-2">
                Active
              </Badge>
            )}
          </CardTitle>
          {value && (
            <Button variant="ghost" size="sm" onClick={handleClear} aria-label="Clear benchmark filter">
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Benchmark Selector */}
        <div className="space-y-2">
          <Label htmlFor="benchmark-select">Select Benchmark</Label>
          <Select
            value={selectedBenchmarkId || 'none'}
            onValueChange={handleBenchmarkChange}
          >
            <SelectTrigger id="benchmark-select" aria-label="Select benchmark">
              <SelectValue placeholder="Select benchmark..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select benchmark...</SelectItem>
              {benchmarks.map((benchmark) => (
                <SelectItem key={benchmark.id} value={benchmark.benchmarkId}>
                  {benchmark.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Active Filter Display */}
        {value && (
          <div className="p-3 bg-muted rounded-md">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">{value.benchmarkName}</p>
                <Badge variant={value.status === 'met' ? 'default' : value.status === 'unmet' ? 'destructive' : 'secondary'}>
                  {value.status === 'met' && 'Met'}
                  {value.status === 'unmet' && 'Unmet'}
                  {value.status === 'no_data' && 'No Data'}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Status Selector - Only show when benchmark is selected */}
        {selectedBenchmarkId && (
          <div className="space-y-2">
            <Label>Filter by Status</Label>
            <RadioGroup
              value={selectedStatus}
              onValueChange={(value) => handleStatusChange(value as 'met' | 'unmet' | 'no_data')}
              className="grid grid-cols-3 gap-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="met" id="status-met" aria-label="Met benchmark" />
                <Label htmlFor="status-met" className="cursor-pointer font-normal">
                  Met
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unmet" id="status-unmet" aria-label="Unmet benchmark" />
                <Label htmlFor="status-unmet" className="cursor-pointer font-normal">
                  Unmet
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no_data" id="status-no-data" aria-label="No data for benchmark" />
                <Label htmlFor="status-no-data" className="cursor-pointer font-normal">
                  No Data
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Helper text */}
        {selectedBenchmarkId && !selectedStatus && (
          <p className="text-xs text-muted-foreground">
            Select a status to filter athletes by their benchmark achievement
          </p>
        )}
      </CardContent>
    </Card>
  );
}
