# E2E Test Suite Redesign Plan

> Status: **Proposed** · Author: engineering (with Claude) · Scope: fix the chronically-red CI **E2E Tests** job (~1,370 tests) at its architectural root.

## 1. Problem, with evidence

The CI E2E job has been red for a long time (baseline: **518 failed / 391 passed**). This is **not** ~500 individual bugs. It is a small number of architectural causes, confirmed with CI **server-log** evidence (not inference):

| Symptom (from CI server logs) | Meaning |
|---|---|
| `GET /api/auth/me` → **~38–50% 401** (e.g. 1580/4144) while `POST /api/auth/login` is ~1370×200 | Sessions are **created** on login but **inconsistently validated** afterward — session read-after-write instability |
| `GET /api/search/global` → **100% 401** in the shared-user runs | Auth-gated features fail whenever the shared session isn't honored |
| `GET /api/athletes` → 52×**429**, `/api/teams` → 35×**429** | Real rate-limiting: all specs hammer one endpoint from one IP as one user |
| Whole specs failing in identical counts across runs | A shared upstream cause (auth/data), not per-test logic |

**Root cause:** the entire suite shares **one admin user, one org, one session, one IP**. Under 4 parallel CI workers this produces session-validation collapse, single-user/single-IP rate-limit exhaustion, and cross-worker data pollution.

### What we already proved by experiment (PR #471)

Per-worker isolation (each worker = its own user/org) was implemented and run twice in CI:

- ✅ It **works** for the auth problem: `search 401` went **100% → 0%**, `auth/me 401` improved (~50% → ~31–38%), and worker logins became reliable (1380×200).
- ❌ But the overall count **regressed** (518 → **662**). Cause: **~100 specs assume a site-admin user in the shared org.** Running them as an *org_admin worker in an isolated org* breaks:
  - site-admin-only pages (`/organizations`, `/user-management`, `/admin`, site settings),
  - specs that read the shared `.e2e-test-config.json` org id,
  - the residual `auth/me` 401s (partly failed-worker specs, partly legit logout/unauth tests).

**Conclusion:** the fix is **per-worker isolation *plus* a two-audience auth model *plus* per-spec migration off the site-admin/shared-org assumptions.** Infra alone is net-negative.

---

## 2. Target architecture — two auth audiences

Split specs into two Playwright **projects**, each with the right session model:

### 2a. `org-worker` project (the majority, org-scoped specs)
- Each parallel worker authenticates as its **own** `e2e-worker-<parallelIndex>` user — an **org_admin** who belongs to **exactly one** org (`E2E Worker Org <i>`) with its own team + seeded athletes.
- Because the user is a non-site-admin in exactly one org, the client auto-selects that org context (`auth.tsx` "auto-select when the user has exactly one org").
- No shared session, no cross-worker data, no single-user session churn.

### 2b. `site-admin` project (the minority, site-admin + RBAC specs)
- Runs specs that genuinely need `isSiteAdmin` (`/organizations`, `/user-management`, `/admin`, global metrics/benchmarks) or that verify RBAC restrictions.
- Uses **one dedicated site-admin session**, and runs **serially** (`workers: 1` / `fullyParallel: false` for this project only) to avoid the session-churn 401s that plague a shared site-admin user under concurrency.
- RBAC-restriction specs keep the existing `test.skip(isSameUserMode(), …)` guard (already added) — they only run when distinct per-role users exist (a later enhancement).

### 2c. Rate limiting
- The E2E server must not rate-limit itself to death. Two options (pick one):
  - **Preferred:** make `shouldSkipRateLimiting` recognize the CI E2E server. Today it skips on `isLocalhost` (`req.ip` 127.0.0.1/::1) — but with `app.set('trust proxy', 1)` in CI the detected `req.ip` is often *not* loopback, so the skip misfires and only some limiters bypass. Fix `isLocalhost` detection (also treat `::ffff:127.0.0.1` and the configured E2E host) **or** add an explicit, production-safe `E2E_TEST_MODE=true` gate honored only when `DATABASE_URL` points at the ephemeral CI DB.
  - **Alternative:** raise the affected limiters (`authLimiter` = 5/15min is far too low for a test suite; the search/`STANDARD` = 100/15min shared across specs also trips).

---

## 3. File-by-file implementation

### 3.1 `tests/e2e/fixtures/e2e-base.ts` (exists on PR #471 — refine)
Worker-scoped auth for the `org-worker` project.
- Keep the hardened login (retries, wait-for-visible, submit via Enter).
- **Move the login into `global-setup` instead** (see 3.2): the fixture should just **read** the pre-created `playwright/.auth/worker-<i>.json`. Rationale: 6 concurrent fixture logins at run start contend; a single-threaded sequential login in global-setup is deterministic and avoids the button/lock timeouts that caused the regression.
  ```ts
  workerStorageState: [async ({}, use, workerInfo) => {
    const file = path.resolve(__dirname, `../../playwright/.auth/worker-${workerInfo.parallelIndex}.json`);
    if (!fs.existsSync(file)) throw new Error(`missing ${file} — global-setup did not create it`);
    await use(file);
  }, { scope: 'worker' }],
  ```

### 3.2 `tests/e2e/global-setup.ts` (exists on PR #471 — extend)
- Keep: create 6 `E2E Worker Org <i>` + `e2e-worker-<i>` (org_admin) + team + 3 seeded athletes (incl. a `Smith` for search specs). **Already implemented.**
- **Add:** after creating each worker's data, log that worker in **sequentially** (reuse the existing chromium browser it already launches) and save `playwright/.auth/worker-<i>.json`. Sequential = no login contention.
- Keep: the existing single site-admin `user.json` for the `site-admin` project.
- **Per-worker data must be self-contained:** stop writing a single shared `.e2e-test-config.json` org id that org-scoped specs read; instead specs should derive org/team/athletes from their own logged-in context (see 3.4).

### 3.3 `playwright.staging.config.ts` (CI config)
Replace the single `chromium` project with two:
```ts
projects: [
  { name: 'org-worker',  testMatch: ORG_SCOPED_SPECS,  use: { ...devices['Desktop Chrome'] } },      // storageState via e2e-base fixture
  { name: 'site-admin',  testMatch: SITE_ADMIN_SPECS,   fullyParallel: false, workers: 1,
    use: { ...devices['Desktop Chrome'], storageState: './playwright/.auth/user.json' } },
]
```
- Keep `testIgnore: '**/templates/**'`, `workers: 4` for `org-worker`.
- Derive `ORG_SCOPED_SPECS` / `SITE_ADMIN_SPECS` from the categorization in §4 (a glob list or a per-spec tag).

### 3.4 Spec migration (the bulk of the work — ~100 files)
For each spec, categorize (see §4) and then:
- **Org-scoped specs:** import `{ test, expect }` from `./fixtures/e2e-base` (already done for all 100 on #471). Then **remove shared-org assumptions**:
  - Replace hard-coded names (`Varsity`, a specific team, the shared `E2E Test Org`) with data the spec creates itself or reads from its own context.
  - Replace reads of `.e2e-test-config.json` org id with the current user's org (from the UI or `/api/auth/me/organizations`).
  - Multi-org specs (`athlete-org-switcher`) either create a second org for that worker at runtime or move to the `site-admin` project.
- **Site-admin/RBAC specs:** import from `@playwright/test` (keep the shared site-admin session), assign to the `site-admin` project. Keep the `isSameUserMode()` skip guards.

### 3.5 `tests/e2e/helpers/auth.ts`
- `loginAsDefaultUser` already returns early when the storageState session is valid → works unchanged for both projects. No change needed unless a spec needs an explicit per-worker re-login.

### 3.6 `tests/e2e/global-teardown.ts`
- Extend cleanup to remove the per-worker users/orgs/athletes (`e2e-worker-*`, `E2E Worker Org *`, `e2e-w<i>-*`). Fix the existing FK-ordering issue (delete `user_organizations`/`user_teams` for **all** E2E users before deleting the users, not just for the primary org).

### 3.7 App code (small, security-reviewed)
- Rate-limit skip fix (§2c). Keep the production safeguard: only bypass when the DB is the ephemeral CI test DB or an explicit E2E flag is set — never in real production.

---

## 4. Spec categorization (do this first — it drives everything)

Produce a table: for each of the ~100 specs, tag `org-scoped` vs `site-admin` vs `rbac` vs `multi-org`. Heuristics:
- **site-admin:** navigates to `/organizations`, `/user-management`, `/admin`, `/metrics`, `/benchmarks`, `/wellness-templates`; or asserts `isSiteAdmin` features. (e.g. `admin-*`, `organizations`, `user-management`, `wellness-templates`.)
- **rbac:** uses `loginAs(page, 'coach'|'athlete'|'org_admin')` to assert restrictions → keep `isSameUserMode()` skip (e.g. `permissions`, `sidebar-navigation` coach block).
- **multi-org:** needs the user in >1 org (`athlete-org-switcher`, org-switching) → runtime-create a 2nd org or move to a dedicated setup.
- **org-scoped (default/majority):** everything else → `org-worker` project.

This categorization is the single most important artifact; ~70% of specs should be plain `org-scoped` and "just work" once they stop reading the shared org config.

---

## 5. Residual issues to run down (with traces)

After the above, expect a much smaller failure set. Drive it to zero using **trace artifacts** (not guesses):
1. **`auth/me` residual 401s** — download the `site-admin` project traces; confirm whether remaining 401s are legit (logout/unauth tests) vs the serialized site-admin session still churning. If churning, investigate session-fixation/regeneration on repeated same-user login and consider a single long-lived site-admin session created once.
2. **Selector/text drift** already found and partially fixed (wellness tab `role=tab`, empty-state text "No templates match your filters", command-palette dialog-scoped `Athletes`). Sweep the rest from traces.
3. **cmdk/search specs** — confirm the seeded per-worker `Smith`/team satisfy `command-palette` (it needs a team named to match `Varsity` etc. — update the spec to search seeded names).

---

## 6. Rollout & validation (must have a fast loop)

**Blocking prerequisite:** an environment where the **production build server + Playwright** run persistently (a dev box, a container, or CI-with-SSH). Blind CI iteration (~1.8h/cycle) does **not** converge — proven twice.

Order of operations (each validated in the fast loop, then confirmed once in CI):
1. Land global-setup sequential per-worker logins + fixture-reads-file (§3.1–3.2). Validate: 6 `worker-<i>.json` produced; a handful of org-scoped specs pass as workers.
2. Add the two-project config (§3.3) + spec categorization (§4). Validate: `org-worker` and `site-admin` projects both run.
3. Rate-limit skip fix (§2c). Validate: no 429s in server log.
4. Migrate specs in batches by category; fix data/text drift from traces (§3.4, §5).
5. Teardown cleanup (§3.6).
6. Full CI green run.

**Definition of done:** one CI E2E run with **0 failures** (skips allowed for RBAC-in-same-user-mode).

---

## 7. What already exists (starting point)

- **PR #470** (merge): single-org context fix, athlete seeding, template exclusion, wellness `role=tab` selectors + empty-state text, command-palette readiness + dialog-scoped selector, RBAC same-user-mode skip guards. All CI-confirmed working.
- **PR #471** (spike — do not merge as-is): worker-scoped `e2e-base.ts` fixture, global-setup per-worker envs, all 100 specs migrated to the fixture. Proved per-worker fixes the auth-401s; regressed the count because the two-audience split and spec migration (§2b, §3.4) are not yet done.

## 8. Effort estimate
- Categorization (§4): 0.5 day.
- Infra (§3.1–3.3, §3.6, §3.7): 1–1.5 days.
- Spec migration + trace-driven fixes (§3.4, §5): 3–5 days (the long pole; ~100 specs), **contingent on a fast validation loop**. Without one, multiply by the CI cycle time.
