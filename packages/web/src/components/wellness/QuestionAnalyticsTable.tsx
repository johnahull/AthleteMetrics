import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';
import { calculateTrend } from '@/utils/wellness-analytics';
import { useSortableTable } from '@/hooks/use-sortable-table.tsx';
import { TrendIndicator } from './ui/WellnessUIComponents';

interface QuestionStats {
  questionId: string;
  questionLabel: string;
  questionType: string;
  avgScore: number | null;
  min: number | null;
  max: number | null;
  stdDev: number | null;
  responseCount: number;
  trend: 'up' | 'down' | 'stable';
  templateId: string;
  templateName: string;
}

interface QuestionAnalyticsTableProps {
  responses: WellnessResponse[];
  responsesByTemplate: Record<string, { template: WellnessTemplate; responses: WellnessResponse[] }>;
  scaleOrientation?: 'higher_is_better' | 'lower_is_better';
}

export function QuestionAnalyticsTable({
  responses,
  responsesByTemplate,
  scaleOrientation = 'higher_is_better',
}: QuestionAnalyticsTableProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('all');

  // Calculate question-level statistics
  const questionStats = useMemo(() => {
    if (!responses || responses.length === 0 || !responsesByTemplate) return [];

    const stats: QuestionStats[] = [];

    Object.entries(responsesByTemplate).forEach(([templateId, { template, responses: templateResponses }]) => {
      // Filter to selected template if not "all"
      if (selectedTemplateId !== 'all' && templateId !== selectedTemplateId) {
        return;
      }

      template.config.questions.forEach(question => {
        // Only calculate stats for scale questions (numeric values)
        if (question.type !== 'scale') {
          // For non-scale questions, just count responses
          const responseCount = templateResponses.filter(
            r => r.responses[question.id] !== undefined
          ).length;

          stats.push({
            questionId: question.id,
            questionLabel: question.label,
            questionType: question.type,
            avgScore: null,
            min: null,
            max: null,
            stdDev: null,
            responseCount,
            trend: 'stable',
            templateId,
            templateName: template.name,
          });
          return;
        }

        // Collect all numeric values for this question
        const values: number[] = [];
        templateResponses.forEach(response => {
          const responseData = response.responses[question.id];
          if (responseData && typeof responseData.value === 'number') {
            values.push(responseData.value);
          }
        });

        if (values.length === 0) {
          stats.push({
            questionId: question.id,
            questionLabel: question.label,
            questionType: question.type,
            avgScore: null,
            min: null,
            max: null,
            stdDev: null,
            responseCount: 0,
            trend: 'stable',
            templateId,
            templateName: template.name,
          });
          return;
        }

        // Calculate statistics
        const avgScore = values.reduce((sum, val) => sum + val, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        // Calculate standard deviation
        const variance = values.reduce((sum, val) => sum + Math.pow(val - avgScore, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        // Get scale range for this question
        const scaleMax = 'scaleMax' in question ? question.scaleMax : 10;

        // Calculate trend using shared utility
        // Filter responses to this specific question
        const questionResponses = templateResponses
          .map(r => ({
            ...r,
            responses: {
              [question.id]: r.responses[question.id]
            }
          }))
          .filter(r => r.responses[question.id] !== undefined && typeof r.responses[question.id].value === 'number');

        const trend = calculateTrend(questionResponses, scaleOrientation, scaleMax);

        stats.push({
          questionId: question.id,
          questionLabel: question.label,
          questionType: question.type,
          avgScore,
          min,
          max,
          stdDev,
          responseCount: values.length,
          trend,
          templateId,
          templateName: template.name,
        });
      });
    });

    return stats;
  }, [responses, responsesByTemplate, selectedTemplateId, scaleOrientation]);

  // Use sortable table hook
  const { sortedData: sortedStats, handleSort, SortIcon } = useSortableTable(questionStats, {
    defaultSortField: 'questionLabel',
    defaultSortDirection: 'asc',
  });

  const templates = Object.values(responsesByTemplate).map(rt => rt.template);

  if (questionStats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Question Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center py-8">No question data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Question Analytics</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Question-level statistics and trends ({sortedStats.length} questions)
            </p>
          </div>
          {templates.length > 1 && (
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Filter by template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Templates</SelectItem>
                {templates.map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 text-xs sm:text-sm"
                  onClick={() => handleSort('questionLabel')}
                >
                  Question <SortIcon field="questionLabel" />
                </TableHead>
                <TableHead className="hidden md:table-cell text-xs sm:text-sm">Type</TableHead>
                {templates.length > 1 && selectedTemplateId === 'all' && (
                  <TableHead className="hidden lg:table-cell">Template</TableHead>
                )}
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 text-xs sm:text-sm"
                  onClick={() => handleSort('avgScore')}
                >
                  Avg Score <SortIcon field="avgScore" />
                </TableHead>
                <TableHead className="hidden lg:table-cell">Min/Max</TableHead>
                <TableHead
                  className="hidden lg:table-cell cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('stdDev')}
                >
                  Std Dev <SortIcon field="stdDev" />
                </TableHead>
                <TableHead
                  className="hidden md:table-cell cursor-pointer hover:bg-muted/50 text-xs sm:text-sm"
                  onClick={() => handleSort('responseCount')}
                >
                  Responses <SortIcon field="responseCount" />
                </TableHead>
                <TableHead className="text-xs sm:text-sm">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStats.map(stat => (
                <TableRow key={`${stat.templateId}-${stat.questionId}`}>
                  <TableCell className="font-medium max-w-xs">
                    <div className="truncate" title={stat.questionLabel}>
                      {stat.questionLabel}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="text-xs capitalize">
                      {stat.questionType.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  {templates.length > 1 && selectedTemplateId === 'all' && (
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {stat.templateName}
                    </TableCell>
                  )}
                  <TableCell>
                    {stat.avgScore !== null ? (
                      <span className="font-semibold">{stat.avgScore.toFixed(1)}</span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {stat.min !== null && stat.max !== null ? (
                      <span className="text-sm text-muted-foreground">
                        {stat.min.toFixed(1)} - {stat.max.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {stat.stdDev !== null ? (
                      <span className="text-sm">{stat.stdDev.toFixed(2)}</span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="font-medium">{stat.responseCount}</span>
                  </TableCell>
                  <TableCell>
                    <TrendIndicator trend={stat.trend} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
