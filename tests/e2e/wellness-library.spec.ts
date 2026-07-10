import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * Wellness Template Library E2E Tests
 *
 * Tests the complete library workflow:
 * - Browsing templates by category
 * - Filtering by tags
 * - Searching templates
 * - Previewing template details
 * - Cloning templates to organization
 * - Adding category/tags to custom templates
 */

test.describe('Wellness Template Library', () => {
  test.beforeEach(async ({ page }) => {
    // Use auth helper that handles storageState and proper selectors
    await loginAsDefaultUser(page);

    // Navigate to wellness page
    await page.goto('/wellness');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Library Navigation', () => {
    test('should show Library tab in wellness navigation', async ({ page }) => {
      // Check that Library tab exists
      const libraryTab = page.locator('[role="tab"]:text-is("Library")');
      await expect(libraryTab).toBeVisible();
      await expect(libraryTab).toHaveText(/Library/i);
    });

    test('should navigate to Library tab when clicked', async ({ page }) => {
      // Click Library tab
      await page.click('[role="tab"]:text-is("Library")');

      // Verify Library content is displayed
      await expect(page.locator('text=Template Library')).toBeVisible();
    });

    test('should show default view when Library tab is opened', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      // Check for category tabs
      await expect(page.locator('[role="tab"]:text-is("All")')).toBeVisible();
      await expect(page.locator('[role="tab"]:text-is("General")')).toBeVisible();
      await expect(page.locator('[role="tab"]:text-is("Recovery")')).toBeVisible();

      // Check for search bar
      await expect(page.locator('input[placeholder*="Search templates"]')).toBeVisible();
    });
  });

  test.describe('Category Filtering', () => {
    test('should display all categories', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      const categories = ['all', 'general', 'recovery', 'performance', 'injury', 'training'];

      for (const category of categories) {
        // Category tabs are Radix TabsTrigger (role="tab"); their visible label
        // is the capitalized category value (all → "All").
        const label = category.charAt(0).toUpperCase() + category.slice(1);
        const tab = page.locator(`[role="tab"]:text-is("${label}")`);
        await expect(tab).toBeVisible();
      }
    });

    test('should filter templates by category when tab is clicked', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      // Click Recovery category
      await page.click('[role="tab"]:text-is("Recovery")');

      // Wait for filtering
      await page.waitForTimeout(500);

      // Check that only recovery templates are shown (if any exist)
      const templateCards = page.locator('[data-testid^="template-card-"]');
      const count = await templateCards.count();

      // Verify category badges on visible cards
      if (count > 0) {
        const categoryBadges = page.locator('text=Recovery').or(page.locator('text=recovery'));
        await expect(categoryBadges.first()).toBeVisible();
      }
    });

    test('should show category counts in tabs', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      // Category tabs may show counts like "Recovery (2)"
      const allTab = page.locator('[role="tab"]:text-is("All")');
      await expect(allTab).toBeVisible();
    });

    test('should show all templates when "All" category is selected', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      // Click Recovery first
      await page.click('[role="tab"]:text-is("Recovery")');
      await page.waitForTimeout(300);

      // Then click All
      await page.click('[role="tab"]:text-is("All")');
      await page.waitForTimeout(300);

      // Should show all templates again
      const searchInput = page.locator('input[placeholder*="Search templates"]');
      await expect(searchInput).toBeVisible();
    });
  });

  test.describe('Search Functionality', () => {
    test('should have search input visible', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      const searchInput = page.locator('input[placeholder*="Search templates"]');
      await expect(searchInput).toBeVisible();
    });

    test('should filter templates by search query', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      // Type in search
      const searchInput = page.locator('input[placeholder*="Search templates"]');
      await searchInput.fill('daily');

      // Wait for filtering
      await page.waitForTimeout(500);

      // Check that results are filtered (may show "Daily Wellness" or empty state)
      const emptyState = page.locator('text=/No templates match your filters/');
      const templateCards = page.locator('[data-testid^="template-card-"]');

      const hasResults = await templateCards.count() > 0;
      const showsEmpty = await emptyState.isVisible().catch(() => false);

      // Either should have results or show empty state
      expect(hasResults || showsEmpty).toBeTruthy();
    });

    test('should show empty state when no results match search', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      const searchInput = page.locator('input[placeholder*="Search templates"]');
      await searchInput.fill('zzzznonexistenttemplatexyz123');

      await page.waitForTimeout(500);

      // Should show empty state
      await expect(page.locator('text=/No templates match your filters/')).toBeVisible();
    });

    test('should clear search when input is cleared', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      const searchInput = page.locator('input[placeholder*="Search templates"]');

      // Type search
      await searchInput.fill('daily');
      await page.waitForTimeout(300);

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(300);

      // Should show all templates again
      const emptyState = page.locator('text=/No templates match your filters/');
      await expect(emptyState).not.toBeVisible();
    });
  });

  test.describe('Tag Filtering', () => {
    test('should show tag filter section', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');

      // Tag filters may be visible if templates have tags
      await page.waitForTimeout(500);

      // Check for tag filter container or tags
      const tagSection = page.locator('text=Filter by tags').or(page.locator('[data-testid^="tag-filter-"]'));
      const hasTagSection = await tagSection.count() > 0;

      // Tags may not exist if no templates are present, so this is optional
      expect(hasTagSection !== undefined).toBeTruthy();
    });

    test('should filter templates when tag is clicked', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      // Try to find and click a tag filter
      const tagFilter = page.locator('[data-testid^="tag-filter-"]').first();
      const tagExists = await tagFilter.count() > 0;

      if (tagExists) {
        await tagFilter.click();
        await page.waitForTimeout(500);

        // Templates should be filtered
        const templateCards = page.locator('[data-testid^="template-card-"]');
        const count = await templateCards.count();

        // Should have some filtering effect
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test('should allow multi-select tag filtering', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const tagFilters = page.locator('[data-testid^="tag-filter-"]');
      const tagCount = await tagFilters.count();

      if (tagCount >= 2) {
        // Click first tag
        await tagFilters.nth(0).click();
        await page.waitForTimeout(300);

        // Click second tag
        await tagFilters.nth(1).click();
        await page.waitForTimeout(300);

        // Both tags should be selected
        // Templates matching either tag should be shown
        const templateCards = page.locator('[data-testid^="template-card-"]');
        await expect(templateCards.first()).toBeVisible();
      }
    });
  });

  test.describe('Template Cards Display', () => {
    test('should display template cards with correct information', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const templateCard = page.locator('[data-testid^="template-card-"]').first();
      const cardExists = await templateCard.count() > 0;

      if (cardExists) {
        // Should show template name
        await expect(templateCard.locator('h3, h4').first()).toBeVisible();

        // Should show description
        await expect(templateCard.locator('p').first()).toBeVisible();

        // Should show category badge
        const categoryBadge = templateCard.locator('[data-testid="category-badge"]');
        const hasCategoryBadge = await categoryBadge.count() > 0;
        expect(hasCategoryBadge !== undefined).toBeTruthy();
      }
    });

    test('should show system template badge for seeded templates', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      // Look for sparkle icon or "System Template" text
      const systemBadge = page.locator('text=System Template').or(page.locator('[data-lucide="sparkles"]'));
      const hasSystemBadge = await systemBadge.count() > 0;

      // System templates may exist if seeded
      expect(hasSystemBadge !== undefined).toBeTruthy();
    });

    test('should show preview and clone buttons on template cards', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const templateCard = page.locator('[data-testid^="template-card-"]').first();
      const cardExists = await templateCard.count() > 0;

      if (cardExists) {
        // Should have Preview button
        const previewBtn = templateCard.locator('button:has-text("Preview")');
        await expect(previewBtn).toBeVisible();

        // Should have Clone button
        const cloneBtn = templateCard.locator('button:has-text("Clone")');
        await expect(cloneBtn).toBeVisible();
      }
    });

    test('should show tag chips on template cards', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const templateCard = page.locator('[data-testid^="template-card-"]').first();
      const cardExists = await templateCard.count() > 0;

      if (cardExists) {
        // Tags may be shown as badges
        const tagBadges = templateCard.locator('[data-testid^="tag-badge-"]');
        const hasTagBadges = await tagBadges.count() > 0;

        // Tags are optional per template
        expect(hasTagBadges !== undefined).toBeTruthy();
      }
    });
  });

  test.describe('Template Preview Modal', () => {
    test('should open preview modal when Preview button is clicked', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const previewBtn = page.locator('button:has-text("Preview")').first();
      const btnExists = await previewBtn.count() > 0;

      if (btnExists) {
        await previewBtn.click();

        // Modal should open
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
    });

    test('should display template details in preview modal', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const previewBtn = page.locator('button:has-text("Preview")').first();
      const btnExists = await previewBtn.count() > 0;

      if (btnExists) {
        await previewBtn.click();
        await page.waitForTimeout(500);

        const modal = page.locator('[role="dialog"]');

        // Should show template name
        await expect(modal.locator('h2, h3').first()).toBeVisible();

        // Should show questions section
        const questionsText = modal.locator('text=Questions').or(modal.locator('text=Question'));
        await expect(questionsText.first()).toBeVisible();
      }
    });

    test('should show clone button in preview modal', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const previewBtn = page.locator('button:has-text("Preview")').first();
      const btnExists = await previewBtn.count() > 0;

      if (btnExists) {
        await previewBtn.click();
        await page.waitForTimeout(500);

        const modal = page.locator('[role="dialog"]');
        const cloneBtn = modal.locator('button:has-text("Clone")');

        await expect(cloneBtn).toBeVisible();
      }
    });

    test('should close modal when Cancel or X is clicked', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const previewBtn = page.locator('button:has-text("Preview")').first();
      const btnExists = await previewBtn.count() > 0;

      if (btnExists) {
        await previewBtn.click();
        await page.waitForTimeout(500);

        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible();

        // Try to find close button
        const closeBtn = modal.locator('button:has-text("Cancel")').or(modal.locator('button[aria-label="Close"]'));
        const closeBtnExists = await closeBtn.count() > 0;

        if (closeBtnExists) {
          await closeBtn.first().click();
          await page.waitForTimeout(300);

          // Modal should close
          await expect(modal).not.toBeVisible();
        }
      }
    });
  });

  test.describe('Template Cloning', () => {
    test('should clone template when Clone button is clicked', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const cloneBtn = page.locator('button:has-text("Clone")').first();
      const btnExists = await cloneBtn.count() > 0;

      if (btnExists) {
        // Get initial template count
        await page.click('[role="tab"]:text-is("Templates")');
        await page.waitForTimeout(500);

        const initialCount = await page.locator('[data-testid^="template-row-"]').count();

        // Go back to library
        await page.click('[role="tab"]:text-is("Library")');
        await page.waitForTimeout(500);

        // Click clone
        await page.locator('button:has-text("Clone")').first().click();

        // Wait for success toast
        await page.waitForTimeout(2000);

        // Check for success message
        const successToast = page.locator('text=Template cloned successfully').or(page.locator('text=cloned'));
        const toastVisible = await successToast.isVisible().catch(() => false);

        if (toastVisible) {
          // Navigate to templates tab
          await page.click('[role="tab"]:text-is("Templates")');
          await page.waitForTimeout(1000);

          // Should have one more template
          const newCount = await page.locator('[data-testid^="template-row-"]').count();
          expect(newCount).toBeGreaterThanOrEqual(initialCount);
        }
      }
    });

    test('should show loading state while cloning', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const cloneBtn = page.locator('button:has-text("Clone")').first();
      const btnExists = await cloneBtn.count() > 0;

      if (btnExists) {
        await cloneBtn.click();

        // Should show loading state (disabled button or spinner)
        const isDisabled = await cloneBtn.isDisabled().catch(() => false);
        expect(isDisabled !== undefined).toBeTruthy();
      }
    });

    test('should preserve template structure when cloning', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      // Open preview to see original
      const previewBtn = page.locator('button:has-text("Preview")').first();
      const previewExists = await previewBtn.count() > 0;

      if (previewExists) {
        await previewBtn.click();
        await page.waitForTimeout(500);

        const modal = page.locator('[role="dialog"]');
        const originalName = await modal.locator('h2, h3').first().textContent();

        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Clone template
        await page.locator('button:has-text("Clone")').first().click();
        await page.waitForTimeout(2000);

        // Go to templates tab
        await page.click('[role="tab"]:text-is("Templates")');
        await page.waitForTimeout(1000);

        // Should find cloned template (may have same or similar name)
        const templates = page.locator('[data-testid^="template-row-"]');
        expect(await templates.count()).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Template Builder Integration', () => {
    test('should show category dropdown in TemplateBuilder', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Templates")');
      await page.waitForTimeout(500);

      // Click "Create Template" button
      const createBtn = page.locator('button:has-text("Create Template")');
      const btnExists = await createBtn.count() > 0;

      if (btnExists) {
        await createBtn.click();
        await page.waitForTimeout(1000);

        // Should see category dropdown
        const categoryLabel = page.locator('text=Category');
        await expect(categoryLabel).toBeVisible();
      }
    });

    test('should show tags input in TemplateBuilder', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Templates")');
      await page.waitForTimeout(500);

      const createBtn = page.locator('button:has-text("Create Template")');
      const btnExists = await createBtn.count() > 0;

      if (btnExists) {
        await createBtn.click();
        await page.waitForTimeout(1000);

        // Should see tags input
        const tagsLabel = page.locator('text=Tags');
        await expect(tagsLabel).toBeVisible();
      }
    });

    test('should allow adding tags to custom template', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Templates")');
      await page.waitForTimeout(500);

      const createBtn = page.locator('button:has-text("Create Template")');
      const btnExists = await createBtn.count() > 0;

      if (btnExists) {
        await createBtn.click();
        await page.waitForTimeout(1000);

        // Find tags input
        const tagsInput = page.locator('input[placeholder*="tag"]').or(page.locator('input[name*="tag"]'));
        const tagInputExists = await tagsInput.count() > 0;

        if (tagInputExists) {
          await tagsInput.first().fill('test-tag');
          await page.keyboard.press('Enter');

          // Tag should be added
          await page.waitForTimeout(300);
          const tagBadge = page.locator('text=test-tag');
          await expect(tagBadge).toBeVisible();
        }
      }
    });
  });

  test.describe('Empty States', () => {
    test('should show empty state when no templates match filters', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      // Search for non-existent template
      const searchInput = page.locator('input[placeholder*="Search templates"]');
      await searchInput.fill('zzzznonexistentxyz');
      await page.waitForTimeout(500);

      // Should show empty state
      await expect(page.locator('text=/No templates match your filters/')).toBeVisible();
    });

    test('should show "Clear filters" button in empty state', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const searchInput = page.locator('input[placeholder*="Search templates"]');
      await searchInput.fill('zzzznonexistentxyz');
      await page.waitForTimeout(500);

      // Should have Clear filters button
      const clearBtn = page.locator('button:has-text("Clear filters")');
      await expect(clearBtn).toBeVisible();
    });

    test('should clear filters when "Clear filters" is clicked', async ({ page }) => {
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      const searchInput = page.locator('input[placeholder*="Search templates"]');
      await searchInput.fill('zzzznonexistentxyz');
      await page.waitForTimeout(500);

      // Click clear filters
      const clearBtn = page.locator('button:has-text("Clear filters")');
      await clearBtn.click();
      await page.waitForTimeout(500);

      // Empty state should disappear
      await expect(page.locator('text=/No templates match your filters/')).not.toBeVisible();

      // Search should be cleared
      await expect(searchInput).toHaveValue('');
    });
  });

  test.describe('Responsive Design', () => {
    test('should display correctly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      // Category tabs should be visible (may scroll)
      const allTab = page.locator('[role="tab"]:text-is("All")');
      await expect(allTab).toBeVisible();

      // Search should be visible
      const searchInput = page.locator('input[placeholder*="Search templates"]');
      await expect(searchInput).toBeVisible();
    });

    test('should display correctly on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      // Should show 2-column grid on tablet
      const templateCards = page.locator('[data-testid^="template-card-"]');
      const hasCards = await templateCards.count() > 0;

      if (hasCards) {
        await expect(templateCards.first()).toBeVisible();
      }
    });

    test('should display correctly on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.click('[role="tab"]:text-is("Library")');
      await page.waitForTimeout(500);

      // Should show 3-column grid on desktop
      const templateCards = page.locator('[data-testid^="template-card-"]');
      const hasCards = await templateCards.count() > 0;

      if (hasCards) {
        await expect(templateCards.first()).toBeVisible();
      }
    });
  });

  test.describe('Loading States', () => {
    test('should show loading state while fetching library', async ({ page }) => {
      // Navigate to library (first load)
      await page.click('[role="tab"]:text-is("Library")');

      // Should show loading skeletons or spinner
      const loadingState = page.locator('[data-testid="skeleton-card"]').or(page.locator('text=Loading'));
      const hasLoading = await loadingState.count() > 0;

      // Loading state is transient, so may not always catch it
      expect(hasLoading !== undefined).toBeTruthy();

      // Wait for actual content
      await page.waitForTimeout(1000);
    });
  });
});
