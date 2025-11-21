import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle } from 'lucide-react';

interface Alert {
  id: string;
  athleteId: string;
  athleteName: string;
  severity: 'high' | 'medium' | 'low';
  type: string;
  message: string;
  date: string;
}

interface AlertsCardProps {
  alerts: Alert[];
  onAlertClick?: (athleteId: string) => void;
  'data-testid'?: string;
}

/**
 * Card displaying wellness alerts for concerning patterns
 */
export function AlertsCard({ alerts, onAlertClick, 'data-testid': testId }: AlertsCardProps) {
  const severityConfig = {
    high: {
      icon: <AlertTriangle className="h-4 w-4" />,
      color: 'bg-red-100 text-red-800 border-red-200',
      badge: 'destructive' as const,
    },
    medium: {
      icon: <AlertCircle className="h-4 w-4" />,
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      badge: 'outline' as const,
    },
    low: {
      icon: <AlertCircle className="h-4 w-4" />,
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      badge: 'secondary' as const,
    },
  };

  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between" data-testid="card-title">
          <span>Alerts</span>
          {alerts.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p data-testid="no-alerts-message" className="text-sm text-gray-500">
            No concerning patterns detected
          </p>
        ) : (
          <div data-testid="alerts-list" className="space-y-2 max-h-48 overflow-y-auto">
            {alerts.map((alert) => (
              <button
                key={alert.id}
                data-testid={`alert-item-${alert.id}`}
                onClick={() => onAlertClick?.(alert.athleteId)}
                className={`w-full text-left p-2 rounded-lg border transition-colors hover:shadow-md ${severityConfig[alert.severity].color}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2 flex-1">
                    <div className="mt-0.5">
                      {severityConfig[alert.severity].icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{alert.athleteName}</p>
                      <p data-testid="alert-reason" className="text-xs mt-0.5 break-words">
                        {alert.message}
                      </p>
                      <p className="text-xs mt-1 opacity-75">
                        {new Date(alert.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    data-testid="alert-severity"
                    variant={severityConfig[alert.severity].badge}
                    className="ml-2 text-xs"
                  >
                    {alert.severity}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
