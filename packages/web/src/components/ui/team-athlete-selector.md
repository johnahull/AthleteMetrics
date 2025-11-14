# TeamAthleteSelector Component

A comprehensive two-panel selection component for choosing athletes either by team or individually, with advanced filtering and search capabilities.

## File Location

`/home/hulla/devel/AthleteMetrics/packages/web/src/components/ui/team-athlete-selector.tsx`

## Overview

The TeamAthleteSelector provides an intuitive interface for selecting multiple athletes from an organization. Users can:
- Select entire teams at once (all athletes in that team)
- Select individual athletes
- Search by athlete or team name
- Filter by position or gender
- View and manage selected athletes in a dedicated panel
- Use quick actions (Select All, Clear All)

## Props

```typescript
interface TeamAthleteSelectorProps {
  organizationId: string;           // The organization to fetch teams/athletes from
  selectedAthleteIds: string[];     // Currently selected athlete IDs
  onSelectionChange: (athleteIds: string[]) => void;  // Callback when selection changes
  className?: string;               // Optional CSS classes
}
```

## Features

### 1. Two-Panel Layout
- **Left Panel**: Team and athlete selection interface
- **Right Panel**: Currently selected athletes with remove capability

### 2. Team Selection
- Click a team checkbox to select/deselect all athletes in that team
- Visual indicators for:
  - Fully selected teams (all athletes selected)
  - Partially selected teams (some athletes selected)
  - Team athlete counts

### 3. Individual Athlete Selection
- Click athlete checkboxes to toggle individual selections
- Shows athlete details:
  - Full name
  - Team(s) they belong to
  - Positions (if available)

### 4. Search & Filtering
- **Search**: Live search by athlete name or team name
- **Position Filter**: Filter athletes by position (F, M, D, GK, etc.)
- **Gender Filter**: Filter athletes by gender (Male, Female, Not Specified)
- Filters work independently and combine

### 5. Quick Actions
- **Select All**: Selects all visible athletes (respecting current filters)
- **Clear All**: Removes all selections

### 6. Selected Athletes Panel
- Shows all currently selected athletes
- Quick remove button (appears on hover)
- Displays athlete name, team(s), and position(s)
- Scrollable for large selections
- Shows count badge

## Usage Example

```tsx
import { useState } from 'react';
import { TeamAthleteSelector } from '@/components/ui/team-athlete-selector';

function MyComponent() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const organizationId = 'your-org-id-here';

  return (
    <div>
      <h1>Select Athletes for Report</h1>
      <TeamAthleteSelector
        organizationId={organizationId}
        selectedAthleteIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
      <p>Selected: {selectedIds.length} athletes</p>
    </div>
  );
}
```

## Data Fetching

The component uses React Query to fetch data from the backend:

### Teams API
```
GET /api/teams?organizationId={organizationId}
```

Returns:
```typescript
interface Team {
  id: string;
  name: string;
  level?: string;  // "Club", "HS", "College"
  athleteCount?: number;
}
```

### Athletes API
```
GET /api/athletes?organizationId={organizationId}
```

Returns:
```typescript
interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  teams?: Array<{ id: string; name: string }>;
  positions?: string[];
  gender?: 'Male' | 'Female' | 'Not Specified';
}
```

## State Management

The component manages:
- **Search term**: Local state for search input
- **Position filter**: Local state for position dropdown
- **Gender filter**: Local state for gender dropdown
- **Selected athletes**: Passed via props (controlled component)

Selection state is controlled by the parent component via `selectedAthleteIds` and `onSelectionChange`.

## Styling

Built with:
- **shadcn/ui**: Card, Button, Checkbox, Input, Badge, ScrollArea, Select
- **Tailwind CSS**: Utility classes for layout and styling
- **lucide-react**: Icons (Search, Users, User, X)

Responsive breakpoints:
- Mobile: Single column layout
- Desktop (lg): Two-column layout

## Responsive Behavior

### Mobile (< 1024px)
- Panels stack vertically
- Full-width cards
- Touch-friendly tap targets

### Desktop (>= 1024px)
- Two-column grid layout
- Side-by-side panels
- Hover states for better UX

## Accessibility

- Semantic HTML with proper labels
- Keyboard navigation support (checkboxes, buttons)
- ARIA attributes where needed
- Focus indicators on interactive elements
- Screen reader friendly

## Performance Optimizations

- React Query caching (teams and athletes are cached)
- useMemo for expensive computations:
  - Available positions list
  - Available genders list
  - Filtered athletes
  - Athletes by team mapping
  - Selected athletes list
- Efficient array operations (Set for uniqueness)

## Edge Cases Handled

1. **No athletes**: Shows "No athletes available" message
2. **No search results**: Shows "No athletes found matching filters"
3. **Empty organization**: Handles gracefully with empty states
4. **Athletes without teams**: Shows "No team" label
5. **Athletes with multiple teams**: Shows all teams, comma-separated
6. **Loading states**: Shows "Loading..." while fetching data
7. **Partial team selection**: Visual indicator when some (not all) team athletes are selected

## Testing

### Manual Testing Checklist

Test page: `/component-test/team-selector`

- [ ] Select entire team (verify all athletes added)
- [ ] Deselect entire team (verify all athletes removed)
- [ ] Select individual athletes
- [ ] Remove athletes from selection panel
- [ ] Search by athlete name
- [ ] Search by team name
- [ ] Filter by position
- [ ] Filter by gender
- [ ] Combine search and filters
- [ ] Select All button
- [ ] Clear All button
- [ ] Partial team selection indicator
- [ ] Responsive layout (mobile/tablet/desktop)
- [ ] Loading states
- [ ] Empty states

### Visual Preview

For a static visual preview without backend:
```
/home/hulla/devel/AthleteMetrics/packages/web/src/pages/component-test-team-selector-standalone.html
```

Open this HTML file in a browser to see the component layout and styling.

## Integration Points

### Common Use Cases

1. **Report Generation**: Select athletes for individual performance reports
2. **Bulk Operations**: Select athletes for batch updates
3. **Group Analytics**: Select subset of athletes for comparison
4. **Team Management**: Assign athletes to events or sessions
5. **Communication**: Select recipients for notifications

### Example: Report Wizard Integration

```tsx
import { TeamAthleteSelector } from '@/components/ui/team-athlete-selector';
import { useAuth } from '@/lib/auth';

function ReportWizard() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);

  return (
    <div>
      {step === 1 && (
        <>
          <h2>Step 1: Select Athletes</h2>
          <TeamAthleteSelector
            organizationId={user.primaryOrganizationId}
            selectedAthleteIds={selectedAthletes}
            onSelectionChange={setSelectedAthletes}
          />
          <Button
            onClick={() => setStep(2)}
            disabled={selectedAthletes.length === 0}
          >
            Next: Choose Report Type
          </Button>
        </>
      )}
    </div>
  );
}
```

## Future Enhancements

Potential improvements:
- [ ] Multi-select via Shift+Click
- [ ] Drag-and-drop to reorder selected athletes
- [ ] Save/load selection presets
- [ ] Export selection as CSV
- [ ] Advanced filters (age range, graduation year, etc.)
- [ ] Bulk tag/categorize selections
- [ ] Recent selections history
- [ ] Selection templates (e.g., "Varsity Only", "Seniors")

## Dependencies

```json
{
  "@tanstack/react-query": "^5.x",
  "lucide-react": "latest",
  "react": "^18.x"
}
```

Plus shadcn/ui components:
- Button
- Card
- Checkbox
- Input
- Badge
- ScrollArea
- Select

## Related Components

- `AthleteSelector` - Single athlete selection dropdown
- `GroupSelector` - Team/organization selection
- `TimeframeSelector` - Date range selection

## Support

For issues or questions about this component:
1. Check the test page at `/component-test/team-selector`
2. Review the standalone HTML preview
3. Ensure `organizationId` is valid and user has access
4. Check network tab for API errors
5. Verify React Query is properly configured
