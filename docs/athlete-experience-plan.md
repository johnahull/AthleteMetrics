# Athlete Experience Enhancement Plan

## 1. Audit Current Athlete Flow
- Trace the redirect in `packages/web/src/pages/dashboard.tsx:134-139` and document the page athletes land on, including available actions and missing APIs for goals or comparisons.
- Inventory the data returned by `/api/measurements` and `/api/athletes/:id` to confirm fields needed for sparklines, percentile badges, and team comparisons are present; note any backend gaps.
- Capture screenshots or notes on empty states, contact cards, and the measurement table so changes can be measured against the baseline.

## 2. Prototype UX Adjustments
- Sketch a dedicated athlete dashboard surface with a hero summary (latest result vs goal), sparkline cards (Fly-10, Vertical), upcoming assessments, and CTA tiles for “Request Feedback” or “Download Report”.
- Extend the athlete profile layout to include a comparisons panel (team averages, percentile badges) and annotate where new analytics data will plug in.
- Define a reusable athlete-actions module (message coach, schedule retest, share profile link) plus new empty-state copy that nudges athletes to log their first measurement.
- Align prototypes with stakeholders to validate layout and language before coding.

## 3. Implement & Validate
- Frontend: add the athlete dashboard route/components, integrate new chart widgets or hooks (e.g., `useAthleteTrends`), and enhance `athlete-profile.tsx` with visual summaries, comparisons, and action buttons while respecting permissions.
- Backend: expose comparison/goal APIs (e.g., `GET /api/athletes/:id/comparison`) and lightweight endpoints for feedback requests, ensuring they are scoped to the authenticated athlete.
- Testing: add Vitest coverage for new hooks/components, integration tests for comparison endpoints, and Playwright specs for the athlete dashboard flow; verify responsive layouts and CTA-rich empty states.
- Share screenshots/GIFs plus a usability checklist in the PR so reviewers can confirm the improved athlete journey.
