# Import Wizard Integration Guide

Quick guide for adding the Import Wizard to your pages.

## Basic Integration

### 1. Import the component

```tsx
import { ImportWizard } from '@/components/import';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
```

### 2. Add state management

```tsx
function YourPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardType, setWizardType] = useState<'athletes' | 'measurements'>('athletes');

  // ... rest of component
}
```

### 3. Add trigger button

```tsx
<Button onClick={() => {
  setWizardType('athletes');
  setWizardOpen(true);
}}>
  Generate Athlete Template
</Button>
```

### 4. Add wizard component

```tsx
<ImportWizard
  open={wizardOpen}
  initialType={wizardType}
  onComplete={() => {
    setWizardOpen(false);
    // Optional: Show success toast or tracking
  }}
  onCancel={() => {
    setWizardOpen(false);
  }}
/>
```

## Complete Example

```tsx
import React, { useState } from 'react';
import { ImportWizard } from '@/components/import';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet } from 'lucide-react';

export function ImportPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardType, setWizardType] = useState<'athletes' | 'measurements'>('athletes');

  const openWizard = (type: 'athletes' | 'measurements') => {
    setWizardType(type);
    setWizardOpen(true);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Import Data</h1>

      <div className="flex gap-4">
        <Button onClick={() => openWizard('athletes')}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Import Athletes
        </Button>

        <Button onClick={() => openWizard('measurements')}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Import Measurements
        </Button>
      </div>

      <ImportWizard
        open={wizardOpen}
        initialType={wizardType}
        onComplete={() => setWizardOpen(false)}
        onCancel={() => setWizardOpen(false)}
      />
    </div>
  );
}
```

## Integration with Existing Import Flow

If you have an existing import page, add the wizard as a "Generate Template" option:

```tsx
function ExistingImportPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  return (
    <div className="space-y-6">
      {/* Step 1: Generate Template */}
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Generate Template</CardTitle>
          <CardDescription>
            Create a customized CSV template for your import
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setWizardOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Open Template Wizard
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Upload CSV */}
      <Card>
        <CardHeader>
          <CardTitle>Step 2: Upload CSV</CardTitle>
          <CardDescription>
            Upload your filled template
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
          />
        </CardContent>
      </Card>

      {/* Wizard Dialog */}
      <ImportWizard
        open={wizardOpen}
        onComplete={() => setWizardOpen(false)}
        onCancel={() => setWizardOpen(false)}
      />
    </div>
  );
}
```

## Props Reference

### ImportWizard Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `open` | `boolean` | Yes | Controls dialog visibility |
| `initialType` | `'athletes' \| 'measurements'` | No | Pre-select import type |
| `onComplete` | `() => void` | Yes | Called when template downloaded |
| `onCancel` | `() => void` | Yes | Called when wizard cancelled |

## State Flow

```
User clicks trigger
  ↓
Wizard opens (open={true})
  ↓
User completes steps
  ↓
User downloads template
  ↓
onComplete() called
  ↓
Wizard closes (open={false})
```

## Customization

### Custom Trigger Styling

```tsx
<Button
  onClick={() => setWizardOpen(true)}
  variant="outline"
  size="lg"
  className="your-custom-classes"
>
  Your Custom Text
</Button>
```

### Pre-selecting Type

```tsx
// Always open with measurements
<ImportWizard
  open={wizardOpen}
  initialType="measurements"
  onComplete={() => setWizardOpen(false)}
  onCancel={() => setWizardOpen(false)}
/>
```

### Success Handling

```tsx
const handleComplete = () => {
  setWizardOpen(false);

  // Show success message
  toast({
    title: 'Template downloaded',
    description: 'Your CSV template is ready to use!',
  });

  // Track analytics
  trackEvent('template_generated', { type: wizardType });

  // Navigate to next step
  setCurrentStep('upload');
};
```

## Styling Notes

The wizard uses:
- shadcn/ui Dialog component (max-w-3xl)
- Scrollable content area (max-h-[90vh])
- Responsive design (mobile-first)
- Tailwind CSS utilities

To override dialog size:

```tsx
// Note: Currently not supported without modifying ImportWizard.tsx
// The dialog is set to max-w-3xl in the component
// Consider making this a prop if customization is needed
```

## Accessibility

The wizard includes:
- Keyboard navigation (Tab, Enter, Escape)
- ARIA labels
- Focus management
- Screen reader support

No additional configuration needed.

## Performance

The wizard:
- Lazy loads team and metric data
- Uses React Query for caching
- Minimal re-renders with useReducer
- Optimized bundle size (~52 KB)

## Troubleshooting

### Wizard doesn't open
- Check `open` prop is true
- Verify Dialog component is imported
- Check z-index conflicts

### Teams don't load
- Verify `/api/teams` endpoint is accessible
- Check authentication/authorization
- Review network tab for errors

### Metrics don't load
- Verify org has enabled metrics
- Check `useAvailableMetrics` hook
- Ensure user has org context

### Template download fails
- Verify `/api/import/templates/wizard` endpoint
- Check request payload format
- Review server logs for errors

## Support

For issues or questions:
1. Check the README.md for detailed documentation
2. Review ImportWizardExample.tsx for usage patterns
3. Check console for error messages
4. Verify API endpoints are working
