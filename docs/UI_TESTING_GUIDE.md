# UI Testing Guide with Playwright MCP

Complete guide to visual and E2E testing in AthleteMetrics using Playwright MCP integration.

## Quick Start

### Test a Page Visually

```
You: "Test the athlete profile page for responsive design and accessibility"

visual-design-review-agent will:
1. Navigate to the page
2. Test desktop/tablet/mobile layouts
3. Check accessibility (WCAG 2.1 AA)
4. Verify interactive states
5. Generate report with screenshots
```

### Write E2E Tests

```
You: "Write E2E tests for athlete measurement entry flow"

ui-testing-agent will:
1. Create test file
2. Write user flow test
3. Add assertions
4. Include screenshot verification
5. Check console errors
```

### Build UI with Visual Feedback

```
You: "Build athlete card component with visual testing"

ui-development-agent will:
1. Create component
2. Test in browser immediately
3. Screenshot all viewports
4. Test interactions
5. Iterate based on feedback
```

## Available Agents

### 1. ui-testing-agent
**Purpose:** E2E testing with Playwright MCP
**Use for:** Complete user flows, integration testing, visual regression

**Example:**
```
"Write E2E test for CSV import workflow"
```

### 2. visual-design-review-agent
**Purpose:** Automated design review
**Use for:** UI/UX quality assurance, accessibility audits, responsive checks

**Example:**
```
"Review dashboard for accessibility and responsive design"
```

### 3. ui-development-agent
**Purpose:** Build UI with live visual testing
**Use for:** Component development, rapid iteration, visual debugging

**Example:**
```
"Build team selector dropdown with visual testing"
```

## Playwright MCP Tools Reference

### Navigation
- `browser_navigate(url)` - Go to URL
- `browser_navigate_back()` - Go back
- `browser_snapshot()` - Get page structure

### Interaction
- `browser_click(element, ref)` - Click element
- `browser_type(element, ref, text)` - Type text
- `browser_fill_form(fields)` - Fill multiple fields
- `browser_press_key(key)` - Press key
- `browser_hover(element, ref)` - Hover

### Verification
- `browser_take_screenshot(filename?)` - Capture screenshot
- `browser_console_messages(onlyErrors?)` - Get console logs
- `browser_evaluate(function)` - Run JavaScript
- `browser_wait_for(text/time)` - Wait for condition

### Advanced
- `browser_resize(width, height)` - Change viewport
- `browser_tabs(action)` - Manage tabs
- `browser_select_option(element, ref, values)` - Select dropdown

## Testing Patterns

### Pattern 1: E2E User Flow

```typescript
describe('E2E: Add Measurement', () => {
  it('should complete full measurement entry flow', async () => {
    // Navigate
    await mcp__playwright__browser_navigate({
      url: 'http://localhost:5000/measurements'
    });

    // Interact
    await mcp__playwright__browser_click({
      element: 'Add button',
      ref: 'button:has-text("Add Measurement")'
    });

    // Fill form
    await mcp__playwright__browser_fill_form({
      fields: [
        { name: 'athlete', type: 'combobox', ref: 'select[name="athleteId"]', value: 'athlete-1' },
        { name: 'metric', type: 'combobox', ref: 'select[name="metric"]', value: 'VERTICAL_JUMP' },
        { name: 'value', type: 'textbox', ref: 'input[name="value"]', value: '28.5' }
      ]
    });

    // Submit
    await mcp__playwright__browser_click({
      element: 'Save button',
      ref: 'button:has-text("Save")'
    });

    // Verify
    await mcp__playwright__browser_wait_for({
      text: 'Measurement created',
      time: 3000
    });

    // Screenshot
    await mcp__playwright__browser_take_screenshot({
      filename: 'measurement-created.png'
    });

    // Check console
    const errors = await mcp__playwright__browser_console_messages({
      onlyErrors: true
    });
    expect(errors).toHaveLength(0);
  });
});
```

### Pattern 2: Responsive Testing

```typescript
const viewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 }
];

for (const viewport of viewports) {
  await mcp__playwright__browser_resize({
    width: viewport.width,
    height: viewport.height
  });

  await mcp__playwright__browser_take_screenshot({
    filename: `dashboard-${viewport.name}.png`,
    fullPage: true
  });
}
```

### Pattern 3: Accessibility Check

```typescript
// Test keyboard navigation
await mcp__playwright__browser_press_key({ key: 'Tab' });
await mcp__playwright__browser_take_screenshot({
  filename: 'focus-state-1.png'
});

await mcp__playwright__browser_press_key({ key: 'Tab' });
await mcp__playwright__browser_take_screenshot({
  filename: 'focus-state-2.png'
});

// Test ARIA attributes
await mcp__playwright__browser_evaluate({
  function: `() => {
    const issues = [];
    document.querySelectorAll('button').forEach(btn => {
      if (!btn.textContent?.trim() && !btn.getAttribute('aria-label')) {
        issues.push('Button without label');
      }
    });
    return issues;
  }`
});
```

## Common Scenarios

### Scenario 1: Test Form Validation

```
You: "Test athlete registration form validation"

Agent:
1. Navigate to /register
2. Try submitting empty form
3. Screenshot validation errors
4. Fill with invalid data
5. Screenshot specific field errors
6. Fill with valid data
7. Screenshot success state
```

### Scenario 2: Test Data Loading States

```
You: "Test analytics dashboard loading states"

Agent:
1. Navigate to /analytics
2. Screenshot loading spinner
3. Wait for data to load
4. Screenshot loaded state
5. Test empty state (no data)
6. Test error state (failed API)
```

### Scenario 3: Test Multi-Step Workflow

```
You: "Test complete athlete onboarding flow"

Agent:
1. Navigate to /invite
2. Send invitation
3. Navigate to invitation link
4. Complete registration
5. Verify email confirmation
6. First login
7. Profile setup
8. Screenshot each step
```

## Integration with TDD

### Full TDD Workflow with E2E

```
You: "Implement athlete profile export with TDD including E2E tests"

test-driven-feature-agent:
1. Writes unit tests
2. Writes integration tests
3. Writes E2E tests (ui-testing-agent)
4. Implements feature
5. Runs all tests
6. Iterates on failures
7. E2E tests provide visual proof
8. Completes when all tests pass
```

## Best Practices

### DO:
- ✅ Test complete user journeys
- ✅ Take screenshots for evidence
- ✅ Check console for errors
- ✅ Test responsive layouts
- ✅ Verify accessibility
- ✅ Use data-testid for reliable selectors
- ✅ Clean up test data after tests

### DON'T:
- ❌ Use fragile selectors (nth-child)
- ❌ Skip edge cases
- ❌ Ignore console warnings
- ❌ Test only on desktop
- ❌ Forget keyboard navigation
- ❌ Leave test data in database

## Troubleshooting

### Issue: Element Not Found

```typescript
// Problem: Element selector not working
await mcp__playwright__browser_click({
  element: 'button',
  ref: 'button.submit' // ❌ Too specific, might break
});

// Solution: Use accessible selectors
await mcp__playwright__browser_click({
  element: 'submit button',
  ref: 'button[type="submit"]' // ✅ More reliable
});

// Or use data-testid
await mcp__playwright__browser_click({
  element: 'submit button',
  ref: '[data-testid="submit-measurement"]' // ✅ Best
});
```

### Issue: Test Timing Out

```typescript
// Problem: Waiting for element that takes time
await mcp__playwright__browser_wait_for({
  text: 'Success',
  time: 2000 // ❌ Too short
});

// Solution: Increase timeout
await mcp__playwright__browser_wait_for({
  text: 'Success',
  time: 10000 // ✅ More generous
});
```

### Issue: Flaky Tests

```typescript
// Problem: Test passes sometimes, fails others
await mcp__playwright__browser_click({ ... });
// Immediately check for result ❌

// Solution: Add explicit waits
await mcp__playwright__browser_click({ ... });
await mcp__playwright__browser_wait_for({ time: 500 }); // ✅ Wait for action to complete
await mcp__playwright__browser_wait_for({ text: 'Expected result' }); // ✅ Wait for specific condition
```

## Screenshots Storage

All screenshots are saved to:
```
.playwright-mcp/
  ├── test-name-desktop.png
  ├── test-name-mobile.png
  ├── review-responsive-tablet.png
  └── ...
```

Add to `.gitignore`:
```
.playwright-mcp/
```

## Example Commands

### Run E2E Tests
```bash
npm run test:run -- tests/e2e/
```

### Run Specific E2E Test
```bash
npm run test:run -- tests/e2e/measurement-flow.e2e.test.ts
```

### Run Tests with UI (Vitest UI)
```bash
npm run test:ui
```

## Next Steps

1. **Start Simple**: Test one page visually
2. **Add E2E**: Write E2E test for critical flow
3. **Automate**: Integrate into TDD workflow
4. **Expand**: Cover all user journeys
5. **Maintain**: Update selectors as UI changes

For detailed examples, see `VISUAL_TESTING_EXAMPLES.md`
