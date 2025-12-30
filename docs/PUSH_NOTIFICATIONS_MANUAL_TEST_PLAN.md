# Push Notifications Manual Test Plan

This document outlines manual testing procedures for the push notification system. These tests complement automated test coverage and verify end-to-end functionality that requires human interaction or visual verification.

## Prerequisites

Before testing:
1. Deploy to a testing environment with HTTPS (push requires secure context)
2. Ensure VAPID keys are configured (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)
3. Have test accounts ready for: athlete, coach, org_admin, site_admin
4. Use browsers that support Web Push: Chrome, Firefox, Edge, Safari 16+

---

## Test Environment Setup

| Environment | URL | Notes |
|-------------|-----|-------|
| Testing | https://testing.athletemetrics.app | Use for destructive tests |
| Staging | https://staging.athletemetrics.app | Use for pre-production validation |

---

## 1. Push Permission Flow

### 1.1 First-Time Permission Prompt
**Precondition:** User has never been prompted for push notifications

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as any user role | Dashboard loads |
| 2 | Wait 5 seconds | Permission prompt appears in bottom-right |
| 3 | Verify prompt content | Shows "Enable Push Notifications" with enable/dismiss buttons |
| 4 | Click "Enable" | Browser's native permission dialog appears |
| 5 | Grant permission | Success toast appears, prompt disappears |
| 6 | Check Notification Settings page | Shows "Push notifications enabled" with device listed |

### 1.2 Permission Denied Handling
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as new user | Permission prompt appears after delay |
| 2 | Click "Enable" | Browser permission dialog appears |
| 3 | Click "Block" in browser dialog | Prompt disappears, no error shown |
| 4 | Navigate to Notification Settings | Shows "Push notifications blocked" message with instructions |

### 1.3 Dismiss with Cooldown
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as new user | Permission prompt appears |
| 2 | Click "Not Now" | Prompt disappears |
| 3 | Refresh page | Prompt does NOT reappear |
| 4 | Check localStorage | `push_prompt_dismissed` timestamp is set |
| 5 | Wait 7 days (or manually clear localStorage) | Prompt appears again on next login |

---

## 2. Notification Settings UI

### 2.1 User Preferences Page
**Path:** Settings → Notification Settings

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Notification Settings | Page loads with preference toggles |
| 2 | Toggle "Wellness Survey Requests" OFF | Toggle updates, save confirmation shown |
| 3 | Refresh page | Toggle remains OFF (persisted) |
| 4 | Toggle "Email Notifications" master switch OFF | All email sub-toggles become disabled |
| 5 | Set quiet hours: 22:00 - 07:00 | Saves successfully |
| 6 | Verify timezone dropdown | Shows user's detected timezone |

### 2.2 Device Management
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enable push on Chrome desktop | Device appears in list as "Chrome - Windows" (or similar) |
| 2 | Enable push on mobile device | Second device appears in list |
| 3 | Click "Remove" on first device | Confirmation dialog appears |
| 4 | Confirm removal | Device removed from list |
| 5 | Verify on removed device | Push no longer works on that device |

### 2.3 Test Notification
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Send Test Notification" button | Button shows loading state |
| 2 | Wait 2-3 seconds | Push notification appears on device |
| 3 | Verify notification content | Title: "Test Notification", Body: "Push notifications are working!" |
| 4 | Click the notification | App opens/focuses, navigates to dashboard |

---

## 3. Wellness Survey Notifications

### 3.1 Coach Sends Wellness Request
**Precondition:** Athlete has push enabled, coach and athlete in same org

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as coach | Dashboard loads |
| 2 | Navigate to Wellness → Send Request | Request form appears |
| 3 | Select athlete(s) and template | Form populated |
| 4 | Click "Send Request" | Success message, push sent indicator |
| 5 | Check athlete's device | Push notification received within 5 seconds |
| 6 | Verify notification content | Title mentions wellness survey, body has coach's name |
| 7 | Click notification | Opens wellness survey form |

### 3.2 Notification Respects User Preferences
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As athlete, disable "Wellness Survey Requests" in settings | Toggle saved |
| 2 | As coach, send wellness request to same athlete | Request sent successfully |
| 3 | Check athlete's device | NO push notification received |
| 4 | Verify in notification history | Entry shows "skipped - user preference" |

### 3.3 Quiet Hours Enforcement
**Precondition:** Athlete has quiet hours set (e.g., 22:00 - 07:00)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | During quiet hours, send wellness request | Request sent |
| 2 | Check athlete's device | NO push notification immediately |
| 3 | Check notification history | Shows "deferred - quiet hours" |
| 4 | After quiet hours end | Notification is NOT automatically sent (deferred notifications are not queued) |

---

## 4. Wellness Digest Notifications

### 4.1 Daily Digest Delivery
**Precondition:** Org has at-risk athletes, coach has digest enabled

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify org digest time in settings | Shows configured time (e.g., 07:00) |
| 2 | Wait for digest time (or trigger manually via admin) | - |
| 3 | Check coach's device at digest time | Push notification received |
| 4 | Verify notification content | Shows count of red/yellow athletes |
| 5 | Click notification | Opens Wellness Analytics page |

### 4.2 Skip Weekends Setting
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | As org admin, enable "Skip Weekends" | Setting saved |
| 2 | On Saturday/Sunday at digest time | NO digest sent |
| 3 | On Monday at digest time | Digest sent normally |

---

## 5. Organization Admin Settings

### 5.1 Org Notification Settings Page
**Path:** Organization Settings → Notifications

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as org_admin | Can access org notification settings |
| 2 | Toggle "Push Notifications Enabled" OFF | All users in org stop receiving push |
| 3 | Toggle back ON | Push resumes for org users |
| 4 | Set digest time to 08:30 | Saves, digest will send at new time |
| 5 | Change timezone to "America/Los_Angeles" | Saves correctly |

### 5.2 Org Analytics
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to org notification analytics | Stats page loads |
| 2 | Verify metrics shown | Total sent, delivered, failed, click-through rate |
| 3 | Check "By Type" breakdown | Shows wellness_survey, team_announcement, etc. |
| 4 | Change date range to 7 days | Stats update |

---

## 6. Site Admin Controls

### 6.1 Global Kill Switch
**Path:** Admin → Site Settings → Notifications

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as site_admin | Can access admin notification settings |
| 2 | Toggle "Push Notifications Enabled" OFF | Confirmation dialog appears |
| 3 | Confirm disable | All push notifications platform-wide stop |
| 4 | Try sending wellness request as coach | Push not sent (but request still works) |
| 5 | Toggle back ON | Push resumes for all orgs |

### 6.2 Platform Analytics
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to admin notification analytics | Platform-wide stats load |
| 2 | Verify summary metrics | Total subscriptions, users with preferences, orgs with custom settings |
| 3 | Check 30-day stats | Notifications by status, by type, click-through rate |
| 4 | View recent notifications list | Shows last 10 notifications sent |

### 6.3 Emergency Broadcast
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Admin → Broadcast | Broadcast form appears |
| 2 | Enter title: "System Maintenance" | Field accepts input |
| 3 | Enter body: "Scheduled maintenance tonight at 10pm" | Field accepts input |
| 4 | Check "Urgent" checkbox | Notification will require interaction |
| 5 | Click "Send Broadcast" | Confirmation dialog appears |
| 6 | Confirm send | Progress indicator shows, then success message |
| 7 | Check multiple user devices | All users with push enabled receive notification |

---

## 7. Cross-Browser Testing

### 7.1 Browser Compatibility Matrix

| Browser | Version | Push Support | Test Status |
|---------|---------|--------------|-------------|
| Chrome | 80+ | ✅ Full | ⬜ |
| Firefox | 72+ | ✅ Full | ⬜ |
| Edge | 80+ | ✅ Full | ⬜ |
| Safari | 16+ | ✅ Full (macOS Ventura+) | ⬜ |
| Safari iOS | 16.4+ | ✅ Requires PWA install | ⬜ |
| Chrome Android | 80+ | ✅ Full | ⬜ |
| Samsung Internet | 14+ | ✅ Full | ⬜ |

### 7.2 Safari-Specific Testing
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open app in Safari on macOS Ventura+ | App loads |
| 2 | Click "Add to Dock" or install as PWA | App installs |
| 3 | Open installed PWA | Permission prompt appears |
| 4 | Grant permission | Push works in Safari |

### 7.3 iOS PWA Testing
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open app in Safari on iOS 16.4+ | App loads |
| 2 | Tap Share → Add to Home Screen | App installs to home screen |
| 3 | Open app from home screen | Runs in standalone mode |
| 4 | Navigate to notification settings | Can enable push |
| 5 | Send test notification | Notification appears in iOS notification center |

---

## 8. Error Handling

### 8.1 Network Failure
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enable push notifications | Works normally |
| 2 | Disconnect network (airplane mode) | - |
| 3 | Try to send test notification | Error message shown (not silent failure) |
| 4 | Reconnect network | Next notification works |

### 8.2 Expired Subscription
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Clear browser data (but keep app open) | Subscription invalidated |
| 2 | Send notification to user | Server receives 410 Gone |
| 3 | Check device list | Expired device auto-removed |
| 4 | Re-enable push | New subscription created |

### 8.3 VAPID Not Configured
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Deploy without VAPID keys | App starts normally |
| 2 | Try to enable push | Friendly error: "Push notifications not configured" |
| 3 | Check server logs | Warning about missing VAPID configuration |

---

## 9. Performance Testing

### 9.1 High Volume
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send wellness request to 50+ athletes | All requests sent within 10 seconds |
| 2 | Check notification history | All entries logged |
| 3 | Monitor server logs | No timeout errors |

### 9.2 Broadcast Load
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send broadcast to all users (100+) | Completes within 30 seconds |
| 2 | Check results | Shows successful/failed counts |
| 3 | Spot-check 5 users | All received notification |

---

## Test Sign-Off

| Test Section | Tester | Date | Pass/Fail | Notes |
|--------------|--------|------|-----------|-------|
| 1. Permission Flow | | | | |
| 2. Settings UI | | | | |
| 3. Wellness Notifications | | | | |
| 4. Wellness Digest | | | | |
| 5. Org Admin Settings | | | | |
| 6. Site Admin Controls | | | | |
| 7. Cross-Browser | | | | |
| 8. Error Handling | | | | |
| 9. Performance | | | | |

---

## Known Limitations

1. **iOS requires PWA installation** - Push notifications on iOS Safari only work when the app is installed to the home screen
2. **Safari permission UI differs** - Safari shows a different permission prompt than Chrome/Firefox
3. **Quiet hours don't queue** - Notifications during quiet hours are skipped, not deferred
4. **No retry for failed notifications** - Failed push attempts are logged but not automatically retried

---

## Appendix: Useful Debug Commands

```bash
# Check VAPID configuration
echo $VAPID_PUBLIC_KEY | head -c 20

# View recent push subscription records (Railway)
PGPASSWORD="..." psql -h ... -c "SELECT id, user_id, device_name, created_at FROM push_subscriptions ORDER BY created_at DESC LIMIT 10;"

# View notification history (Railway)
PGPASSWORD="..." psql -h ... -c "SELECT id, type, delivery_status, sent_at FROM notification_history ORDER BY sent_at DESC LIMIT 10;"

# Trigger manual digest for an org (via API)
curl -X POST https://testing.athletemetrics.app/api/admin/wellness-digest/trigger \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{"orgId": "org-uuid-here"}'
```
