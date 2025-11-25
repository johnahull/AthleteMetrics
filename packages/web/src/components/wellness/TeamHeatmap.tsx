import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { WellnessResponse, WellnessResponseData, HeatmapCellData, WellnessTemplate } from '@shared/wellness-types';
import { getTemplateScaleRange } from '@shared/wellness-constants';
import { calculateAthleteStatus, getDefaultStatusConfig } from '@shared/wellness-status-utils';

interface TeamHeatmapProps {
  responses: WellnessResponse[];
  template: WellnessTemplate; // Template for this set of responses
  filters: {
    dateFrom: string;
    dateTo: string;
    teamIds: string[];
  };
  organizationId: string;
}

interface HeatmapCell {
  score: number | null;
  status: 'red' | 'yellow' | 'green';
  athleteName: string;
  responses: WellnessResponseData;
}

/**
 * Heatmap visualization showing team wellness across dates
 * Rows = Athletes, Columns = Dates, Color = Wellness Score
 */
export function TeamHeatmap({ responses, template, filters }: TeamHeatmapProps) {
  const [selectedCell, setSelectedCell] = useState<HeatmapCellData | null>(null);

  // Extract scale range from template
  const scaleRange = useMemo(() => getTemplateScaleRange(template), [template]);

  // Get scale orientation from template
  const scaleOrientation = useMemo(() => {
    return template.config.statusConfig?.scaleOrientation || 'higher_is_better';
  }, [template]);

  // Get status thresholds from template config (same as calculateAthleteStatus uses)
  const statusThresholds = useMemo(() => {
    const config = getDefaultStatusConfig(template);
    return {
      redThreshold: template.config.statusConfig?.redThreshold ?? config.redThreshold,
      yellowThreshold: template.config.statusConfig?.yellowThreshold ?? config.yellowThreshold,
      calculationMethod: template.config.statusConfig?.calculationMethod ?? config.calculationMethod,
    };
  }, [template]);

  // Prepare heatmap data using template's score calculation method
  const heatmapData = useMemo(() => {
    if (!responses || responses.length === 0) return null;

    // Group responses by athlete and date
    const dataByAthleteAndDate: Record<string, Record<string, HeatmapCell>> = {};

    responses.forEach((response) => {
      if (!dataByAthleteAndDate[response.userId]) {
        dataByAthleteAndDate[response.userId] = {};
      }

      // Use calculateAthleteStatus to get score and status based on template config
      // This respects calculationMethod (average/sum), scaleOrientation, and thresholds
      const { score, status } = calculateAthleteStatus(response, template);

      dataByAthleteAndDate[response.userId][response.date] = {
        score,
        status,
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
  }, [responses, template]);

  // Get Tailwind CSS class for wellness status
  // Uses the pre-calculated status from calculateAthleteStatus which respects template config
  const getStatusTailwindClass = (status: 'red' | 'yellow' | 'green' | null): string => {
    switch (status) {
      case 'red':
        return 'bg-red-500';
      case 'yellow':
        return 'bg-yellow-400';
      case 'green':
        return 'bg-green-500';
      default:
        return 'bg-gray-100'; // No data
    }
  };

  // Get text color based on status background
  const getStatusTextColor = (status: 'red' | 'yellow' | 'green' | null): string => {
    if (status === 'yellow') return 'text-gray-900';
    if (status === 'red' || status === 'green') return 'text-white';
    return 'text-gray-400';
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
      {/* Legend - adapts to scale orientation and calculation method */}
      <div className="mb-4 flex items-center justify-between" data-testid="heatmap-legend">
        <span className="text-sm font-medium text-gray-700">
          Wellness {statusThresholds.calculationMethod === 'sum' ? 'Total' : 'Score'}:
        </span>
        <div className="flex items-center space-x-2">
          {scaleOrientation === 'lower_is_better' ? (
            // For lower_is_better: low scores = good (green), high scores = bad (red)
            <>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-xs text-gray-600">
                  Good (&lt;{statusThresholds.yellowThreshold})
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 bg-yellow-400 rounded"></div>
                <span className="text-xs text-gray-600">
                  Moderate ({statusThresholds.yellowThreshold}-{statusThresholds.redThreshold - 1})
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-xs text-gray-600">
                  Concerning (≥{statusThresholds.redThreshold})
                </span>
              </div>
            </>
          ) : (
            // For higher_is_better: low scores = bad (red), high scores = good (green)
            <>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-xs text-gray-600">
                  Low (≤{statusThresholds.redThreshold})
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 bg-yellow-400 rounded"></div>
                <span className="text-xs text-gray-600">
                  Medium ({statusThresholds.redThreshold + 1}-{statusThresholds.yellowThreshold})
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-xs text-gray-600">
                  Good (&gt;{statusThresholds.yellowThreshold})
                </span>
              </div>
            </>
          )}
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
                    const score = cellData?.score;
                    const status = cellData?.status || null;

                    return (
                      <td
                        key={`${athlete.id}-${date}`}
                        data-testid={`heatmap-cell-${athlete.id}-${date}`}
                        className={`border border-gray-300 p-0 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all ${
                          getStatusTailwindClass(status)
                        } ${getStatusTextColor(status)}`}
                        onClick={() => {
                          if (cellData) {
                            setSelectedCell({
                              athleteId: athlete.id,
                              athleteName: athlete.name,
                              date,
                              score: cellData.score,
                              responses: cellData.responses,
                              hasAlert: false,
                              alertSeverity: undefined,
                            });
                          }
                        }}
                      >
                        <div className="flex items-center justify-center h-12 w-full">
                          {score !== null && score !== undefined ? (
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
                <p className="text-sm text-gray-600">
                  {statusThresholds.calculationMethod === 'sum' ? 'Total' : 'Average'} Wellness Score
                </p>
                <p data-testid="modal-wellness-score" className="text-2xl font-bold text-gray-900">
                  {(selectedCell.score ?? 0).toFixed(1)}
                  {statusThresholds.calculationMethod !== 'sum' && ` / ${scaleRange?.max || 10}`}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Individual Responses:</p>
                <div className="space-y-2">
                  {Object.entries(selectedCell.responses as WellnessResponseData).map(
                    ([questionId, data]) => (
                      <div key={questionId} className="p-2 bg-gray-50 rounded-lg">
                        <p className="text-sm font-medium text-gray-900">{data.label}</p>
                        <div className="text-sm text-gray-600 mt-1">
                          {typeof data.value === 'number' ? (
                            `${data.value} / ${scaleRange?.max || 10}`
                          ) : typeof data.value === 'boolean' ? (
                            data.value ? 'Yes' : 'No'
                          ) : Array.isArray(data.value) ? (
                            // Body map injuries - array of {x, y, label?} objects
                            // Or multi-select multiple choice - array of strings
                            data.value.length === 0 ? (
                              <span className="text-green-600">None reported</span>
                            ) : (
                              <ul className="list-disc list-inside">
                                {data.value.map((item, idx) => {
                                  // String array (multiple choice)
                                  if (typeof item === 'string') {
                                    return <li key={idx}>{item}</li>;
                                  }
                                  // Body map object {x, y, label?}
                                  if (typeof item === 'object' && item !== null && 'x' in item && 'y' in item) {
                                    const bodyMapItem = item as { x: number; y: number; label?: string };
                                    return <li key={idx}>{bodyMapItem.label || 'Unmarked area'}</li>;
                                  }
                                  // Fallback
                                  return <li key={idx}>{String(item)}</li>;
                                })}
                              </ul>
                            )
                          ) : (
                            String(data.value)
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
