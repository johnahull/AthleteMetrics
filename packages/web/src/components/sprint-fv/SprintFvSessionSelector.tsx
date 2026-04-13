import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useEligibleSessions, useGenerateSprintFvProfile, type EligibleSession } from '@/lib/sprint-fv-api';
import { useLocation } from 'wouter';

interface Props {
  userId: string;
}

export function SprintFvSessionSelector({ userId }: Props) {
  const { data: sessions, isLoading, error } = useEligibleSessions(userId);
  const generateMutation = useGenerateSprintFvProfile();
  const [, navigate] = useLocation();
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [weightOverride, setWeightOverride] = useState<string>('');
  const [notes, setNotes] = useState('');

  const handleGenerate = async (session: EligibleSession) => {
    try {
      const profile = await generateMutation.mutateAsync({
        userId,
        date: session.date,
        eventId: session.eventId || undefined,
        bodyMassLbsOverride: !session.hasWeight && weightOverride
          ? parseFloat(weightOverride)
          : undefined,
        notes: notes || undefined,
      });
      navigate(`/sprint-fv/${profile.id}`);
    } catch {
      // Error handled by mutation state
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Finding eligible sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
        <p>Failed to load sessions: {error.message}</p>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No sprint sessions found. Record split times (DASH_5YD through DASH_30YD)
            to generate F-V profiles.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        const key = session.eventId || session.date;
        const isExpanded = expandedSession === key;
        const splitCount = session.availableSplits.length;

        return (
          <Card key={key} className={splitCount < 3 ? 'opacity-50' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{session.date}</span>
                    {session.eventName && (
                      <Badge variant="outline">{session.eventName}</Badge>
                    )}
                    <Badge variant={splitCount >= 4 ? 'default' : 'secondary'}>
                      {splitCount}/4 splits
                    </Badge>
                    {session.hasWeight && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {!session.hasWeight && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        No weight
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {session.availableSplits.join(', ')}
                  </p>
                  {session.duplicateSplits > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      Multiple trials detected — fastest time per split will be used
                    </p>
                  )}
                </div>

                <div>
                  {splitCount < 3 ? (
                    <span className="text-sm text-muted-foreground">Insufficient data</span>
                  ) : session.profileExists ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setExpandedSession(isExpanded ? null : key);
                        if (!isExpanded) { setWeightOverride(''); setNotes(''); }
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Regenerate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => {
                        setExpandedSession(isExpanded ? null : key);
                        if (!isExpanded) { setWeightOverride(''); setNotes(''); }
                      }}
                    >
                      Generate Profile
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  {!session.hasWeight && (
                    <div>
                      <Label htmlFor="weight-override">Body Weight (lbs) *</Label>
                      <Input
                        id="weight-override"
                        type="number"
                        step="1"
                        min="50"
                        max="500"
                        placeholder="Enter weight in lbs"
                        value={weightOverride}
                        onChange={(e) => setWeightOverride(e.target.value)}
                        className="mt-1 w-48"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Input
                      id="notes"
                      placeholder="Session notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    onClick={() => handleGenerate(session)}
                    disabled={generateMutation.isPending || (!session.hasWeight && !weightOverride)}
                  >
                    {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {session.profileExists ? 'Regenerate Profile' : 'Generate Profile'}
                  </Button>
                  {generateMutation.isError && (
                    <p className="text-sm text-red-600">{generateMutation.error.message}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
