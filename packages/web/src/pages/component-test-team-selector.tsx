import { useState } from 'react';
import { TeamAthleteSelector } from '@/components/ui/team-athlete-selector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TeamAthleteSelectorTest() {
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);

  // You'll need to replace this with an actual organization ID from your database
  // For testing, you can hardcode an organization ID or get it from the session
  const organizationId = '00000000-0000-0000-0000-000000000001'; // Replace with actual org ID

  return (
    <div className="container mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">TeamAthleteSelector Component Test</h1>
        <p className="text-muted-foreground">
          Test the team-based athlete selection component with live data
        </p>
      </div>

      {/* Component Under Test */}
      <TeamAthleteSelector
        organizationId={organizationId}
        selectedAthleteIds={selectedAthleteIds}
        onSelectionChange={setSelectedAthleteIds}
      />

      {/* Debug Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Debug Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">Organization ID:</span>
              <Badge variant="outline">{organizationId}</Badge>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">Selected Count:</span>
              <Badge>{selectedAthleteIds.length}</Badge>
            </div>
          </div>

          {selectedAthleteIds.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Selected Athlete IDs:</h4>
              <div className="bg-muted p-3 rounded-md">
                <code className="text-xs">
                  {JSON.stringify(selectedAthleteIds, null, 2)}
                </code>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Example */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Usage Example</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs">
{`import { TeamAthleteSelector } from '@/components/ui/team-athlete-selector';
import { useState } from 'react';

function MyComponent() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  return (
    <TeamAthleteSelector
      organizationId="your-org-id"
      selectedAthleteIds={selectedIds}
      onSelectionChange={setSelectedIds}
    />
  );
}`}
          </pre>
        </CardContent>
      </Card>

      {/* Feature Testing Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feature Testing Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Select entire team (all athletes should be added)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Deselect entire team (all team athletes should be removed)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Select individual athletes</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Remove individual athletes from selection panel</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Search by athlete name</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Search by team name</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Filter by position</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Filter by gender</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Select All (filtered athletes)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Clear All</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Partial team selection indicator (checkbox state)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground">□</span>
              <span>Responsive layout (desktop/tablet/mobile)</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
