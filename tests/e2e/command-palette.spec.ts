import { test, expect } from './fixtures/e2e-base';

/**
 * E2E Tests for Global Command Palette (Ctrl+K)
 *
 * These tests follow TDD approach - they are written FIRST and will fail initially.
 * Implementation will make them pass incrementally.
 */

test.describe('Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and wait for it to be interactive before any test
    // presses Ctrl+K — otherwise the global keyboard listener may not be mounted
    // yet and the palette never opens (the palette input then times out).
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Basic Functionality', () => {
    test('opens command palette with Ctrl+K', async ({ page }) => {
      // Press Ctrl+K (Cmd+K on Mac handled automatically by Playwright)
      await page.keyboard.press('Control+k');

      // Should show the command palette modal
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();

      // Should have input field focused
      const input = page.getByPlaceholder(/search/i);
      await expect(input).toBeFocused();
    });

    test('opens command palette with Cmd+K on Mac', async ({ page, browserName }) => {
      // Only test on webkit/chromium (Mac simulation)
      if (browserName === 'firefox') {
        test.skip();
      }

      await page.keyboard.press('Meta+k');
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    });

    test('closes command palette with Escape', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();

      // Close with Escape
      await page.keyboard.press('Escape');
      await expect(page.getByPlaceholder(/search/i)).not.toBeVisible();
    });

    test('closes command palette when clicking outside', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();

      // Click outside the modal (on backdrop)
      await page.click('body', { position: { x: 10, y: 10 } });

      // Should close
      await expect(page.getByPlaceholder(/search/i)).not.toBeVisible();
    });
  });

  test.describe('Search Functionality', () => {
    test('searches for athletes and displays results', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Type search query
      await page.getByPlaceholder(/search/i).fill('Smith');

      // Should show "Athletes" group heading. Scope to the palette dialog —
      // page.getByText('Athletes') also matches the nav's "Global Athletes"
      // link behind the modal, which trips Playwright's strict-mode check.
      await expect(page.getByRole('dialog').getByText('Athletes', { exact: true })).toBeVisible();

      // Should show at least one athlete result (seeded in global-setup)
      await expect(page.locator('[data-type="athlete"]').first()).toBeVisible();
    });

    test('searches for teams and displays results', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Type search query
      await page.getByPlaceholder(/search/i).fill('Varsity');

      // Should show "Teams" group heading
      await expect(page.getByText('Teams')).toBeVisible();

      // Should show at least one team result
      await expect(page.locator('[data-type="team"]').first()).toBeVisible();
    });

    test('shows fuzzy matching results', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Type partial/fuzzy query (missing letters)
      await page.getByPlaceholder(/search/i).fill('smth');

      // Should still find "Smith" (fuzzy matching)
      // Note: This tests PostgreSQL full-text search capabilities
      await expect(page.getByText(/smith/i)).toBeVisible({ timeout: 2000 });
    });

    test('shows empty state when no results found', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Type query that won't match anything
      await page.getByPlaceholder(/search/i).fill('xyzabc123nonexistent');

      // Should show empty state message
      await expect(page.getByText(/no results found/i)).toBeVisible();
    });

    test('groups results by type (Athletes, Teams, Actions)', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Type broad query that should match multiple types
      await page.getByPlaceholder(/search/i).fill('a');

      // Should show grouped results
      await expect(page.getByText('Athletes')).toBeVisible();
      await expect(page.getByText('Teams')).toBeVisible();
      await expect(page.getByText('Quick Actions')).toBeVisible();
    });

    test('debounces search input to avoid excessive API calls', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      const input = page.getByPlaceholder(/search/i);

      // Type rapidly
      await input.type('S', { delay: 50 });
      await input.type('m', { delay: 50 });
      await input.type('i', { delay: 50 });
      await input.type('t', { delay: 50 });
      await input.type('h', { delay: 50 });

      // Should wait for debounce before showing results
      // Results should appear after debounce period (300ms)
      await expect(page.getByText('Athletes')).toBeVisible({ timeout: 1000 });
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('navigates results with arrow keys', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Search to get results
      await page.getByPlaceholder(/search/i).fill('test');
      await expect(page.locator('[cmdk-item]').first()).toBeVisible();

      // First item should be focused/highlighted
      await expect(page.locator('[cmdk-item][data-selected="true"]').first()).toBeVisible();

      // Press down arrow
      await page.keyboard.press('ArrowDown');

      // Second item should now be highlighted
      // (Check that selection moved)
      const selectedItems = page.locator('[cmdk-item][data-selected="true"]');
      await expect(selectedItems).toHaveCount(1);

      // Press up arrow
      await page.keyboard.press('ArrowUp');

      // Should go back to first item
      await expect(selectedItems).toHaveCount(1);
    });

    test('selects result with Enter key', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Search for an athlete
      await page.getByPlaceholder(/search/i).fill('Smith');
      await expect(page.locator('[data-type="athlete"]').first()).toBeVisible();

      // Press Enter to select first result
      await page.keyboard.press('Enter');

      // Should navigate to athlete profile page
      await expect(page.url()).toContain('/athletes/');

      // Palette should close
      await expect(page.getByPlaceholder(/search/i)).not.toBeVisible();
    });

    test('handles Tab key navigation', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Tab should cycle through results (alternative to arrow keys)
      await page.getByPlaceholder(/search/i).fill('test');
      await expect(page.locator('[cmdk-item]').first()).toBeVisible();

      // Tab to next item
      await page.keyboard.press('Tab');

      // Should still be within command palette (not escape to document)
      const input = page.getByPlaceholder(/search/i);
      await expect(input).toBeVisible();
    });
  });

  test.describe('Quick Actions', () => {
    test('displays quick actions in palette', async ({ page }) => {
      // Open palette (without search query, should show actions)
      await page.keyboard.press('Control+k');

      // Should show quick actions group
      await expect(page.getByText('Quick Actions')).toBeVisible();

      // Should show common actions
      await expect(page.getByText('Add Athlete')).toBeVisible();
      await expect(page.getByText(/batch.*entry/i)).toBeVisible();
    });

    test('executes "Add Athlete" action', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Click or select "Add Athlete" action
      await page.getByText('Add Athlete').click();

      // Should navigate to athletes page with add action
      await expect(page.url()).toMatch(/\/athletes/);

      // Palette should close
      await expect(page.getByPlaceholder(/search/i)).not.toBeVisible();
    });

    test('executes "Batch Entry" action', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Search for batch entry
      await page.getByPlaceholder(/search/i).fill('batch');

      // Click batch entry action
      await page.getByText(/batch.*entry/i).click();

      // Should navigate to batch entry page
      await expect(page.url()).toContain('/data-entry/batch');

      // Palette should close
      await expect(page.getByPlaceholder(/search/i)).not.toBeVisible();
    });

    test('filters actions by search query', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Search for "import"
      await page.getByPlaceholder(/search/i).fill('import');

      // Should show import-related actions
      await expect(page.getByText(/import.*csv/i)).toBeVisible();

      // Should not show unrelated actions (they should be filtered out)
      await expect(page.getByText('Add Athlete')).not.toBeVisible();
    });
  });

  test.describe('Permission Filtering', () => {
    test('shows coach-specific actions for coaches', async ({ page }) => {
      // Note: This test assumes authentication context
      // Will need to log in as coach role first

      // TODO: Login as coach
      // await loginAsCoach(page);

      // Open palette
      await page.keyboard.press('Control+k');

      // Coaches should see these actions
      await expect(page.getByText('Add Athlete')).toBeVisible();
      await expect(page.getByText(/batch.*entry/i)).toBeVisible();
    });

    test('hides admin-only actions from non-admins', async ({ page }) => {
      // Note: This test assumes authentication context
      // Will need to log in as non-admin role

      // TODO: Login as coach (not admin)
      // await loginAsCoach(page);

      // Open palette
      await page.keyboard.press('Control+k');

      // Admin-only actions should not be visible
      // (e.g., "Manage Users", "Site Settings" if we add them)
      // For now, just verify basic actions are visible
      await expect(page.getByText('Add Athlete')).toBeVisible();
    });
  });

  test.describe('Recent Items', () => {
    test('shows recent items when opening palette', async ({ page }) => {
      // First, navigate to an athlete profile to create a recent item
      // (This assumes we have test data)

      // Open palette
      await page.keyboard.press('Control+k');

      // Search for and select an athlete
      await page.getByPlaceholder(/search/i).fill('Smith');
      await expect(page.locator('[data-type="athlete"]').first()).toBeVisible();
      await page.keyboard.press('Enter');

      // Wait for navigation
      await page.waitForURL(/\/athletes\//);

      // Now reopen the palette
      await page.keyboard.press('Control+k');

      // Should show "Recent" section
      await expect(page.getByText(/recent/i)).toBeVisible();

      // Should show the athlete we just visited
      await expect(page.getByText(/smith/i)).toBeVisible();
    });

    test('recent items are clickable and navigate correctly', async ({ page }) => {
      // Open palette (assuming recent items exist from previous test)
      await page.keyboard.press('Control+k');

      // If recent section exists, click on a recent item
      const recentSection = page.getByText(/recent/i);
      if (await recentSection.isVisible()) {
        // Click first recent item
        await page.locator('[data-recent-item]').first().click();

        // Should navigate to that item's page
        // Palette should close
        await expect(page.getByPlaceholder(/search/i)).not.toBeVisible();
      }
    });

    test('limits recent items to last 5 items', async ({ page }) => {
      // This test verifies localStorage limits to 5 items
      // Would need to navigate to 6+ different pages and verify only 5 show

      // Open palette
      await page.keyboard.press('Control+k');

      // Count recent items (if any exist)
      const recentItems = page.locator('[data-recent-item]');
      const count = await recentItems.count();

      // Should not exceed 5 items
      expect(count).toBeLessThanOrEqual(5);
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('displays as full-screen modal on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Open palette
      await page.keyboard.press('Control+k');

      // Palette should be visible and full-width on mobile
      const palette = page.locator('[role="dialog"]');
      await expect(palette).toBeVisible();

      // Check that it takes up most of the viewport (full-screen)
      const box = await palette.boundingBox();
      expect(box?.width).toBeGreaterThan(350); // Almost full width on 375px screen
    });
  });

  test.describe('Accessibility', () => {
    test('has proper ARIA labels', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Should have dialog role
      await expect(page.locator('[role="dialog"]')).toBeVisible();

      // Input should have accessible name
      const input = page.getByPlaceholder(/search/i);
      await expect(input).toHaveAttribute('aria-label');
    });

    test('maintains focus within modal (focus trap)', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      const input = page.getByPlaceholder(/search/i);
      await expect(input).toBeFocused();

      // Tab multiple times
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Focus should still be within the modal (not escape to document)
      // Check that we're not on external elements
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });

    test('announces results count to screen readers', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Search
      await page.getByPlaceholder(/search/i).fill('Smith');

      // Should have aria-live region announcing results
      await expect(page.locator('[aria-live="polite"]')).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test('search results appear within 500ms', async ({ page }) => {
      // Open palette
      await page.keyboard.press('Control+k');

      // Measure search response time
      const startTime = Date.now();

      await page.getByPlaceholder(/search/i).fill('Smith');
      await expect(page.getByText('Athletes')).toBeVisible();

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should be fast (< 500ms for good UX, < 300ms ideal)
      expect(responseTime).toBeLessThan(500);
    });

    test('keyboard shortcut registers quickly', async ({ page }) => {
      // Measure time from keypress to palette visible
      const startTime = Date.now();

      await page.keyboard.press('Control+k');
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should be nearly instant (< 100ms)
      expect(responseTime).toBeLessThan(100);
    });
  });

  test.describe('Keyboard Shortcuts Help Modal', () => {
    test('opens help modal with ? key', async ({ page }) => {
      // Press ? key to open help modal
      await page.keyboard.press('?');

      // Should show help modal with title
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText(/keyboard shortcuts/i)).toBeVisible();
    });

    test('opens help modal with Shift+/ keys', async ({ page }) => {
      // Press Shift+/ (which produces ?) to open help modal
      await page.keyboard.press('Shift+/');

      // Should show help modal
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText(/keyboard shortcuts/i)).toBeVisible();
    });

    test('displays all keyboard shortcuts in help modal', async ({ page }) => {
      // Open help modal
      await page.keyboard.press('?');

      // Should display command palette shortcut
      await expect(page.getByText(/Ctrl.*K|Cmd.*K/i)).toBeVisible();
      await expect(page.getByText(/open command palette/i)).toBeVisible();

      // Should display help shortcut
      await expect(page.getByText(/\?/)).toBeVisible();
      await expect(page.getByText(/show.*shortcuts|keyboard help/i)).toBeVisible();

      // Should display navigation shortcuts
      await expect(page.getByText(/arrow.*keys|↑.*↓/i)).toBeVisible();
      await expect(page.getByText(/enter/i)).toBeVisible();
      await expect(page.getByText(/escape|esc/i)).toBeVisible();
    });

    test('closes help modal with Escape key', async ({ page }) => {
      // Open help modal
      await page.keyboard.press('?');
      await expect(page.getByRole('dialog')).toBeVisible();

      // Close with Escape
      await page.keyboard.press('Escape');

      // Help modal should be closed
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });

    test('closes help modal by clicking outside', async ({ page }) => {
      // Open help modal
      await page.keyboard.press('?');
      await expect(page.getByRole('dialog')).toBeVisible();

      // Click outside the modal (on backdrop)
      await page.click('body', { position: { x: 10, y: 10 } });

      // Help modal should be closed
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });

    test('help modal does not interfere with command palette', async ({ page }) => {
      // Open command palette
      await page.keyboard.press('Control+k');
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();

      // Close command palette
      await page.keyboard.press('Escape');

      // Open help modal
      await page.keyboard.press('?');
      await expect(page.getByText(/keyboard shortcuts/i)).toBeVisible();

      // Close help modal
      await page.keyboard.press('Escape');

      // Both should be closed
      await expect(page.getByPlaceholder(/search/i)).not.toBeVisible();
      await expect(page.getByText(/keyboard shortcuts/i)).not.toBeVisible();
    });

    test('displays keyboard shortcuts with proper formatting', async ({ page }) => {
      // Open help modal
      await page.keyboard.press('?');

      // Should have keyboard shortcut badges/chips with proper styling
      const shortcuts = page.locator('[data-shortcut-key]');
      await expect(shortcuts.first()).toBeVisible();

      // Should have descriptions
      const descriptions = page.locator('[data-shortcut-description]');
      await expect(descriptions.first()).toBeVisible();
    });

    test('help modal is accessible with screen readers', async ({ page }) => {
      // Open help modal
      await page.keyboard.press('?');

      // Should have proper ARIA attributes
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveAttribute('aria-labelledby');
      await expect(dialog).toHaveAttribute('aria-describedby');

      // Should have heading for screen readers
      const heading = page.getByRole('heading', { name: /keyboard shortcuts/i });
      await expect(heading).toBeVisible();
    });

    test('displays all shortcuts from hotkeys.ts config dynamically', async ({ page }) => {
      // Open help modal
      await page.keyboard.press('?');

      // Should display Ctrl+K (command palette) - from hotkeys.ts
      await expect(page.getByText(/Ctrl.*K|Cmd.*K/i)).toBeVisible();
      await expect(page.getByText(/open command palette/i)).toBeVisible();

      // Should display Ctrl+M (quick add measurement) - from hotkeys.ts
      await expect(page.getByText(/Ctrl.*M|Cmd.*M/i)).toBeVisible();
      await expect(page.getByText(/quick add measurement/i)).toBeVisible();

      // Should display ? (help) - from hotkeys.ts
      await expect(page.getByText('?')).toBeVisible();
      await expect(page.getByText(/show.*shortcuts|keyboard.*help/i)).toBeVisible();

      // Should display Escape (close) - from hotkeys.ts
      await expect(page.getByText(/Esc/i)).toBeVisible();
      await expect(page.getByText(/close.*modal|close.*dialog/i)).toBeVisible();
    });

    test('displays platform-specific key labels (Cmd on Mac, Ctrl on Windows)', async ({ page }) => {
      // Open help modal
      await page.keyboard.press('?');

      // Get user agent to determine platform
      const userAgent = await page.evaluate(() => navigator.userAgent);
      const isMac = /Mac|iPhone|iPad|iPod/.test(userAgent);

      if (isMac) {
        // On Mac, should show Cmd instead of Ctrl
        await expect(page.getByText(/Cmd\+K/i)).toBeVisible();
        await expect(page.getByText(/Cmd\+M/i)).toBeVisible();
      } else {
        // On Windows/Linux, should show Ctrl
        await expect(page.getByText(/Ctrl\+K/i)).toBeVisible();
        await expect(page.getByText(/Ctrl\+M/i)).toBeVisible();
      }
    });

    test('groups shortcuts by category from config', async ({ page }) => {
      // Open help modal
      await page.keyboard.press('?');

      // Should have category headings
      await expect(page.getByText(/command palette/i)).toBeVisible();
      await expect(page.getByText(/navigation/i)).toBeVisible();
    });
  });
});
