# Repository Guidelines

## Project Structure & Module Organization
AthleteMetrics uses npm workspaces: `packages/web` (Vite + React UI), `packages/api` (Express service), and `packages/shared` (schema + utilities). Database sources stay in `drizzle/` and `migrations/`, automation helpers in `scripts/`, and generated bundles in `dist/`. Specs and mocks live in `tests/`, Playwright assets in `playwright/`, and reference docs in `docs/`.

## Build, Test, and Development Commands
- `npm install` – install workspace dependencies.
- `npm run dev` – boot the API (`tsx packages/api/index.ts`); run `npm run dev -w @athletemetrics/web` for the front end.
- `npm run build` – build both workspaces into `dist/`.
- `npm run check` – strict TypeScript project check.
- `npm run db:push` / `npm run db:migrate` – push Drizzle schema or run SQL migrations.
- `npm test`, `npm run test:unit`, `npm run test:integration` – Vitest suites (unit needs no DB, integration enforces a local `DATABASE_URL`).
- `npm run test:testing` / `npm run test:staging` – Playwright flows bound to the corresponding config.

## Coding Style & Naming Conventions
TypeScript is required across workspaces; keep `tsconfig.json` strict mode clean. Use two-space indentation and ES modules. Components stay PascalCase, hooks/utilities camelCase, and specs use `*.test.ts(x)` under `__tests__`. Prefer the `@/` and `@shared/` aliases and keep Tailwind utilities centralized in `packages/web/src/index.css`.

## Testing Guidelines
Keep quick unit suites next to the feature (`packages/*/__tests__`) and scenario-heavy cases under `tests/`. Name files after the feature (`analytics.dashboard.test.ts`) and reuse factories from `tests/setup`. Playwright specs belong to `tests/e2e`; choose the right config (`playwright.testing.config.ts` vs `playwright.staging.config.ts`) and document which one ran. Never point tests at staging or production: copy `.env.test.example`, create a disposable local Postgres database, run `npm run db:migrate`, and seed via `scripts/run-migrations.js`.

## Commit & Pull Request Guidelines
Git history follows Conventional Commit prefixes such as `feat:`, `fix:`, and `refactor:` with optional GitHub issue references. Keep commits focused and written in the imperative. PRs should supply a summary, linked issue, UI screenshots/GIFs when relevant, migration/env notes, plus a checklist of validations (`npm run test:unit`, `npm run test:integration`, Playwright config used).

## Security & Configuration Tips
Create `.env.local`/`.env.test` from the provided examples before starting. Always set `DATABASE_URL`, `SESSION_SECRET`, and `NEON_TIER`; the API refuses to boot without them. Run `npm run prestart` in new environments so Drizzle migrations apply prior to `npm start`. Call out modifications under `packages/api/auth`, `storage.ts`, or `ocr/` because they frequently involve credentials or PII.
