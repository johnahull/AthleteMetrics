# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: coppa-consent-flow.spec.ts >> COPPA: Consent Confirmation Grant and Deny Happy Paths >> clicking "Grant Permission" shows success confirmation screen
- Location: tests/e2e/coppa-consent-flow.spec.ts:1095:3

# Error details

```
Error: Success screen must reference the athlete name after granting consent

expect(locator).toBeVisible() failed

Locator: locator('text=Grant Test Athlete')
Expected: visible
Error: strict mode violation: locator('text=Grant Test Athlete') resolved to 3 elements:
    1) <div class="text-sm text-muted-foreground">You've approved Grant Test Athlete's AthleteMetri…</div> aka getByText('You\'ve approved Grant Test')
    2) <div class="[&_p]:leading-relaxed text-green-800 dark:text-green-200 text-sm">Grant Test Athlete can now log in and use Athlete…</div> aka getByText('Grant Test Athlete can now')
    3) <p class="text-sm font-medium text-primary">Would you like to create a parent account to trac…</p> aka getByText('Would you like to create a')

Call log:
  - Success screen must reference the athlete name after granting consent with timeout 5000ms
  - waiting for locator('text=Grant Test Athlete')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - region "Notifications (F8)":
    - list
  - generic [ref=e6]:
    - generic [ref=e7]:
      - paragraph [ref=e8]: AthleteMetrics
      - img [ref=e10]
      - generic [ref=e13]: Permission Granted
      - generic [ref=e14]: You've approved Grant Test Athlete's AthleteMetrics account.
    - generic [ref=e15]:
      - alert [ref=e16]:
        - generic [ref=e17]: Grant Test Athlete can now log in and use AthleteMetrics.
      - generic [ref=e18]:
        - paragraph [ref=e19]: Would you like to create a parent account to track Grant Test Athlete's progress?
        - paragraph [ref=e20]: A parent account lets you monitor measurements, view reports, and stay informed about your child's athletic development.
        - generic [ref=e21]:
          - button "Create Parent Account" [ref=e22] [cursor=pointer]:
            - img
            - text: Create Parent Account
          - button "No thanks" [ref=e23] [cursor=pointer]
```

# Test source

```ts
  1038 |             parentEmail: 'parent@example.com',
  1039 |           }),
  1040 |         });
  1041 |       } else {
  1042 |         // Pass POST requests through to the next route handler (action buttons)
  1043 |         await route.fallback();
  1044 |       }
  1045 |     });
  1046 | 
  1047 |     await page.goto(`${BASE_URL}/consent/mock-valid-token`);
  1048 |     await page.waitForLoadState('networkidle');
  1049 |     await page.waitForTimeout(2_000);
  1050 |   }
  1051 | 
  1052 |   test('valid consent token shows parent info, grant and deny buttons', async ({ page }) => {
  1053 |     await navigateToConsentPageWithValidToken(page);
  1054 | 
  1055 |     // Main consent form heading
  1056 |     await expect(
  1057 |       page.locator('text=Parental Consent Request'),
  1058 |       'Consent confirmation page must show "Parental Consent Request" heading for a valid token'
  1059 |     ).toBeVisible();
  1060 | 
  1061 |     // Athlete name from the mock payload
  1062 |     await expect(
  1063 |       page.locator('text=Test Athlete'),
  1064 |       'Consent page must display the athlete name from the token payload'
  1065 |     ).toBeVisible();
  1066 | 
  1067 |     // COPPA-required data disclosure sections
  1068 |     await expect(
  1069 |       page.locator('text=What AthleteMetrics Collects'),
  1070 |       'Consent page must disclose what data is collected'
  1071 |     ).toBeVisible();
  1072 | 
  1073 |     await expect(
  1074 |       page.locator('text=How This Data Is Used'),
  1075 |       'Consent page must disclose how data is used'
  1076 |     ).toBeVisible();
  1077 | 
  1078 |     await expect(
  1079 |       page.locator('text=Your Rights as a Parent'),
  1080 |       'Consent page must disclose parent/guardian rights'
  1081 |     ).toBeVisible();
  1082 | 
  1083 |     // Action buttons
  1084 |     await expect(
  1085 |       page.locator('button:has-text("Grant Permission")'),
  1086 |       '"Grant Permission" button must be visible on the consent form'
  1087 |     ).toBeVisible();
  1088 | 
  1089 |     await expect(
  1090 |       page.locator('button:has-text("Deny")'),
  1091 |       '"Deny" button must be visible on the consent form'
  1092 |     ).toBeVisible();
  1093 |   });
  1094 | 
  1095 |   test('clicking "Grant Permission" shows success confirmation screen', async ({ page }) => {
  1096 |     // Intercept GET to return valid token data, and POST to return success
  1097 |     await page.route('**/api/coppa/consent/verify/**', async route => {
  1098 |       if (route.request().method() === 'GET') {
  1099 |         await route.fulfill({
  1100 |           status: 200,
  1101 |           contentType: 'application/json',
  1102 |           body: JSON.stringify({
  1103 |             athleteName: 'Grant Test Athlete',
  1104 |             expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  1105 |             consentId: 'mock-grant-consent-id',
  1106 |             parentEmail: 'parent@example.com',
  1107 |           }),
  1108 |         });
  1109 |       } else if (route.request().method() === 'POST') {
  1110 |         await route.fulfill({
  1111 |           status: 200,
  1112 |           contentType: 'application/json',
  1113 |           body: JSON.stringify({ success: true }),
  1114 |         });
  1115 |       } else {
  1116 |         await route.fallback();
  1117 |       }
  1118 |     });
  1119 | 
  1120 |     await page.goto(`${BASE_URL}/consent/mock-grant-token`);
  1121 |     await page.waitForLoadState('networkidle');
  1122 |     await page.waitForTimeout(2_000);
  1123 | 
  1124 |     await page.click('button:has-text("Grant Permission")');
  1125 | 
  1126 |     // After a successful grant, the page transitions to the "Permission Granted" state
  1127 |     await page.waitForTimeout(2_000);
  1128 | 
  1129 |     await expect(
  1130 |       page.locator('text=Permission Granted'),
  1131 |       'Clicking "Grant Permission" must show a "Permission Granted" success screen'
  1132 |     ).toBeVisible();
  1133 | 
  1134 |     // The success screen should mention the athlete's name
  1135 |     await expect(
  1136 |       page.locator('text=Grant Test Athlete'),
  1137 |       'Success screen must reference the athlete name after granting consent'
> 1138 |     ).toBeVisible();
       |       ^ Error: Success screen must reference the athlete name after granting consent
  1139 | 
  1140 |     // A CTA to create a parent account should be present (per consent-confirmation.tsx)
  1141 |     const hasParentCta =
  1142 |       (await page.locator('text=Create Parent Account').count()) > 0 ||
  1143 |       (await page.locator('text=/monitor.*measurements|track.*progress/i').count()) > 0;
  1144 | 
  1145 |     expect(
  1146 |       hasParentCta,
  1147 |       'Permission Granted screen must offer a CTA to create a parent account'
  1148 |     ).toBe(true);
  1149 |   });
  1150 | 
  1151 |   test('clicking "Deny" shows denial confirmation screen', async ({ page }) => {
  1152 |     // Intercept GET to return valid token data, and POST to return success
  1153 |     await page.route('**/api/coppa/consent/verify/**', async route => {
  1154 |       if (route.request().method() === 'GET') {
  1155 |         await route.fulfill({
  1156 |           status: 200,
  1157 |           contentType: 'application/json',
  1158 |           body: JSON.stringify({
  1159 |             athleteName: 'Deny Test Athlete',
  1160 |             expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  1161 |             consentId: 'mock-deny-consent-id',
  1162 |             parentEmail: 'parent@example.com',
  1163 |           }),
  1164 |         });
  1165 |       } else if (route.request().method() === 'POST') {
  1166 |         await route.fulfill({
  1167 |           status: 200,
  1168 |           contentType: 'application/json',
  1169 |           body: JSON.stringify({ success: true }),
  1170 |         });
  1171 |       } else {
  1172 |         await route.fallback();
  1173 |       }
  1174 |     });
  1175 | 
  1176 |     await page.goto(`${BASE_URL}/consent/mock-deny-token`);
  1177 |     await page.waitForLoadState('networkidle');
  1178 |     await page.waitForTimeout(2_000);
  1179 | 
  1180 |     await page.click('button:has-text("Deny")');
  1181 | 
  1182 |     await page.waitForTimeout(2_000);
  1183 | 
  1184 |     await expect(
  1185 |       page.locator('text=Permission Denied'),
  1186 |       'Clicking "Deny" must show a "Permission Denied" confirmation screen'
  1187 |     ).toBeVisible();
  1188 | 
  1189 |     // The denial screen should mention the athlete's name and explain the consequence
  1190 |     await expect(
  1191 |       page.locator('text=Deny Test Athlete'),
  1192 |       'Denial screen must reference the athlete name'
  1193 |     ).toBeVisible();
  1194 | 
  1195 |     // Explanation that the account stays inactive
  1196 |     const hasDenialExplanation =
  1197 |       (await page.locator('text=/remain inactive|contact support/i').count()) > 0;
  1198 | 
  1199 |     expect(
  1200 |       hasDenialExplanation,
  1201 |       'Denial screen must explain that the account remains inactive and offer a contact path'
  1202 |     ).toBe(true);
  1203 |   });
  1204 | 
  1205 |   /**
  1206 |    * Expired token — HTTP 410 from the API.
  1207 |    *
  1208 |    * The page component maps status 410 → tokenStatus 'expired' → "Link Expired" card.
  1209 |    * This is a distinct visual state from "Invalid Link" (which maps to tokenStatus
  1210 |    * 'invalid' from a non-200/410/400 response).
  1211 |    */
  1212 |   test('expired consent token shows "Link Expired" state distinct from "Invalid Link"', async ({ page }) => {
  1213 |     await page.route('**/api/coppa/consent/verify/**', async route => {
  1214 |       if (route.request().method() === 'GET') {
  1215 |         await route.fulfill({
  1216 |           status: 410,
  1217 |           contentType: 'application/json',
  1218 |           body: JSON.stringify({ message: 'Token expired.' }),
  1219 |         });
  1220 |       } else {
  1221 |         await route.fallback();
  1222 |       }
  1223 |     });
  1224 | 
  1225 |     await page.goto(`${BASE_URL}/consent/mock-expired-token`);
  1226 |     await page.waitForLoadState('networkidle');
  1227 |     await page.waitForTimeout(3_000);
  1228 | 
  1229 |     // "Link Expired" is the title shown for tokenStatus === 'expired'
  1230 |     await expect(
  1231 |       page.locator('text=Link Expired'),
  1232 |       'Expired token (HTTP 410) must show the "Link Expired" heading'
  1233 |     ).toBeVisible();
  1234 | 
  1235 |     // The "Link Expired" state must NOT show the generic "Invalid Link" title
  1236 |     await expect(
  1237 |       page.locator('text=Invalid Link'),
  1238 |       '"Link Expired" state must NOT display the "Invalid Link" heading (distinct states)'
```