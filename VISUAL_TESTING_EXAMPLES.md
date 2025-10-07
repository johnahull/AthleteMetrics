# Visual Testing Examples

Real-world examples of UI testing with Playwright MCP in AthleteMetrics.

## Example 1: Test Athlete Profile Page

```
You: "Test the athlete profile page visually"

visual-design-review-agent:
1. Navigates to http://localhost:5000/athletes/123
2. Takes desktop screenshot (1920x1080)
3. Resizes to tablet (768x1024), takes screenshot
4. Resizes to mobile (375x667), takes screenshot
5. Tests hover states on buttons
6. Checks keyboard navigation
7. Verifies console has no errors
8. Generates report with 7 screenshots
```

**Result:** Catches mobile layout issue - stats overflow on small screens

## Example 2: E2E Test for Measurement Entry

```
You: "Write E2E test for adding a vertical jump measurement"

ui-testing-agent creates:
```
```typescript
describe('E2E: Add Vertical Jump', () => {
  it('should add measurement and show in profile', async () => {
    await mcp__playwright__browser_navigate({
      url: 'http://localhost:5000/measurements'
    });

    await mcp__playwright__browser_click({
      element: 'Add Measurement',
      ref: 'button:has-text("Add Measurement")'
    });

    await mcp__playwright__browser_fill_form({
      fields: [
        { name: 'athlete', type: 'combobox', ref: 'select[name="athleteId"]', value: 'athlete-1' },
        { name: 'metric', type: 'combobox', ref: 'select[name="metricType"]', value: 'VERTICAL_JUMP' },
        { name: 'value', type: 'textbox', ref: 'input[name="value"]', value: '28.5' }
      ]
    });

    await mcp__playwright__browser_take_screenshot({
      filename: 'measurement-form-filled.png'
    });

    await mcp__playwright__browser_click({
      element: 'Save',
      ref: 'button:has-text("Save")'
    });

    await mcp__playwright__browser_wait_for({
      text: 'created successfully',
      time: 3000
    });

    const console = await mcp__playwright__browser_console_messages({
      onlyErrors: true
    });

    expect(console).toHaveLength(0);
  });
});
```

## Example 3: Build Component with Visual Feedback

```
You: "Build athlete card component with visual testing"

ui-development-agent:
1. Creates AthleteCard.tsx component
2. Creates test page at /component-test
3. Navigates browser to test page
4. Screenshots desktop (1920px)
5. Screenshots tablet (768px)
6. Screenshots mobile (375px)
7. Tests hover state
8. Checks console errors
9. Identifies mobile layout issue
10. Fixes CSS
11. Re-tests mobile
12. Confirms fix with screenshot
```

**Result:** Component works perfectly across all devices

## Example 4: Accessibility Audit

```
You: "Check dashboard accessibility"

visual-design-review-agent:
1. Navigates to /dashboard
2. Tests keyboard navigation (Tab through all elements)
3. Checks color contrast ratios
4. Verifies ARIA attributes
5. Tests screen reader compatibility
6. Generates accessibility report

Findings:
- ❌ Insufficient contrast on secondary buttons (3.2:1, needs 4.5:1)
- ❌ Missing aria-label on icon buttons
- ✅ Keyboard navigation works
- ✅ Heading hierarchy correct
- ✅ Form labels present
```

## Example 5: Full TDD with E2E

```
You: "Implement team comparison feature with TDD including E2E tests"

test-driven-feature-agent:
1. Invokes testing-qa-agent for unit/integration tests
2. Invokes ui-testing-agent for E2E tests
3. All tests written first (RED phase)
4. Implements feature
5. Runs unit tests - some pass, some fail
6. Iteration 1: Fixes unit test failures
7. Runs integration tests - pass
8. Runs E2E tests - fail (button not clickable)
9. Reviews E2E screenshot - sees layout issue
10. Iteration 2: Fixes layout
11. Re-runs E2E tests - pass
12. All 47 tests passing ✅
13. Visual verification via E2E screenshots
```

For complete guide, see `UI_TESTING_GUIDE.md`
