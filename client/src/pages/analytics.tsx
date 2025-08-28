import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, Search } from "lucide-react";
import DistributionChart from "@/components/charts/distribution-chart";
import ScatterChart from "@/components/charts/scatter-chart";
import { getMetricDisplayName, getMetricUnits, getMetricColor } from "@/lib/metrics";

export default function Analytics() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState({
    teamIds: [] as string[],
    birthYearFrom: "2009",
    birthYearTo: "2009",
    ageFrom: "",
    ageTo: "",
    metric: "",
    dateRange: "last30",
    sport: "",
    search: "",
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
      if (filters.ageFrom) params.append('ageFrom', filters.ageFrom);
      if (filters.ageTo) params.append('ageTo', filters.ageTo);
      if (filters.metric) params.append('metric', filters.metric);
      if (filters.sport && filters.sport !== "all") params.append('sport', filters.sport);
      if (filters.search.trim()) params.append('search', filters.search.trim());
      
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
      teamIds: [] as string[],
      birthYearFrom: "",
      birthYearTo: "",
      ageFrom: "",
      ageTo: "",
      metric: "",
      dateRange: "last30",
      sport: "",
      search: "",
    });
  };

  const fly10Data = measurements?.filter((m: any) => m.metric === "FLY10_TIME").map((m: any) => parseFloat(m.value)) || [];
  const verticalData = measurements?.filter((m: any) => m.metric === "VERTICAL_JUMP").map((m: any) => parseFloat(m.value)) || [];

  const calculatePercentiles = (data: number[], metric: string) => {
    if (data.length === 0) return { p25: 0, p50: 0, p75: 0, p90: 0 };
    
    // For time-based metrics, lower values are better, so we need to reverse the percentile logic
    const isTimeBased = ["FLY10_TIME", "AGILITY_505", "AGILITY_5105", "T_TEST", "DASH_40YD"].includes(metric);
    const sorted = [...data].sort((a, b) => a - b);
    
    const getPercentile = (p: number) => {
      let index: number;
      if (isTimeBased) {
        // For time-based metrics, reverse the percentile calculation
        // 90th percentile = fastest times (best performance)
        index = Math.ceil(((100 - p) / 100) * sorted.length) - 1;
      } else {
        // For other metrics like vertical jump, higher values are better
        index = Math.ceil((p / 100) * sorted.length) - 1;
      }
      return sorted[Math.max(0, index)];
    };

    return {
      p25: getPercentile(25),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p90: getPercentile(90),
    };
  };

  const fly10Percentiles = calculatePercentiles(fly10Data, "FLY10_TIME");
  const verticalPercentiles = calculatePercentiles(verticalData, "VERTICAL_JUMP");

  const leaderboards = {
    fly10: measurements
      ?.filter((m: any) => m.metric === "FLY10_TIME")
      .sort((a: any, b: any) => parseFloat(a.value) - parseFloat(b.value))
      .slice(0, 3) || [],
    vertical: measurements
      ?.filter((m: any) => m.metric === "VERTICAL_JUMP")
      .sort((a: any, b: any) => parseFloat(b.value) - parseFloat(a.value))
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
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Players</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Search by player name..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-10"
                data-testid="input-search-players"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-8 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Teams</label>
              <Select value={filters.teamIds[0] || ""} onValueChange={(value) => setFilters(prev => ({ ...prev, teamIds: value ? [value] : [] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {(teams || []).map((team: any) => (
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
                  <SelectItem value="any">Any</SelectItem>
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
                  <SelectItem value="any">Any</SelectItem>
                  {Array.from({ length: 13 }, (_, i) => 2008 + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Age From</label>
              <Select value={filters.ageFrom || "any"} onValueChange={(value) => setFilters(prev => ({ ...prev, ageFrom: value === "any" ? "" : value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {Array.from({ length: 21 }, (_, i) => 10 + i).map(age => (
                    <SelectItem key={age} value={age.toString()}>{age}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Age To</label>
              <Select value={filters.ageTo || "any"} onValueChange={(value) => setFilters(prev => ({ ...prev, ageTo: value === "any" ? "" : value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {Array.from({ length: 21 }, (_, i) => 10 + i).map(age => (
                    <SelectItem key={age} value={age.toString()}>{age}</SelectItem>
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
                  <SelectItem value="all">All Metrics</SelectItem>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sport</label>
              <Select value={filters.sport} onValueChange={(value) => setFilters(prev => ({ ...prev, sport: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Sports" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sports</SelectItem>
                  <SelectItem value="Soccer">Soccer</SelectItem>
                  <SelectItem value="Track & Field">Track & Field</SelectItem>
                  <SelectItem value="Basketball">Basketball</SelectItem>
                  <SelectItem value="Football">Football</SelectItem>
                  <SelectItem value="Tennis">Tennis</SelectItem>
                  <SelectItem value="Baseball">Baseball</SelectItem>
                  <SelectItem value="Volleyball">Volleyball</SelectItem>
                  <SelectItem value="Cross Country">Cross Country</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
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
                {(filters.ageFrom || filters.ageTo) && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    {filters.ageFrom && filters.ageTo ? `Ages ${filters.ageFrom}-${filters.ageTo}` :
                     filters.ageFrom ? `Age ${filters.ageFrom}+` :
                     `Age ≤${filters.ageTo}`}
                  </span>
                )}
                {filters.sport && filters.sport !== "all" && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    {filters.sport}
                  </span>
                )}
                {filters.search && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    Search: "{filters.search}"
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
                  {leaderboards.fly10.map((measurement: any, index: number) => (
                    <div key={measurement.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center space-x-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          index === 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {index + 1}
                        </span>
                        <div>
                          <button 
                            onClick={() => setLocation(`/players/${measurement.player.id}`)}
                            className="font-medium text-gray-900 hover:text-primary cursor-pointer text-left"
                          >
                            {measurement.player.fullName}
                          </button>
                          <p className="text-xs text-gray-500">
                            {measurement.player.teams && measurement.player.teams.length > 0 
                              ? measurement.player.teams.map((team: any) => team.name).join(", ")
                              : "Independent Player"
                            }
                          </p>
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
                  {leaderboards.vertical.map((measurement: any, index: number) => (
                    <div key={measurement.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center space-x-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          index === 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {index + 1}
                        </span>
                        <div>
                          <button 
                            onClick={() => setLocation(`/players/${measurement.player.id}`)}
                            className="font-medium text-gray-900 hover:text-primary cursor-pointer text-left"
                          >
                            {measurement.player.fullName}
                          </button>
                          <p className="text-xs text-gray-500">
                            {measurement.player.teams && measurement.player.teams.length > 0 
                              ? measurement.player.teams.map((team: any) => team.name).join(", ")
                              : "Independent Player"
                            }
                          </p>
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

      {/* All Players Section */}
      <Card className="bg-white mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">All Players ({measurements?.length || 0} measurements)</h3>
          </div>
          
          {measurements && measurements.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-sm font-medium text-gray-500">
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Sport</th>
                    <th className="px-4 py-3">Metric</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Age</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {measurements.map((measurement: any, index: number) => (
                    <tr key={`${measurement.id}-${index}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                            <span className="text-white font-medium text-xs">
                              {measurement.player.fullName.split(' ').map((n: string) => n[0]).join('')}
                            </span>
                          </div>
                          <div>
                            <button 
                              onClick={() => setLocation(`/players/${measurement.player.id}`)}
                              className="font-medium text-gray-900 hover:text-primary cursor-pointer text-left"
                            >
                              {measurement.player.fullName}
                            </button>
                            <p className="text-gray-500 text-xs">Birth Year: {measurement.player.birthYear}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {measurement.player.teams && measurement.player.teams.length > 0 
                          ? measurement.player.teams.map((team: any) => team.name).join(", ")
                          : "Independent Player"
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-600">{measurement.player.sport || "N/A"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          getMetricColor(measurement.metric)
                        }`}>
                          {getMetricDisplayName(measurement.metric)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-900">
                        {measurement.value}{getMetricUnits(measurement.metric)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono">
                        {measurement.age}
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
