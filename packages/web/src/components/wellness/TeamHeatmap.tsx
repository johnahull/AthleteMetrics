import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface TeamHeatmapProps {
  responses: any[];
  filters: {
    dateFrom: string;
    dateTo: string;
    teamIds: string[];
  };
  organizationId: string;
}

/**
 * Heatmap visualization showing team wellness across dates
 * Rows = Athletes, Columns = Dates, Color = Wellness Score
 */
export function TeamHeatmap({ responses, filters }: TeamHeatmapProps) {
  const [selectedCell, setSelectedCell] = useState<{
    athleteId: string;
    athleteName: string;
    date: string;
    score: number;
    responses: any;
  } | null>(null);

  // Prepare heatmap data
  const heatmapData = useMemo(() => {
    if (!responses || responses.length === 0) return null;

    // Group responses by athlete and date
    const dataByAthleteAndDate: Record<string, Record<string, any>> = {};

    responses.forEach((response) => {
      if (!dataByAthleteAndDate[response.userId]) {
        dataByAthleteAndDate[response.userId] = {};
      }

      // Calculate average wellness score for this response
      const responseData = response.responses as any;
      const numericScores = Object.values(responseData)
        .filter((v: any) => typeof v.value === 'number')
        .map((v: any) => v.value as number);

      const avgScore =
        numericScores.length > 0
          ? numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length
          : 0;

      dataByAthleteAndDate[response.userId][response.date] = {
        score: avgScore,
        athleteName: response.userFullName,
        responses: response.responses,
      };
    });

    // Get all unique dates in range, sorted
    const allDates = Array.from(
      new Set(responses.map((r) => r.date))
    ).sort();

    // Get all unique athletes
    const athletes = Object.keys(dataByAthleteAndDate).map((userId) => {
      const firstResponse = Object.values(dataByAthleteAndDate[userId])[0];
      return {
        id: userId,
        name: firstResponse.athleteName,
      };
    });

    return {
      athletes,
      dates: allDates,
      data: dataByAthleteAndDate,
    };
  }, [responses]);

  // Get color for wellness score
  const getScoreColor = (score: number): string => {
    if (score === 0) return 'bg-gray-100'; // No data

    // Color scale from red (low) to yellow (medium) to green (high)
    if (score < 3) return 'bg-red-500';
    if (score < 5) return 'bg-orange-400';
    if (score < 7) return 'bg-yellow-400';
    if (score < 9) return 'bg-green-400';
    return 'bg-green-600';
  };

  const getScoreTextColor = (score: number): string => {
    return score >= 3 ? 'text-white' : 'text-gray-700';
  };

  if (!heatmapData || heatmapData.athletes.length === 0) {
    return (
      <div
        data-testid="heatmap-empty-state"
        className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"
      >
        <p className="text-gray-500">No wellness data available for heatmap</p>
      </div>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div className="mb-4 flex items-center justify-between" data-testid="heatmap-legend">
        <span className="text-sm font-medium text-gray-700">Wellness Score:</span>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-xs text-gray-600">Low (1-3)</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-4 h-4 bg-yellow-400 rounded"></div>
            <span className="text-xs text-gray-600">Medium (4-7)</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-4 h-4 bg-green-600 rounded"></div>
            <span className="text-xs text-gray-600">High (8-10)</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded"></div>
            <span className="text-xs text-gray-600">No data</span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid (scrollable) */}
      <div className="overflow-x-auto">
        <div data-testid="heatmap-grid" className="inline-block min-w-full">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white border border-gray-300 p-2 text-left text-xs font-medium text-gray-700">
                  Athlete
                </th>
                {heatmapData.dates.map((date) => (
                  <th
                    key={date}
                    className="border border-gray-300 p-2 text-xs font-medium text-gray-700 min-w-[80px]"
                  >
                    {new Date(date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapData.athletes.map((athlete) => (
                <tr key={athlete.id}>
                  <td className="sticky left-0 z-10 bg-white border border-gray-300 p-2 text-sm font-medium text-gray-900 min-w-[150px]">
                    {athlete.name}
                  </td>
                  {heatmapData.dates.map((date) => {
                    const cellData = heatmapData.data[athlete.id]?.[date];
                    const score = cellData?.score || 0;

                    return (
                      <td
                        key={`${athlete.id}-${date}`}
                        data-testid={`heatmap-cell-${athlete.id}-${date}`}
                        className={`border border-gray-300 p-0 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all ${
                          getScoreColor(score)
                        } ${getScoreTextColor(score)}`}
                        onClick={() => {
                          if (cellData) {
                            setSelectedCell({
                              athleteId: athlete.id,
                              athleteName: athlete.name,
                              date,
                              score: cellData.score,
                              responses: cellData.responses,
                            });
                          }
                        }}
                      >
                        <div className="flex items-center justify-center h-12 w-full">
                          {score > 0 ? (
                            <span className="text-sm font-medium">{score.toFixed(1)}</span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selectedCell} onOpenChange={() => setSelectedCell(null)}>
        <DialogContent data-testid="athlete-detail-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span data-testid="modal-athlete-name">{selectedCell?.athleteName}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCell(null)}
                data-testid="button-close-modal"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          {selectedCell && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Date</p>
                <p className="text-base font-medium">
                  {new Date(selectedCell.date).toLocaleDateString()}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600">Average Wellness Score</p>
                <p data-testid="modal-wellness-score" className="text-2xl font-bold text-gray-900">
                  {selectedCell.score.toFixed(1)} / 10
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Individual Responses:</p>
                <div className="space-y-2">
                  {Object.entries(selectedCell.responses).map(([questionId, data]: [string, any]) => (
                    <div key={questionId} className="p-2 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-900">{data.label}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {typeof data.value === 'number'
                          ? `${data.value} / 10`
                          : typeof data.value === 'boolean'
                          ? data.value
                            ? 'Yes'
                            : 'No'
                          : data.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
