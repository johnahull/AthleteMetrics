# Phase 7: Frontend Components Implementation Plan

## Overview
Phase 7 implements all React UI components for the benchmarks feature, following the existing component patterns in the codebase.

## Component Architecture (17 Components)

### Site Admin Components (Site-level benchmark catalog)
1. **BenchmarkList** - Display all site benchmarks with filters
2. **BenchmarkForm** - Create/edit site benchmark modal
3. **BenchmarkCard** - Individual benchmark display card
4. **BenchmarkDeleteDialog** - Confirmation dialog for deletion
5. **BenchmarkStatusToggle** - Switch for active/inactive status

### Org Admin Components (Custom benchmarks)
6. **CustomBenchmarkList** - Display org's custom benchmarks
7. **CustomBenchmarkForm** - Create/edit custom benchmark modal
8. **CustomBenchmarkCard** - Individual custom benchmark card
9. **CustomBenchmarkDeleteDialog** - Confirmation for custom deletion

### Benchmark Enablement Components (Org-level enablement)
10. **OrganizationBenchmarksList** - Display enabled benchmarks for org
11. **BenchmarkCatalog** - Browse and enable available benchmarks
12. **BenchmarkEnablementToggle** - Enable/disable benchmark for org
13. **BenchmarkFilters** - Filter benchmarks by metric, age, gender, etc.

### Athlete Evaluation Components (Performance tracking)
14. **AthleteBenchmarkStatus** - Display athlete's benchmark progress
15. **BenchmarkProgressBar** - Visual progress indicator
16. **BenchmarkBadge** - Met/unmet status badge
17. **BenchmarkComparison** - Compare athlete vs benchmark values

## Component Patterns to Follow

### From metrics-config Components
```typescript
// Location: packages/web/src/components/metrics-config/
- MetricsList.tsx - List all metrics
- MetricCard.tsx - Individual metric card
- MetricForm.tsx - Create/edit modal
- MetricDeleteDialog.tsx - Confirmation dialog
```

### Shadcn/UI Components to Use
- Dialog - For modals (create/edit/delete)
- Card - For benchmark cards
- Button - For actions
- Form + Input - For form fields
- Select - For dropdowns (metric, operator, etc.)
- Switch - For status toggles
- Badge - For status indicators
- Progress - For progress bars
- Table - For benchmark lists
- Tabs - For site vs custom benchmarks

### React Hook Form + Zod Pattern
```typescript
// All forms should use:
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSiteBenchmarkSchema } from "@shared/schema";

const form = useForm({
  resolver: zodResolver(insertSiteBenchmarkSchema),
  defaultValues: { ... }
});
```

## Implementation Strategy

### Phase 7A: Site Admin Components (Cycles 1-5)
**Goal:** Site admins can manage the global benchmark catalog

**Files to create:**
- `packages/web/src/components/benchmarks/BenchmarkList.tsx`
- `packages/web/src/components/benchmarks/BenchmarkForm.tsx`
- `packages/web/src/components/benchmarks/BenchmarkCard.tsx`
- `packages/web/src/components/benchmarks/BenchmarkDeleteDialog.tsx`
- `packages/web/src/components/benchmarks/index.ts`

**Features:**
- Fetch and display all site benchmarks
- Create new benchmark with form validation
- Edit existing benchmarks
- Toggle active/inactive status
- Delete benchmarks (with system default protection)
- Filter by metric, active status, age range

### Phase 7B: Custom Benchmark Components (Cycles 6-9)
**Goal:** Org admins can create organization-specific benchmarks

**Files to create:**
- `packages/web/src/components/benchmarks/CustomBenchmarkList.tsx`
- `packages/web/src/components/benchmarks/CustomBenchmarkForm.tsx`
- `packages/web/src/components/benchmarks/CustomBenchmarkCard.tsx`
- `packages/web/src/components/benchmarks/CustomBenchmarkDeleteDialog.tsx`

**Features:**
- Fetch and display custom benchmarks for org
- Create custom benchmarks (if allowed by org)
- Edit/delete custom benchmarks
- Permission checks (org admin only)

### Phase 7C: Enablement Components (Cycles 10-13)
**Goal:** Org admins can enable/disable benchmarks for their organization

**Files to create:**
- `packages/web/src/components/benchmarks/OrganizationBenchmarksList.tsx`
- `packages/web/src/components/benchmarks/BenchmarkCatalog.tsx`
- `packages/web/src/components/benchmarks/BenchmarkEnablementToggle.tsx`
- `packages/web/src/components/benchmarks/BenchmarkFilters.tsx`

**Features:**
- View all available benchmarks (site + custom)
- Enable benchmarks for organization
- Disable benchmarks for organization
- Filter by metric, category, age, gender, position, level

### Phase 7D: Athlete Evaluation Components (Cycles 14-17)
**Goal:** Display athlete benchmark status and progress

**Files to create:**
- `packages/web/src/components/benchmarks/AthleteBenchmarkStatus.tsx`
- `packages/web/src/components/benchmarks/BenchmarkProgressBar.tsx`
- `packages/web/src/components/benchmarks/BenchmarkBadge.tsx`
- `packages/web/src/components/benchmarks/BenchmarkComparison.tsx`

**Features:**
- Display all applicable benchmarks for athlete
- Show met/unmet status with badges
- Display progress percentage with progress bars
- Show athlete value vs benchmark value
- Filter benchmarks by met/unmet status

## Routing Integration

### New Routes to Add
```typescript
// packages/web/src/App.tsx or routes file

// Site Admin Routes
<Route path="/admin/benchmarks" element={<BenchmarkList />} />
<Route path="/admin/benchmarks/new" element={<BenchmarkForm />} />
<Route path="/admin/benchmarks/:id/edit" element={<BenchmarkForm />} />

// Org Admin Routes
<Route path="/org/:orgId/benchmarks" element={<OrganizationBenchmarksList />} />
<Route path="/org/:orgId/benchmarks/custom" element={<CustomBenchmarkList />} />
<Route path="/org/:orgId/benchmarks/catalog" element={<BenchmarkCatalog />} />

// Athlete Routes
<Route path="/athletes/:athleteId/benchmarks" element={<AthleteBenchmarkStatus />} />
```

## Navigation Integration

### Add to Site Admin Nav
```typescript
// packages/web/src/components/layout/AdminNav.tsx or similar
{
  label: "Benchmarks",
  href: "/admin/benchmarks",
  icon: Target,
}
```

### Add to Org Settings Nav
```typescript
// packages/web/src/components/settings/OrgSettingsNav.tsx or similar
{
  label: "Benchmarks",
  href: `/org/${orgId}/benchmarks`,
  icon: Target,
}
```

### Add to Athlete Profile Tabs
```typescript
// packages/web/src/pages/AthleteProfile.tsx or similar
<Tabs>
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="measurements">Measurements</TabsTrigger>
    <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
  </TabsList>
</Tabs>
```

## Testing Considerations

Each component should handle:
- Loading states (React Query `isLoading`)
- Error states (React Query `error`)
- Empty states (no data)
- Permission checks (site admin vs org admin)
- Form validation errors (Zod)
- Optimistic updates (React Query)

## Design System Consistency

All components must follow:
- Tailwind CSS classes (no custom CSS)
- Shadcn/UI components (no custom components unless necessary)
- Existing color scheme and spacing
- Mobile-responsive design
- Accessibility (ARIA labels, keyboard navigation)

## Example Component Structure

```typescript
// BenchmarkList.tsx
import { useSiteBenchmarks, useDeleteSiteBenchmark } from "@/lib/benchmarks-api";
import { BenchmarkCard } from "./BenchmarkCard";
import { BenchmarkForm } from "./BenchmarkForm";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function BenchmarkList() {
  const { data: benchmarks, isLoading, error } = useSiteBenchmarks(false);
  const [showForm, setShowForm] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!benchmarks?.length) return <EmptyState />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Site Benchmarks</h1>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Benchmark
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {benchmarks.map(benchmark => (
          <BenchmarkCard key={benchmark.id} benchmark={benchmark} />
        ))}
      </div>

      {showForm && (
        <BenchmarkForm
          open={showForm}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
```

## Progress Tracking

- [ ] Phase 7A: Site Admin Components (5 components)
- [ ] Phase 7B: Custom Benchmark Components (4 components)
- [ ] Phase 7C: Enablement Components (4 components)
- [ ] Phase 7D: Evaluation Components (4 components)
- [ ] Routing Integration
- [ ] Navigation Integration
- [ ] Testing & Polish

**Total:** 17 components + routing + nav = 19 tasks
