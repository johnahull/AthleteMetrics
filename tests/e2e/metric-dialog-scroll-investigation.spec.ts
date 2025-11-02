/**
 * Investigation test for metric form dialog scrolling issue
 *
 * This test opens the metric form dialog and investigates why scrolling is not working
 */

import { test, expect } from '@playwright/test';

test.describe('Metric Form Dialog - Scroll Investigation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to metrics page
    await page.goto('/metrics');

    // Wait for page to load
    await page.waitForSelector('[data-testid="add-metric-button"]', { timeout: 10000 });
  });

  test('should investigate dialog scroll behavior', async ({ page }) => {
    // Click "Add Metric" button
    await page.click('[data-testid="add-metric-button"]');

    // Wait for dialog to appear
    await page.waitForSelector('[data-testid="metric-form-dialog"]', { timeout: 5000 });

    // Take screenshot of the dialog
    await page.screenshot({
      path: 'metric-dialog-initial.png',
      fullPage: false
    });

    // Investigate DOM structure
    const dialogStructure = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="metric-form-dialog"]');
      if (!dialog) return { error: 'Dialog not found' };

      const computedStyle = window.getComputedStyle(dialog);
      const parentStyle = dialog.parentElement ? window.getComputedStyle(dialog.parentElement) : null;

      // Get all children
      const children = Array.from(dialog.children).map(child => ({
        tagName: child.tagName,
        className: child.className,
        computedDisplay: window.getComputedStyle(child).display,
        computedOverflow: window.getComputedStyle(child).overflow,
        computedMaxHeight: window.getComputedStyle(child).maxHeight,
        scrollHeight: (child as HTMLElement).scrollHeight,
        clientHeight: (child as HTMLElement).clientHeight,
      }));

      return {
        dialog: {
          className: dialog.className,
          display: computedStyle.display,
          overflow: computedStyle.overflow,
          overflowY: computedStyle.overflowY,
          maxHeight: computedStyle.maxHeight,
          height: computedStyle.height,
          scrollHeight: (dialog as HTMLElement).scrollHeight,
          clientHeight: (dialog as HTMLElement).clientHeight,
          offsetHeight: (dialog as HTMLElement).offsetHeight,
        },
        parent: parentStyle ? {
          display: parentStyle.display,
          overflow: parentStyle.overflow,
          position: parentStyle.position,
        } : null,
        children,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        dialogBoundingRect: dialog.getBoundingClientRect(),
      };
    });

    console.log('Dialog Structure:', JSON.stringify(dialogStructure, null, 2));

    // Check if dialog content is taller than viewport
    const isOverflowing = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="metric-form-dialog"]') as HTMLElement;
      if (!dialog) return false;

      return dialog.scrollHeight > dialog.clientHeight;
    });

    console.log('Is dialog overflowing?', isOverflowing);

    // Try to scroll the dialog
    const scrollResult = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="metric-form-dialog"]') as HTMLElement;
      if (!dialog) return { error: 'Dialog not found' };

      const beforeScroll = dialog.scrollTop;

      // Try to scroll down
      dialog.scrollTop = 500;

      const afterScroll = dialog.scrollTop;

      return {
        beforeScroll,
        afterScroll,
        didScroll: afterScroll !== beforeScroll,
        maxScroll: dialog.scrollHeight - dialog.clientHeight,
      };
    });

    console.log('Scroll test result:', scrollResult);

    // Take screenshot after scroll attempt
    await page.screenshot({
      path: 'metric-dialog-after-scroll.png',
      fullPage: false
    });

    // Get the actual HTML structure
    const htmlStructure = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="metric-form-dialog"]');
      if (!dialog) return 'Dialog not found';

      // Get outerHTML but limit depth to avoid huge output
      const getStructure = (element: Element, depth = 0): string => {
        if (depth > 3) return `<${element.tagName.toLowerCase()} .../>`; // Limit depth

        const tag = element.tagName.toLowerCase();
        const classes = element.className ? ` class="${element.className}"` : '';
        const children = Array.from(element.children)
          .map(child => getStructure(child, depth + 1))
          .join('\n' + '  '.repeat(depth + 1));

        if (children) {
          return `<${tag}${classes}>\n${'  '.repeat(depth + 1)}${children}\n${'  '.repeat(depth)}</${tag}>`;
        } else {
          const text = element.textContent?.trim().substring(0, 30) || '';
          return `<${tag}${classes}>${text ? `${text}...` : ''}</${tag}>`;
        }
      };

      return getStructure(dialog);
    });

    console.log('HTML Structure:\n', htmlStructure);
  });
});
