/**
 * AthleteHomeHero Component
 *
 * Welcome banner for athlete home page with:
 * - Personalized welcome message
 * - Measurement streak tracking
 * - Last activity date
 * - Gradient hero background
 */

import React from 'react';
import { formatDistanceToNow } from 'date-fns';

interface AthleteHomeHeroProps {
  athlete: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
  };
  measurementCount: number;
  lastMeasurementDate: Date | null;
}

export function AthleteHomeHero({
  athlete,
  measurementCount,
  lastMeasurementDate,
}: AthleteHomeHeroProps) {
  // Only use first name if it's not empty
  const welcomeName = athlete.firstName?.trim() ? athlete.firstName : '';
  const measurementText = measurementCount === 1 ? 'measurement' : 'measurements';

  const formatLastActivity = () => {
    if (!lastMeasurementDate) {
      return 'Never';
    }

    try {
      const date = new Date(lastMeasurementDate);

      // Validate the date is actually valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }

      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  return (
    <div
      data-testid="athlete-home-hero"
      className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl p-5 sm:p-8 mb-6 shadow-lg"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 data-testid="welcome-message" className="text-2xl sm:text-3xl font-bold mb-2">
            Welcome back{welcomeName ? `, ${welcomeName}` : ''}!
          </h1>
          <p data-testid="streak-tracker" className="text-lg sm:text-xl text-blue-50">
            {measurementCount} {measurementText} this month 🔥
          </p>
          <p className="text-sm text-blue-100 mt-1">
            Every rep tracked. Every metric moves you toward your goal.
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 sm:px-6 py-3 sm:py-4">
          <p data-testid="last-activity" className="text-sm text-blue-50">
            Last measured: <span className="font-semibold">{formatLastActivity()}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
