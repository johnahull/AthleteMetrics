import { Calendar, TrendingUp, User, Award } from 'lucide-react';
import { Link } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Measurement {
  id: string;
  athleteId: string;
  athleteName: string;
  metricType: string;
  metricName?: string;
  value: number;
  unit?: string;
  date: string;
  notes?: string;
  teamName?: string;
}

interface MeasurementsTimelineProps {
  measurements: Measurement[];
}

export function MeasurementsTimeline({ measurements }: MeasurementsTimelineProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatValue = (value: number, metricType: string) => {
    // Format based on metric type
    if (metricType.includes('TIME') || metricType.includes('DASH')) {
      return `${value.toFixed(2)}s`;
    }
    if (metricType.includes('JUMP') || metricType.includes('HEIGHT')) {
      return `${value.toFixed(1)}"`;
    }
    return value.toFixed(2);
  };

  const getMetricIcon = (metricType: string) => {
    if (metricType.includes('JUMP')) return TrendingUp;
    if (metricType.includes('DASH') || metricType.includes('TIME')) return Award;
    return Award;
  };

  const getMetricColor = (metricType: string) => {
    const colors: Record<string, string> = {
      'FLY10_TIME': 'bg-blue-100 text-blue-800',
      'VERTICAL_JUMP': 'bg-green-100 text-green-800',
      'AGILITY_505': 'bg-purple-100 text-purple-800',
      'AGILITY_5105': 'bg-purple-100 text-purple-800',
      'T_TEST': 'bg-orange-100 text-orange-800',
      'DASH_40YD': 'bg-red-100 text-red-800',
      'RSI': 'bg-yellow-100 text-yellow-800',
    };
    return colors[metricType] || 'bg-gray-100 text-gray-800';
  };

  if (measurements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No recent measurements</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Add measurements to track athlete performance
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="measurements-timeline"
      className="space-y-4 p-4"
    >
      {measurements.map((measurement, index) => {
        const Icon = getMetricIcon(measurement.metricType);
        const metricColor = getMetricColor(measurement.metricType);
        const formattedDate = formatDate(measurement.date);
        const formattedValue = formatValue(measurement.value, measurement.metricType);

        return (
          <Card
            key={measurement.id}
            data-testid="measurement-item"
            className="hover:shadow-md transition-shadow"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Link href={`/athletes/${measurement.athleteId}`}>
                      <span
                        data-testid="measurement-athlete"
                        className="text-primary hover:underline cursor-pointer truncate"
                      >
                        {measurement.athleteName}
                      </span>
                    </Link>
                  </CardTitle>
                  {measurement.teamName && (
                    <CardDescription className="mt-1 truncate">
                      {measurement.teamName}
                    </CardDescription>
                  )}
                </div>
                <Badge
                  data-testid="measurement-metric"
                  className={`${metricColor} flex-shrink-0 ml-2`}
                  variant="secondary"
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {measurement.metricName || measurement.metricType.replace(/_/g, ' ')}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Value */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Result:</span>
                <span
                  data-testid="measurement-value"
                  className="text-2xl font-bold text-foreground"
                >
                  {formattedValue}
                </span>
              </div>

              {/* Date */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{formattedDate}</span>
              </div>

              {/* Notes */}
              {measurement.notes && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground italic">
                    "{measurement.notes}"
                  </p>
                </div>
              )}

              {/* Divider for timeline effect */}
              {index < measurements.length - 1 && (
                <div className="border-b border-dashed pt-2" />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
