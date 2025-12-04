/**
 * My Measurements Add Page
 *
 * Self-entry page for athletes to log their own measurements.
 * These measurements are marked as unverified (not included in peer comparisons).
 */

import { useAuth } from '@/lib/auth';
import { useCreateSelfMeasurement } from '@/hooks/useAthleteMeasurements';
import { SelfEntryForm, SelfEntryData } from '@/components/athlete/SelfEntryForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Redirect, Link, useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

export default function MyMeasurementsAdd() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { mutate: createMeasurement, isPending } = useCreateSelfMeasurement();

  // Redirect if not logged in
  if (!authLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Redirect if not an athlete
  if (!authLoading && user && !user.athleteId) {
    return <Redirect to="/dashboard" />;
  }

  const handleSubmit = async (data: SelfEntryData) => {
    if (!user?.id) return;

    createMeasurement(
      {
        userId: user.id,
        metric: data.metric,
        value: data.value,
        date: data.date,
        notes: data.notes,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Measurement added',
            description: 'Your measurement has been successfully recorded.',
          });
          setLocation('/my-measurements');
        },
        onError: (error: Error) => {
          toast({
            title: 'Error',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleCancel = () => {
    setLocation('/my-measurements');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Back Link */}
      <Link href="/my-measurements" className="inline-flex items-center text-sm text-blue-600 hover:underline">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to My Measurements
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add Measurement</h1>
        <p className="text-gray-500 mt-1">
          Log a personal performance measurement
        </p>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle>Measurement Details</CardTitle>
        </CardHeader>
        <CardContent>
          <SelfEntryForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
