import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import DistributionChart from "@/components/charts/distribution-chart";
import ScatterChart from "@/components/charts/scatter-chart";

export default function Analytics() {
  const [filters, setFilters] = useState({
    teamIds: [],
    birthYearFrom: "2009",
    birthYearTo: "2009",
    metric: "",
    dateRange: "last30",
  });

  const { data: teams } = useQuery({
    queryKey: ["/api/teams"],
  });

  const { data: measurements } = useQuery({
    queryKey: ["/api/measurements", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.teamIds.length > 0) params.append('teamIds', filters.teamIds.join(','));
      if (filters.birthYearFrom) params.append('birthYearFrom', filters.birthYearFrom);
      if (filters.birthYearTo) params.append('birthYearTo', filters.birthYearTo);
      if (filters.metric) params.append('metric', filters.metric);
      
      // Add date filtering based on dateRange
      const now = new Date();
      if (filters.dateRange === "last7") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.append('dateFrom', weekAgo.toISOString().split('T')[0]);
      } else if (filters.dateRange === "last30") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        params.append('dateFrom', monthAgo.toISOString().split('T')[0]);
      } else if (filters.dateRange === "last90") {
        const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        params.append('dateFrom', quarterAgo.toISOString().split('T')[0]);
      }
      
      const response = await fetch(`/api/measurements?${params}`);
      if (!response.ok) throw new Error('Failed to fetch measurements');
      return response.json();
    },
  });

  const clearFilters = () => {
    setFilters({
      teamIds: [],
      birthYearFrom: "",
      birthYearTo: "",
      metric: "",
      dateRange: "last30",
    });
  };

  const fly10Data = measurements?.filter(m => m.metric === "FLY10_TIME").map(m => parseFloat(m.value)) || [];
  const verticalData = measurements?.filter(m => m.metric === "VERTICAL_JUMP").map(m => parseFloat(m.value)) || [];

  const calculatePercentiles = (data: number[]) => {
    if (data.length === 0) return { p25: 0, p50: 0, p75: 0, p90: 0 };
    
    const sorted = [...data].sort((a, b) => a - b);
    const getPercentile = (p: number) => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)];
    };

    return {
      p25: getPercentile(25),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p90: getPercentile(90),
    };
  };

  const fly10Percentiles = calculatePercentiles(fly10Data);
  const verticalPercentiles = calculatePercentiles(verticalData);

  const leaderboards = {
    fly10: measurements
      ?.filter(m => m.metric === "FLY10_TIME")
      .sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
      .slice(0, 3) || [],
    vertical: measurements
      ?.filter(m => m.metric === "VERTICAL_JUMP")
      .sort((a, b) => parseFloat(b.value) - parseFloat(a.value))
      .slice(0, 3) || [],
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Performance Analytics</h1>
        <Button className="bg-green-600 hover:bg-green-700">
          <Download className="h-4 w-4 mr-2" />
          Export Data
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="bg-white mb-6 sticky top-4 z-20">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Teams</label>
              <Select value={filters.teamIds[0] || ""} onValueChange={(value) => setFilters(prev => ({ ...prev, teamIds: value ? [value] : [] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Teams</SelectItem>
                  {teams?.map((team) => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Birth Year From</label>
              <Select value={filters.birthYearFrom} onValueChange={(value) => setFilters(prev => ({ ...prev, birthYearFrom: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  {Array.from({ length: 13 }, (_, i) => 2008 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Birth Year To</label>
              <Select value={filters.birthYearTo} onValueChange={(value) => setFilters(prev => ({ ...prev, birthYearTo: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  {Array.from({ length: 13 }, (_, i) => 2008 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Metric</label>
              <Select value={filters.metric} onValueChange={(value) => setFilters(prev => ({ ...prev, metric: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Metrics" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Metrics</SelectItem>
                  <SelectItem value="FLY10_TIME">Fly-10 Time</SelectItem>
                  <SelectItem value="VERTICAL_JUMP">Vertical Jump</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
              <Select value={filters.dateRange} onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last7">Last 7 days</SelectItem>
                  <SelectItem value="last30">Last 30 days</SelectItem>
                  <SelectItem value="last90">Last 90 days</SelectItem>
                  <SelectItem value="year">This year</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Applied filters:</span>
              <div className="flex space-x-2">
                {filters.teamIds.length > 0 && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    {filters.teamIds.length} Team{filters.teamIds.length > 1 ? 's' : ''}
                  </span>
                )}
                {filters.birthYearFrom && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    {filters.birthYearFrom === filters.birthYearTo ? filters.birthYearFrom : `${filters.birthYearFrom}-${filters.birthYearTo}`} Birth Year
                  </span>
                )}
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {filters.dateRange === "last30" ? "Last 30 days" : 
                   filters.dateRange === "last7" ? "Last 7 days" :
                   filters.dateRange === "last90" ? "Last 90 days" : "All time"}
                </span>
              </div>
            </div>
            <Button variant="ghost" onClick={clearFilters} className="text-gray-600 hover:text-gray-800">
              Clear all filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <DistributionChart data={fly10Data} title="Fly-10 Time Distribution" metric="FLY10_TIME" />
        <DistributionChart data={verticalData} title="Vertical Jump Distribution" metric="VERTICAL_JUMP" />
        <ScatterChart data={measurements || []} />
      </div>

      {/* Statistics Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Leaderboards */}
        <Card className="bg-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Leaderboards</h3>
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Fastest Fly-10 Times</h4>
                <div className="space-y-2">
                  {leaderboards.fly10.map((measurement, index) => (
                    <div key={measurement.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center space-x-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          index === 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium text-gray-900">{measurement.player.fullName}</p>
                          <p className="text-xs text-gray-500">{measurement.player.team.name}</p>
                        </div>
                      </div>
                      <span className="font-mono text-sm">{measurement.value}s</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Highest Vertical Jumps</h4>
                <div className="space-y-2">
                  {leaderboards.vertical.map((measurement, index) => (
                    <div key={measurement.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center space-x-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          index === 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium text-gray-900">{measurement.player.fullName}</p>
                          <p className="text-xs text-gray-500">{measurement.player.team.name}</p>
                        </div>
                      </div>
                      <span className="font-mono text-sm">{measurement.value}in</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Percentile Analysis */}
        <Card className="bg-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Percentile Analysis</h3>
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-4">Fly-10 Time Percentiles (seconds)</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">25th Percentile</span>
                    <span className="font-mono font-medium">{fly10Percentiles.p25.toFixed(2)}s</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">50th Percentile (Median)</span>
                    <span className="font-mono font-medium">{fly10Percentiles.p50.toFixed(2)}s</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">75th Percentile</span>
                    <span className="font-mono font-medium">{fly10Percentiles.p75.toFixed(2)}s</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-yellow-100 rounded-lg">
                    <span className="text-sm text-yellow-800 font-medium">90th Percentile</span>
                    <span className="font-mono font-medium text-yellow-800">{fly10Percentiles.p90.toFixed(2)}s</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-4">Vertical Jump Percentiles (inches)</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">25th Percentile</span>
                    <span className="font-mono font-medium">{verticalPercentiles.p25.toFixed(1)}in</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">50th Percentile (Median)</span>
                    <span className="font-mono font-medium">{verticalPercentiles.p50.toFixed(1)}in</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-600">75th Percentile</span>
                    <span className="font-mono font-medium">{verticalPercentiles.p75.toFixed(1)}in</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-yellow-100 rounded-lg">
                    <span className="text-sm text-yellow-800 font-medium">90th Percentile</span>
                    <span className="font-mono font-medium text-yellow-800">{verticalPercentiles.p90.toFixed(1)}in</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
