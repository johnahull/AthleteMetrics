/**
 * SelectTypeStep Component
 * Step 1: Choose between athlete or measurement import
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectTypeStepProps {
  onSelect: (type: 'athletes' | 'measurements') => void;
}

export function SelectTypeStep({ onSelect }: SelectTypeStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">What would you like to import?</h3>
        <p className="text-sm text-muted-foreground">
          Choose the type of data you want to import. We'll generate a CSV template tailored to your needs.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Athletes option */}
        <Card
          className={cn(
            'cursor-pointer transition-all hover:shadow-md hover:border-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
          onClick={() => onSelect('athletes')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect('athletes');
            }
          }}
          tabIndex={0}
          role="button"
          aria-label="Import athletes"
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-700 rounded-lg">
                <Users className="h-6 w-6" />
              </div>
              <CardTitle>Athletes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm">
              Import athlete profiles including names, contact info, team assignments, birth dates, and physical attributes.
            </CardDescription>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li>• Personal information</li>
              <li>• Team assignments</li>
              <li>• Contact details</li>
              <li>• Physical attributes</li>
            </ul>
          </CardContent>
        </Card>

        {/* Measurements option */}
        <Card
          className={cn(
            'cursor-pointer transition-all hover:shadow-md hover:border-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
          onClick={() => onSelect('measurements')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect('measurements');
            }
          }}
          tabIndex={0}
          role="button"
          aria-label="Import measurements"
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 text-green-700 rounded-lg">
                <Activity className="h-6 w-6" />
              </div>
              <CardTitle>Measurements</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm">
              Import performance measurements and test results for your athletes across various metrics.
            </CardDescription>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li>• Speed tests (10-yard fly, 40-yard dash)</li>
              <li>• Power metrics (vertical jump)</li>
              <li>• Agility tests (5-0-5, T-test)</li>
              <li>• Custom metrics</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
