# Euclio — Session State

> Reconciliation log for resuming across machines/sessions. Read after `CLAUDE.md`.
> Last reconciled: 2026-08-03 (M5: facts + note view complete).

## Milestone summary

- **M0 skeleton** — DONE. Next.js + Prisma + Clerk + Sentry + `/api/health` + empty authed dashboard. Deployed on Railway at https://euclio-production.up.railway.app.
- **Add client + workflow** — DONE. `createClient` + `createWorkflow` server actions, token generation, dashboard renders client list with workflows.
- **Ping ingest** — DONE. `POST /api/ping/[token]` + `GET /api/ping/[token]` (GET delegates to POST). Rate-limited, 2KB cap, idempotent, `lastPingAt` updated, status untouched. Sentry log delivery confirmed via MCP.
- **M3 watcher** — DONE. `worker/index.ts`, `worker/watcher.ts`, `worker/purge.ts`, `worker/deadmans.ts` with reconciliation-based heartbeat monitoring, debounce (2 min default), dead-man's-switch ping, and nightly purge. Simulate failure action in dashboard. Full test coverage in `worker/__tests__/`.
- **M4 alert email** — DONE. `lib/mailer.ts` (Resend wrapper, degrades gracefully on missing key). `Incident.alertedAt` column added (migration `20260802230145_add_incident_alerted_at`). Alert wired into watcher (heartbeat open + retry on each tick for unalerted open incidents) and `/fail` route (explicit_fail open). Idempotent per incident via `alertedAt`. Email content: facts only — client name, workflow name, "missed check-in at <time>" or "reported a failure at <time>", dashboard link. No errorText, no severity words. 14/14 tests pass (`worker/__tests__/alert.test.ts` + existing suites).
- **M5 facts + note view** — DONE. `lib/facts.ts` (pure function, both fact shapes, timezone-aware, zero deps). `lib/__tests__/facts.test.ts` (102 tests: both shapes, duration formatting, timezone, banned words × 4 fixtures, structural firewall). Incident detail page at `/dashboard/incidents/[id]`: facts lines, event timeline, freelancer-only diagnostic panel (errorText, amber border, "redacted · ttl 30d"), mark-resolved form with optional note, simulate-failure still works. Dashboard updated with incident links (amber "View incident →" on down workflows). Design system adopted globally: Spectral/Instrument Sans/IBM Plex Mono fonts, paper/lift/rail/ink/amber/green/hair tokens in `globals.css`. `resolveIncident` server action added to `actions.ts`.

> **Step 0 — M4 Railway verification:** VERIFIED 2026-08-03. Fired `/fail` → one email arrived at sergiolombana101@gmail.com (subject: "reported a failure at…"). Resolved incident, ran Simulate failure → one "missed a check-in" email arrived after watcher tick (~2 min). Both shapes confirmed. Resend domain `euclio.io` verified (Namecheap DNS). `RESEND_FROM_ADDRESS` and `APP_URL` set in Railway on both web and worker services.

> Full milestone detail archived in `docs/session-history.md`.

## Open threads / decisions needed

- [x] ~~**Step 0 — M4 Railway live verification**~~ — VERIFIED 2026-08-03. Both email shapes confirmed live.
- [x] ~~**RESEND_FROM_ADDRESS**~~ — set in Railway (web + worker). `euclio.io` domain verified in Resend.
- [x] ~~**APP_URL**~~ — set in Railway (web + worker).
- [ ] **Clerk PRODUCTION instance** (before real launch): current keys are a Clerk DEV instance. Needs own keys + custom Google OAuth credentials in Railway env.
- [ ] **Rebrand Google OAuth consent → "Euclio"** (deferred to production-instance setup).
- [ ] **Minor — pg SSL mode warning:** `sslmode=require` semantics change in pg v9. No action now; revisit if pg is bumped.
- [ ] **Multi-machine onboarding bootstrap** (still open): manual Railway CLI + `railway variables` pull works but isn't scripted. Worth a bootstrap script before a third machine needs onboarding.
- [ ] **alert.test.ts test #4 cross-file flake**: when the full suite runs, test #4 ("Throwing mailer: reconcile loop continues") occasionally gets 2 incidents instead of 1 for workflow1 because `reconcile()` processes ALL workflows in the DB and picks up data from other test files. Passes in isolation (`npm test -- worker/__tests__/alert.test.ts`). Fix: scope the test's `reconcile()` call to only the test's own workflows, or add a `beforeEach` that deletes all workflows outside the test account. Low priority — doesn't affect correctness of the watcher logic.
- [x] ~~GET handler on `/api/ping/[token]`~~ — added; GET delegates to POST.
- [x] **M2: `/api/ping/[token]/fail` route** — done. Opens incident immediately (no debounce), with optional scrubbed error text. Includes re-fail suppression (6-hour window). Supports both GET and POST for consistency with main ping endpoint.
- [x] **M2: `scrub.ts`** — done. Truncates to 200 chars, then pattern-redacts API keys (Stripe sk_live_, pk_live_, etc.), Bearer tokens, emails, credit card numbers. Runs server-side at ingest for /fail payloads.
- [x] **M2: `IncidentSource.explicit_fail`** — done. Added to schema enum (line 43). Watcher never opens/resolves these incidents; only the /fail route manages them.
- [x] **M3: node-cron watcher** — done. `worker/index.ts`, `worker/watcher.ts`, `worker/purge.ts`, `worker/deadmans.ts`. Reconciliation-based, debounce (2 min default), dead-man's-switch ping, nightly purge of aged errorText. Full test coverage in `worker/__tests__/`.
- [x] **M3: Simulate failure** — done. `app/dashboard/simulate-failure-form.tsx` + `simulateFailure` action in `actions.ts`. Sets `lastPingAt` in the past so watcher sees it as overdue on next tick.
- [x] **M4: Alert email** — done. `lib/mailer.ts`, `Incident.alertedAt`, wired into watcher + /fail route. 14/14 tests pass.
- [x] **M5: facts.ts** — done. Pure function, both shapes, timezone-aware, 102 tests pass including banned-words fixture and structural firewall.
- [x] **M5: Incident detail page** — done. `/dashboard/incidents/[id]`, facts lines, event timeline, diagnostic panel, resolve form, simulate-failure.
- [x] **M5: Design system** — done. Spectral/Instrument Sans/IBM Plex Mono + paper/lift/rail/ink/amber/green/hair tokens adopted globally in `globals.css` + `layout.tsx`.

## Fixes applied this session (sanity pass)

- **`lib/prisma.ts`**: was importing `PrismaClient` from `@prisma/client` (default location) instead of `@/generated/prisma/client` (custom output). Fixed. Also removed invalid `$on('error', ...)` call (not valid in Prisma 7 with driver adapter).
- **`vitest.config.mts`**: added `fileParallelism: false` — `reconcile()` processes ALL workflows in the DB, so parallel test files race on each other's test data.
- **`worker/__tests__/watcher.test.ts`**: added `vi.mock("@/lib/mailer")` so watcher tests don't trigger Resend calls.

## Environment

### Both machines
- Node 22 via `nvm` (`.nvmrc` pins it). New shells start on system Node — always run `nvm use` first.
- `.env.local` exists (gitignored), real values pulled from Railway via `railway variables --json`.
- Dev and prod share one Neon DB (`ep-flat-sound-awealxsh`). One-DB rule holds.

### Laptop
- Node `v22.21.1`. `nvm default` points to Node 20.
- `npm run build` warns "Detected additional lockfiles" — benign.

### Second machine
- Node `v22.23.1`. Railway CLI installed at `~/.railway/bin`.

## Anchor-file reconciliation
- `CLAUDE.md` → `## Topology` section present. ✓
- `prisma/schema.prisma` → `clerkOrgId String? @unique`, Prisma 7 generator, no `url` in datasource, `Incident.alertedAt DateTime?` present. ✓
- `prisma migrate status` → up to date against Neon. ✓
- `lib/facts.ts` → pure function, no DB imports, no errorText reference in code. ✓
- `lib/__tests__/facts.test.ts` → 102 tests, all pass in isolation. ✓
