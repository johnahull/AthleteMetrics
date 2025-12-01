/**
 * AthleteLayout Component
 *
 * Shared layout wrapper for athlete Profile and Dashboard pages.
 * Provides:
 * - Athlete sidebar navigation
 * - Add Measurement modal
 * - Consistent layout structure
 *
 * Works for both athlete self-view and coach view of athletes.
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAthleteContext } from '@/hooks/useAthleteContext';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { AthleteSidebar } from '../navigation/AthleteSidebar';
import AthleteMeasurementForm from '@/components/athlete-measurement-form';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface AthleteLayoutProps {
  children: React.ReactNode;
  /** Override athleteId (useful for coach view) */
  athleteId?: string;
  /** Override isOwnProfile */
  isOwnProfile?: boolean;
}

export function AthleteLayout({
  children,
  athleteId: propAthleteId,
  isOwnProfile: propIsOwnProfile,
}: AthleteLayoutProps) {
  const context = useAthleteContext();
  const queryClient = useQueryClient();

  // Use props if provided, otherwise use context
  const athleteId = propAthleteId || context.athleteId;
  const isOwnProfile = propIsOwnProfile ?? context.isOwnProfile;
  const canEdit = context.canEdit;

  // Fetch athlete profile to get the name for the measurement form
  const { data: athlete } = useAthleteProfile(athleteId);
  const athleteName = athlete?.fullName || athlete?.firstName || 'Athlete';

  // State for Add Measurement dialog
  const [showAddMeasurement, setShowAddMeasurement] = useState(false);

  // Handle successful measurement addition
  const handleMeasurementSuccess = () => {
    setShowAddMeasurement(false);
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['/api/measurements', { athleteId }] });
    queryClient.invalidateQueries({ queryKey: ['athlete', athleteId, 'profile'] });
  };

  // If no athlete ID, show error state
  if (!athleteId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Athlete Not Found
          </h2>
          <p className="text-gray-600">
            Unable to determine which athlete to display.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar Navigation */}
      <AthleteSidebar
        athleteId={athleteId}
        isOwnProfile={isOwnProfile}
        canAddMeasurement={canEdit}
        onAddMeasurement={() => setShowAddMeasurement(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>

      {/* Add Measurement Dialog */}
      <Dialog open={showAddMeasurement} onOpenChange={setShowAddMeasurement}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Add Measurement for {athleteName}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAddMeasurement(false)}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogHeader>
          <AthleteMeasurementForm
            athleteId={athleteId}
            athleteName={athleteName}
            onSuccess={handleMeasurementSuccess}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AthleteLayout;
