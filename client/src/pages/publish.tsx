import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { getMetricDisplayName, getMetricUnits, getMetricColor } from "@/lib/metrics";
import jsPDF from "jspdf";

export default function Publish() {
  const [filters, setFilters] = useState({
    teamIds: [] as string[],
    birthYearFrom: "",
    birthYearTo: "",
    metric: "",
    sport: "",
    date: "",
  });

  const { data: teams } = useQuery({
    queryKey: ["/api/teams"],
  });

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
      if (filters.date) params.append('date', filters.date);
      
      const response = await fetch(`/api/measurements?${params}`);
      return response.json();
    },
    enabled: !!filters.metric,
  });

  // Sort measurements from best to worst based on metric type
  const sortedMeasurements = measurements ? [...measurements].sort((a: any, b: any) => {
    const aValue = parseFloat(a.value);
    const bValue = parseFloat(b.value);
    
    // For time-based metrics, lower values are better
    const isTimeBased = ["FLY10_TIME", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD"].includes(filters.metric);
    
    if (isTimeBased) {
      return aValue - bValue; // ascending for time (lower is better)
    } else {
      return bValue - aValue; // descending for others (higher is better)
    }
  }) : [];

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
    if (filters.date) {
      pdf.text(`Date: ${new Date(filters.date).toLocaleDateString()}`, 20, yPos);
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
    pdf.text("Player", 40, yPos);
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
      
      const teamNames = measurement.player.teams && measurement.player.teams.length > 0 
        ? measurement.player.teams.map((team: any) => team.name).join(", ")
        : "Independent";
      
      pdf.text(`${index + 1}`, 20, yPos);
      pdf.text(measurement.player.fullName, 40, yPos);
      pdf.text(teamNames, 100, yPos);
      pdf.text(`${measurement.value}${getMetricUnits(filters.metric)}`, 140, yPos);
      pdf.text(new Date(measurement.date).toLocaleDateString(), 170, yPos);
      
      yPos += 12;
    });
    
    // Save the PDF
    const fileName = `${getMetricDisplayName(filters.metric)}_Results_${filters.date || new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Publish Results</h1>
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

      {/* Filters */}
      <Card className="bg-white">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
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

            {/* Date - Specific Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <Input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
                data-testid="input-date"
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
          </div>
        </CardContent>
      </Card>

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
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Player</th>
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
                          {measurement.player.fullName}
                        </div>
                        <p className="text-gray-500 text-xs">Birth Year: {measurement.player.birthYear}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {measurement.player.teams && measurement.player.teams.length > 0 
                          ? measurement.player.teams.map((team: any) => team.name).join(", ")
                          : "Independent Player"
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-600">{measurement.player.sport || "N/A"}</td>
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
    </div>
  );
}