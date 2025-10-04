import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { getMetricDisplayName, getMetricUnits, getMetricColor } from "@/lib/metrics";
import { Gender } from "@shared/schema";
import jsPDF from "jspdf";
import { useToast } from "@/hooks/use-toast";

export default function Publish() {
  const [filters, setFilters] = useState({
    teamIds: [] as string[],
    birthYearFrom: "",
    birthYearTo: "",
    metric: "",
    sport: "",
    dateFrom: "",
    dateTo: "",
    gender: "all",  // Default to show all genders, user can filter as needed
  });

  const [selectedMeasurements, setSelectedMeasurements] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: teams = [] } = useQuery({
    queryKey: ["/api/teams"],
  }) as { data: any[] };

  const { data: measurements } = useQuery({
    queryKey: ["/api/measurements", filters],
    queryFn: async () => {
      // Don't fetch if metric is not selected
      if (!filters.metric) return [];
      
      const params = new URLSearchParams();
      if (filters.teamIds.length > 0) params.append('teamIds', filters.teamIds.join(','));
      if (filters.birthYearFrom) params.append('birthYearFrom', filters.birthYearFrom);
      if (filters.birthYearTo) params.append('birthYearTo', filters.birthYearTo);
      if (filters.metric) params.append('metric', filters.metric);
      if (filters.sport && filters.sport !== "all") params.append('sport', filters.sport);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.gender && filters.gender !== "all") params.append('gender', filters.gender);
      
      const response = await fetch(`/api/measurements?${params}`, {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      return response.json();
    },
    enabled: !!filters.metric,
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (measurementIds: string[]) => {
      const response = await fetch('/api/measurements/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ measurementIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete measurements');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Measurements Deleted",
        description: data.message,
      });
      // Refresh measurements
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
      // Clear selection and close dialog
      setSelectedMeasurements(new Set());
      setDeleteDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get each athlete's best performance for the selected metric
  const bestMeasurements = measurements ? (() => {
    const athleteBest = new Map();
    const isTimeBased = ["FLY10_TIME", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD"].includes(filters.metric);
    
    measurements.forEach((measurement: any) => {
      const athleteId = measurement.user.id;
      const value = parseFloat(measurement.value);
      
      if (!athleteBest.has(athleteId)) {
        athleteBest.set(athleteId, measurement);
      } else {
        const current = athleteBest.get(athleteId);
        const currentValue = parseFloat(current.value);
        
        // For time-based metrics, lower is better; for others, higher is better
        const isBetter = isTimeBased ? value < currentValue : value > currentValue;
        
        if (isBetter) {
          athleteBest.set(athleteId, measurement);
        }
      }
    });
    
    // Convert to array and sort from best to worst
    return Array.from(athleteBest.values()).sort((a: any, b: any) => {
      const aValue = parseFloat(a.value);
      const bValue = parseFloat(b.value);
      
      if (isTimeBased) {
        return aValue - bValue; // ascending for time (lower is better)
      } else {
        return bValue - aValue; // descending for others (higher is better)
      }
    });
  })() : [];

  const sortedMeasurements = bestMeasurements;

  const resetFilters = () => {
    setFilters({
      teamIds: [],
      birthYearFrom: "",
      birthYearTo: "",
      metric: "",
      sport: "",
      dateFrom: "",
      dateTo: "",
      gender: "all",  // Keep default to show all genders
    });
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(sortedMeasurements.map((m: any) => m.id));
      setSelectedMeasurements(allIds);
    } else {
      setSelectedMeasurements(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedMeasurements);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedMeasurements(newSelected);
  };

  const isAllSelected = sortedMeasurements.length > 0 && selectedMeasurements.size === sortedMeasurements.length;
  const isSomeSelected = selectedMeasurements.size > 0 && selectedMeasurements.size < sortedMeasurements.length;

  const exportToPDF = () => {
    if (!sortedMeasurements || sortedMeasurements.length === 0) {
      alert("No data to export");
      return;
    }

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // Title
    pdf.setFontSize(16);
    pdf.text(`${getMetricDisplayName(filters.metric)} Results`, pageWidth / 2, 20, { align: "center" });
    
    // Date and filters info
    pdf.setFontSize(10);
    let yPos = 35;
    if (filters.dateFrom || filters.dateTo) {
      const dateRange = `Date Range: ${filters.dateFrom ? new Date(filters.dateFrom).toLocaleDateString() : 'Any'} - ${filters.dateTo ? new Date(filters.dateTo).toLocaleDateString() : 'Any'}`;
      pdf.text(dateRange, 20, yPos);
      yPos += 10;
    }
    if (filters.teamIds.length > 0) {
      const teamNames = teams?.filter((t: any) => filters.teamIds.includes(t.id)).map((t: any) => t.name).join(", ");
      pdf.text(`Teams: ${teamNames}`, 20, yPos);
      yPos += 10;
    }
    if (filters.birthYearFrom || filters.birthYearTo) {
      pdf.text(`Birth Years: ${filters.birthYearFrom || "Any"} - ${filters.birthYearTo || "Any"}`, 20, yPos);
      yPos += 10;
    }
    
    yPos += 10;
    
    // Table headers
    pdf.setFontSize(12);
    pdf.text("Rank", 20, yPos);
    pdf.text("Athlete", 40, yPos);
    pdf.text("Team(s)", 100, yPos);
    pdf.text("Value", 140, yPos);
    pdf.text("Date", 170, yPos);
    
    yPos += 15;
    
    // Table data
    pdf.setFontSize(10);
    sortedMeasurements.forEach((measurement: any, index: number) => {
      if (yPos > pageHeight - 20) {
        pdf.addPage();
        yPos = 30;
      }
      
      const teamNames = measurement.user.teams && measurement.user.teams.length > 0 
        ? measurement.user.teams.map((team: any) => team.name).join(", ")
        : "Independent";
      
      pdf.text(`${index + 1}`, 20, yPos);
      pdf.text(measurement.user.fullName, 40, yPos);
      pdf.text(teamNames, 100, yPos);
      pdf.text(`${measurement.value}${getMetricUnits(filters.metric)}`, 140, yPos);
      pdf.text(new Date(measurement.date).toLocaleDateString(), 170, yPos);
      
      yPos += 12;
    });
    
    // Save the PDF
    const dateStr = filters.dateFrom ? filters.dateFrom : new Date().toISOString().split('T')[0];
    const fileName = `${getMetricDisplayName(filters.metric)}_Results_${dateStr}.pdf`;
    pdf.save(fileName);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Publish Results</h1>
        <div className="flex items-center gap-3">
          <Button 
            onClick={resetFilters}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="reset-filters-button"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Filters
          </Button>
          <Button 
            onClick={exportToPDF}
            disabled={!sortedMeasurements || sortedMeasurements.length === 0}
            className="flex items-center gap-2"
            data-testid="export-pdf-button"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-white">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
            {/* Metric - Required */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Metric <span className="text-red-500">*</span>
              </label>
              <Select 
                value={filters.metric} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, metric: value }))}
              >
                <SelectTrigger data-testid="select-metric">
                  <SelectValue placeholder="Select metric..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLY10_TIME">Fly-10 Time</SelectItem>
                  <SelectItem value="VERTICAL_JUMP">Vertical Jump</SelectItem>
                  <SelectItem value="AGILITY_505">5-0-5 Agility Test</SelectItem>
                  <SelectItem value="AGILITY_5105">5-10-5 Agility Test</SelectItem>
                  <SelectItem value="T_TEST">T-Test</SelectItem>
                  <SelectItem value="DASH_40YD">40-Yard Dash</SelectItem>
                  <SelectItem value="RSI">Reactive Strength Index</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                data-testid="input-date-from"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                data-testid="input-date-to"
              />
            </div>

            {/* Team */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Team</label>
              <Select 
                value={filters.teamIds[0] || "all"} 
                onValueChange={(value) => setFilters(prev => ({ 
                  ...prev, 
                  teamIds: value === "all" ? [] : [value] 
                }))}
              >
                <SelectTrigger data-testid="select-team">
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams?.map((team: any) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Birth Year From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Birth Year From</label>
              <Input
                type="number"
                placeholder="2000"
                value={filters.birthYearFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, birthYearFrom: e.target.value }))}
                data-testid="input-birth-year-from"
              />
            </div>

            {/* Birth Year To */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Birth Year To</label>
              <Input
                type="number"
                placeholder="2010"
                value={filters.birthYearTo}
                onChange={(e) => setFilters(prev => ({ ...prev, birthYearTo: e.target.value }))}
                data-testid="input-birth-year-to"
              />
            </div>

            {/* Sport */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sport</label>
              <Select 
                value={filters.sport || "all"} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, sport: value }))}
              >
                <SelectTrigger data-testid="select-sport">
                  <SelectValue placeholder="All Sports" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sports</SelectItem>
                  <SelectItem value="Football">Football</SelectItem>
                  <SelectItem value="Basketball">Basketball</SelectItem>
                  <SelectItem value="Soccer">Soccer</SelectItem>
                  <SelectItem value="Baseball">Baseball</SelectItem>
                  <SelectItem value="Track">Track</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
              <Select 
                value={filters.gender || "all"} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, gender: value }))}
              >
                <SelectTrigger data-testid="select-gender" aria-label="Filter results by gender">
                  <SelectValue placeholder="All Genders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value={Gender.MALE}>{Gender.MALE}</SelectItem>
                  <SelectItem value={Gender.FEMALE}>{Gender.FEMALE}</SelectItem>
                  <SelectItem value={Gender.NOT_SPECIFIED}>{Gender.NOT_SPECIFIED}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Toolbar */}
      {selectedMeasurements.size > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-blue-900">
                  {selectedMeasurements.size} measurement{selectedMeasurements.size !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMeasurements(new Set())}
                  className="text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                >
                  Clear Selection
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Results {filters.metric ? `- ${getMetricDisplayName(filters.metric)}` : ""}
            </h3>
            {sortedMeasurements && (
              <span className="text-sm text-gray-500">
                {sortedMeasurements.length} result{sortedMeasurements.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {!filters.metric ? (
            <div className="text-center py-8 text-gray-500">
              <p>Please select a metric to view results.</p>
            </div>
          ) : sortedMeasurements && sortedMeasurements.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="text-left text-sm font-medium text-gray-500 border-b">
                    <th className="px-4 py-3 w-12">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all measurements"
                      />
                    </th>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Athlete</th>
                    <th className="px-4 py-3">Team(s)</th>
                    <th className="px-4 py-3">Sport</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {sortedMeasurements.map((measurement: any, index: number) => (
                    <tr key={`${measurement.id}-${index}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedMeasurements.has(measurement.id)}
                          onCheckedChange={(checked) => handleSelectOne(measurement.id, checked as boolean)}
                          aria-label={`Select measurement for ${measurement.user.fullName}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                            index === 0 ? 'bg-yellow-100 text-yellow-800' :
                            index === 1 ? 'bg-gray-100 text-gray-600' :
                            index === 2 ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-50 text-gray-500'
                          }`}>
                            {index + 1}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {measurement.user.fullName}
                        </div>
                        <p className="text-gray-500 text-xs">Birth Year: {measurement.user.birthYear}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {measurement.user.teams && measurement.user.teams.length > 0 
                          ? measurement.user.teams.map((team: any) => team.name).join(", ")
                          : "Independent Athlete"
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {measurement.user.sports && measurement.user.sports.length > 0
                          ? measurement.user.sports.join(", ")
                          : "N/A"
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-900">
                            {measurement.value}{getMetricUnits(filters.metric)}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getMetricColor(filters.metric)}`}>
                            {getMetricDisplayName(filters.metric)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(measurement.date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No measurements found matching the current filters.</p>
              <p className="text-sm mt-1">Try adjusting your filters to see more results.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete {selectedMeasurements.size} Measurement{selectedMeasurements.size !== 1 ? 's' : ''}?
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <p>This action cannot be undone. The following measurements will be permanently deleted:</p>

              <div className="bg-gray-50 rounded-md p-3 max-h-60 overflow-y-auto">
                <ul className="space-y-2 text-sm">
                  {sortedMeasurements
                    .filter((m: any) => selectedMeasurements.has(m.id))
                    .map((m: any) => (
                      <li key={m.id} className="flex items-center justify-between py-1 border-b border-gray-200 last:border-0">
                        <span className="font-medium text-gray-900">{m.user.fullName}</span>
                        <span className="text-gray-600">
                          {m.value}{getMetricUnits(filters.metric)} • {new Date(m.date).toLocaleDateString()}
                        </span>
                      </li>
                    ))
                  }
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                bulkDeleteMutation.mutate(Array.from(selectedMeasurements));
              }}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? 'Deleting...' : `Delete ${selectedMeasurements.size} Measurement${selectedMeasurements.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}