# Import Wizard Components

Multi-step wizard for generating CSV import templates with organization-specific metrics and team context.

## Overview

The Import Wizard guides coaches through creating customized CSV templates for importing athletes or measurements. It provides a clean, step-by-step interface that:

1. Selects import type (athletes or measurements)
2. Selects relevant teams
3. Selects metrics (for measurements only)
4. Generates and previews the template
5. Downloads the template for use

## Components

### ImportWizard (Main Component)

Main orchestrator component using `useReducer` for state management.

**Props:**
```tsx
interface ImportWizardProps {
  open: boolean;                           // Controls dialog visibility
  initialType?: 'athletes' | 'measurements'; // Optional pre-selected type
  onComplete: () => void;                  // Called when user downloads template
  onCancel: () => void;                    // Called when user cancels wizard
}
```

**Usage:**
```tsx
import { ImportWizard } from '@/components/import';
import { useState } from 'react';

function ImportPage() {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setWizardOpen(true)}>
        Generate Import Template
      </Button>

      <ImportWizard
        open={wizardOpen}
        onComplete={() => {
          setWizardOpen(false);
          // Template has been downloaded
        }}
        onCancel={() => setWizardOpen(false)}
      />
    </>
  );
}
```

### WizardStepIndicator

Visual progress indicator showing current step in the wizard flow.

**Features:**
- Desktop view: Full step circles with labels
- Mobile view: Compact text indicator
- Shows completed steps with checkmarks
- Highlights current step with ring

### SelectTypeStep

Step 1: Choose between athlete or measurement import.

**Features:**
- Card-based selection UI
- Icons and descriptions for each type
- Keyboard accessible (Enter/Space to select)

### SelectTeamStep

Step 2: Select one or more teams for template context.

**Features:**
- Fetches teams via `/api/teams`
- Multi-select with checkboxes
- Bulk actions: Select All, Clear All
- Shows selection count
- Handles loading and error states

### SelectMetricsStep

Step 3: Select metrics for measurement template (measurements only).

**Features:**
- Fetches org-enabled metrics via `useAvailableMetrics` hook
- Groups metrics by category (Speed, Power, Agility, Other)
- Pre-selects common metrics by default
- Bulk actions: Select Common, Select All, Clear All
- Shows "Common" badge for frequently used metrics
- Handles loading and error states

### PreviewTemplateStep

Step 4: Preview generated template and download.

**Features:**
- Calls `POST /api/import/templates/wizard` to generate template
- Shows CSV preview in scrollable area
- Toggle to include/exclude example rows
- Copy to clipboard functionality
- Download button
- Shows template metadata (teams, metrics, columns)
- Provides next-step instructions

## State Management

The wizard uses `useReducer` for centralized state management:

```tsx
interface ImportWizardState {
  currentStep: ImportWizardStep;      // Current wizard step
  importType: 'athletes' | 'measurements';
  selectedTeamIds: string[];          // Selected team IDs
  selectedMetricCodes: string[];      // Selected metric codes
  includeExamples: boolean;           // Include example rows
  generatedTemplate: string | null;   // Generated CSV content
  isLoading: boolean;                 // Loading state
}
```

## API Integration

### Endpoints Used

1. **GET /api/teams** - Fetch available teams
2. **GET /api/metrics/available** (via hook) - Fetch org-enabled metrics
3. **POST /api/import/templates/wizard** - Generate CSV template

**Template Request:**
```tsx
interface TemplateWizardRequest {
  type: 'athletes' | 'measurements';
  teamIds: string[];
  metricCodes?: string[];  // Only for measurements
  includeExamples?: boolean;
}
```

**Template Response:**
```tsx
interface TemplateWizardResponse {
  csvContent: string;
  headers: string[];
  teams: WizardTeamInfo[];
  enabledMetrics?: WizardMetricInfo[];
  exampleRows: Record<string, string>[];
}
```

## Workflow

### Athletes Import Flow

1. **Select Type** → Choose "Athletes"
2. **Select Teams** → Choose teams for context
3. **Preview Template** → Review and download

**Template includes:**
- firstName, lastName, birthDate, birthYear, graduationYear
- gender, emails, phoneNumbers, sports, position
- height, weight, school, teamName

### Measurements Import Flow

1. **Select Type** → Choose "Measurements"
2. **Select Teams** → Choose teams for context
3. **Select Metrics** → Choose performance metrics
4. **Preview Template** → Review and download

**Template includes:**
- firstName, lastName, teamName, date, age
- metric, value, units, flyInDistance, notes, gender

## Common Metrics

Pre-selected by default for measurements:
- FLY10_TIME (10-yard fly)
- VERTICAL_JUMP
- DASH_40YD (40-yard dash)
- AGILITY_505 (5-0-5 agility)
- TOP_SPEED

## Styling

All components use:
- shadcn/ui component library
- Tailwind CSS for styling
- Lucide icons
- Responsive design (desktop + mobile)

## Accessibility

- Keyboard navigation support
- ARIA labels and roles
- Focus management
- Screen reader friendly

## Error Handling

- API error states with user-friendly messages
- Empty state handling (no teams, no metrics)
- Loading states with spinners
- Toast notifications for user feedback

## Testing

To test the wizard:

1. Start dev server: `npm run dev`
2. Navigate to import page
3. Click "Generate Template" or similar trigger
4. Walk through wizard steps
5. Verify template downloads correctly

## Future Enhancements

Potential improvements:
- Save wizard state to localStorage
- Template preview with syntax highlighting
- Direct upload from preview step
- Template history/favorites
- Custom column mapping
- Multi-language support
