import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUp, ArrowDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';

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
}

type SortField = 'questionLabel' | 'avgScore' | 'responseCount' | 'stdDev';
type SortDirection = 'asc' | 'desc';

export function QuestionAnalyticsTable({
  responses,
  responsesByTemplate,
}: QuestionAnalyticsTableProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('questionLabel');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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

        // Calculate trend (first half vs second half)
        const sortedByDate = [...templateResponses]
          .filter(r => r.responses[question.id] !== undefined && typeof r.responses[question.id].value === 'number')
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (sortedByDate.length >= 4) {
          const midpoint = Math.floor(sortedByDate.length / 2);
          const firstHalf = sortedByDate.slice(0, midpoint);
          const secondHalf = sortedByDate.slice(midpoint);

          const firstAvg = firstHalf.reduce((sum, r) => sum + (r.responses[question.id].value as number), 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((sum, r) => sum + (r.responses[question.id].value as number), 0) / secondHalf.length;

          const diff = secondAvg - firstAvg;
          if (diff > 0.5) trend = 'up';
          else if (diff < -0.5) trend = 'down';
        }

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
  }, [responses, responsesByTemplate, selectedTemplateId]);

  // Sort question stats
  const sortedStats = useMemo(() => {
    const sorted = [...questionStats].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'questionLabel':
          comparison = a.questionLabel.localeCompare(b.questionLabel);
          break;
        case 'avgScore':
          comparison = (a.avgScore || 0) - (b.avgScore || 0);
          break;
        case 'responseCount':
          comparison = a.responseCount - b.responseCount;
          break;
        case 'stdDev':
          comparison = (a.stdDev || 0) - (b.stdDev || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [questionStats, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ArrowUp className="inline w-4 h-4 ml-1" />
    ) : (
      <ArrowDown className="inline w-4 h-4 ml-1" />
    );
  };

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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('questionLabel')}
                >
                  Question <SortIcon field="questionLabel" />
                </TableHead>
                <TableHead>Type</TableHead>
                {templates.length > 1 && selectedTemplateId === 'all' && (
                  <TableHead>Template</TableHead>
                )}
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('avgScore')}
                >
                  Avg Score <SortIcon field="avgScore" />
                </TableHead>
                <TableHead>Min/Max</TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('stdDev')}
                >
                  Std Dev <SortIcon field="stdDev" />
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('responseCount')}
                >
                  Responses <SortIcon field="responseCount" />
                </TableHead>
                <TableHead>Trend</TableHead>
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
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">
                      {stat.questionType.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  {templates.length > 1 && selectedTemplateId === 'all' && (
                    <TableCell className="text-sm text-muted-foreground">
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
                  <TableCell>
                    {stat.min !== null && stat.max !== null ? (
                      <span className="text-sm text-muted-foreground">
                        {stat.min.toFixed(1)} - {stat.max.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {stat.stdDev !== null ? (
                      <span className="text-sm">{stat.stdDev.toFixed(2)}</span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{stat.responseCount}</span>
                  </TableCell>
                  <TableCell>
                    {stat.trend === 'up' && (
                      <div className="flex items-center text-green-600">
                        <TrendingUp className="w-4 h-4 mr-1" />
                        <span className="text-xs">Up</span>
                      </div>
                    )}
                    {stat.trend === 'down' && (
                      <div className="flex items-center text-red-600">
                        <TrendingDown className="w-4 h-4 mr-1" />
                        <span className="text-xs">Down</span>
                      </div>
                    )}
                    {stat.trend === 'stable' && (
                      <div className="flex items-center text-gray-600">
                        <Minus className="w-4 h-4 mr-1" />
                        <span className="text-xs">Stable</span>
                      </div>
                    )}
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
