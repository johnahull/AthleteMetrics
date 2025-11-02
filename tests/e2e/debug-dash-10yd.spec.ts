import { test, expect } from '@playwright/test';

test.describe('DASH_10YD Toggle Investigation', () => {
  test('Debug DASH_10YD metric toggle state', async ({ page }) => {
    // Track network requests to /api/metrics
    const metricsRequests: any[] = [];

    page.on('response', async (response) => {
      if (response.url().includes('/api/metrics')) {
        const body = await response.json().catch(() => null);
        metricsRequests.push({
          url: response.url(),
          status: response.status(),
          body: body
        });
        console.log('=== /api/metrics Response ===');
        console.log('URL:', response.url());
        console.log('Status:', response.status());
        console.log('Body:', JSON.stringify(body, null, 2));
      }
    });

    // Navigate directly to dashboard (authentication state already loaded from global-setup)
    console.log('=== Navigating to dashboard ===');
    await page.goto('https://athletemetrics-testing-testing.up.railway.app/dashboard');
    console.log('=== Login successful (using saved auth state) ===');

    // Navigate to My Organization page
    console.log('=== Navigating to My Organization ===');
    await page.goto('https://athletemetrics-testing-testing.up.railway.app/my-organization');

    // Wait for the Metrics Configuration card to load
    await page.waitForSelector('[data-testid="organization-metrics-card"]', { timeout: 30000 });
    console.log('=== Metrics Configuration card loaded ===');

    // Wait a bit for data to populate
    await page.waitForTimeout(2000);

    // Take screenshot of the table
    const metricsCard = page.locator('[data-testid="organization-metrics-card"]');
    await metricsCard.screenshot({ path: '/tmp/metrics-table.png' });
    console.log('=== Screenshot saved to /tmp/metrics-table.png ===');

    // Extract metrics data using page.evaluate()
    const metricsData = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-testid^="org-metric-row-"]'))
        .map(row => {
          const code = (row as HTMLElement).dataset.testid?.replace('org-metric-row-', '') || '';
          const toggle = row.querySelector('[data-testid^="toggle-metric-"]') as HTMLButtonElement;
          return {
            code: code,
            label: row.querySelector('td:first-child')?.textContent?.trim(),
            toggleExists: !!toggle,
            toggleDisabled: toggle?.disabled,
            toggleChecked: toggle?.getAttribute('data-state') === 'checked',
            toggleAriaChecked: toggle?.getAttribute('aria-checked'),
            toggleDataState: toggle?.getAttribute('data-state'),
            toggleHTML: toggle?.outerHTML?.substring(0, 200) // Truncate for readability
          };
        });
    });

    console.log('\n=== Metrics Table Data ===');
    console.log(JSON.stringify(metricsData, null, 2));

    // Find DASH_10YD specifically
    const dash10yd = metricsData.find(m => m.code === 'DASH_10YD');
    console.log('\n=== DASH_10YD Specific Data ===');
    console.log(JSON.stringify(dash10yd, null, 2));

    // Check what metrics were returned from API
    console.log('\n=== API Metrics Requests Summary ===');
    console.log('Total requests:', metricsRequests.length);

    for (const req of metricsRequests) {
      console.log('\nRequest to:', req.url);
      console.log('Status:', req.status);
      if (req.body && Array.isArray(req.body)) {
        console.log('Metrics returned:', req.body.length);
        const dash10ydInResponse = req.body.find((m: any) => m.code === 'DASH_10YD');
        console.log('DASH_10YD in response:', dash10ydInResponse ? 'YES' : 'NO');
        if (dash10ydInResponse) {
          console.log('DASH_10YD data:', JSON.stringify(dash10ydInResponse, null, 2));
        }
        console.log('All metric codes:', req.body.map((m: any) => m.code).join(', '));
      }
    }

    // Generate diagnosis
    console.log('\n=== DIAGNOSIS ===');
    if (!dash10yd) {
      console.log('❌ DASH_10YD is NOT in the metrics table');
    } else {
      console.log('✅ DASH_10YD is in the metrics table');
      console.log(`   - Toggle exists: ${dash10yd.toggleExists}`);
      console.log(`   - Toggle disabled: ${dash10yd.toggleDisabled}`);
      console.log(`   - Toggle checked: ${dash10yd.toggleChecked}`);
      console.log(`   - Toggle data-state: ${dash10yd.toggleDataState}`);

      if (dash10yd.toggleDisabled) {
        console.log('\n🔍 Toggle is DISABLED. Possible reasons:');
        console.log('   1. canEdit prop is false (user lacks permission)');
        console.log('   2. enableMutation.isPending or disableMutation.isPending is true');
        console.log('   3. Component logic is setting disabled=true for this specific metric');
      }
    }

    // Check if DASH_10YD came from the API
    const dash10ydFromApi = metricsRequests.some(req =>
      req.body && Array.isArray(req.body) &&
      req.body.some((m: any) => m.code === 'DASH_10YD')
    );

    console.log(`\n📡 DASH_10YD in API response: ${dash10ydFromApi ? 'YES' : 'NO'}`);

    if (!dash10ydFromApi) {
      console.log('❌ DASH_10YD is NOT being returned by /api/metrics');
      console.log('   This suggests a backend filtering issue');
    }

    // Output all data for analysis
    console.log('\n=== FULL REPORT ===');
    console.log('1. DASH_10YD in table:', !!dash10yd);
    console.log('2. DASH_10YD in API:', dash10ydFromApi);
    console.log('3. Toggle state:', dash10yd ? {
      disabled: dash10yd.toggleDisabled,
      checked: dash10yd.toggleChecked,
      dataState: dash10yd.toggleDataState
    } : 'N/A');
    console.log('4. Screenshot saved to: /tmp/metrics-table.png');
  });
});
