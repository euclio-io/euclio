# Euclio MVP — Implementation Plan for Claude Code

Goal: the thin loop a design partner can actually **validate with**, deployed. Built with Claude Code, in vertical slices, each testable before the next. Stack: **Stack A (own the watcher on Railway)**, Node/TypeScript. This version incorporates the full-plan inversion review — the DoD now runs all the way to the client, value is visible without waiting for a real failure, and recruitment runs in parallel.

---

## Two tracks, starting now — not build-then-recruit

**Track 1 (code):** the milestones below.
**Track 2 (recruitment, non-code, starts today):** warm 3–5 design partners off the landing page + the concierge/design-partner offer, ~one conversation a week, so the first partner is ready when the loop is. The build must **not** gate the conversation. The single most likely way this whole effort fails is going heads-down for weeks and surfacing with no one to show it to.

---

## The strategy in one paragraph

Give Claude Code a strong `CLAUDE.md` up front, then build in **vertical slices** — each a working end-to-end piece you can test, not a horizontal layer. Deploy at M0 with error tracking so "does it deploy / is it throwing" is never a mystery. Own the watcher as a deterministic always-on process (the scheduler is the product). Two things the review made non-negotiable: **value must be visible without waiting for a real outage** (a simulate path + an all-green baseline), and **the loop must reach the client** (compose + send), because the open question you're validating is whether the *client* values it. Write real tests only for the pieces with actual logic — the watcher (reconcile + debounce) and the honesty module. Keep the skip list in front of it; it will try to add features.

---

## Stack (Stack A — chosen)

- **Next.js (App Router, TypeScript)** as a long-running server (not serverless).
- **Railway** — one project, two services off one repo: a **web** service (Next.js) and a small **worker** (the watcher). No sleep, native workers.
- **Neon** — managed Postgres; never-paused free tier, stays warm.
- **Prisma v7** — schema + migrations + typed queries.
- **node-cron** — the watcher's in-process scheduler in the worker.
- **Clerk** — auth (auto-create an Account per signup; do NOT force a Clerk Org yet). **Resend** — the one transactional email (alert to the freelancer). **Sentry** — error tracking on Euclio itself, from M0.

One repo, one host, one DB, one language. No serverless cron, no queue, no Docker, no microservices.

**Topology — modular monolith split by reliability tier (see the stack-decision doc).** Two Railway processes off one repo + one DB: a **web** service (dashboard + compose + auth + ingest) and a **watcher** worker. Keep **ingest a clean, self-contained module** — it rides in the web service now but must be extractable into its own always-up process (a lift-and-shift, not a rewrite), because ingest must-be-up while the UI is what you deploy constantly. Extract it only when you run >1 web instance or UI deploys start threatening ping reliability. Never merge ingest into the watcher (the watcher stays a pure internal loop, no public surface), and never split the database.

*(Run the cron in-process for the first slices; split it into the separate worker service before you ever run 2 instances, so the tick can't double-fire.)*

---

## The watcher non-negotiables (a monitoring tool's scheduler is the product)

1. **Reconciliation, not ticks.** Each run processes every workflow *overdue since the last successful check*, idempotently. A missed or duplicated run is then harmless.
2. **Debounce — or it cries wolf.** Require a minimum sustained-down duration before opening an incident; never re-open storms on a flapping workflow. A monitor that spams alerts gets muted, and a muted monitor is dead. This is tested time-logic.
3. **A dead-man's-switch on the watcher itself — trust-critical, not hygiene.** Every run, the watcher pings an external monitor (Healthchecks.io / cron-job.org). During a live trial, a Euclio outage that misses a real incident is *worse than no tool* — it's the exact failure you sell against, happening to your validator. This is Euclio watching Euclio with the heartbeat it sells.
4. **Ingest dead-simple, fast, idempotent** — and rate-limited, with a size-capped payload. Accepts **GET and POST** (removes a whole class of "which method?" setup mistakes). Two routes: `/api/ping/[token]` (success beat) and `/api/ping/[token]/fail` (explicit failure).
5. **Two detection paths, different rules.** *Silence* (missed heartbeat) is the watcher's job and is **debounced**. An *explicit `/fail` ping* is unambiguous and opens an incident **immediately via the ingest path — no debounce** — with a **re-fail suppression window** (an incident opened by `/fail` doesn't re-alert if it re-fails within N hours of resolving; an intermittently failing script must not recreate the alert storm on the path debounce doesn't cover). This suppression is tested time-logic, same tier as debounce.
6. **Nightly TTL purge.** The watcher worker NULLs `Incident.errorText` older than 30 days (the diagnostic ages out; the incident fact persists forever).

---

## Integration mechanism (decided — see the ingestion decision doc for the full inversion)

- **Platforms (n8n / Make / Zapier):** one native HTTP module, end of workflow → success URL. Optional second paste in the platform's error handler (n8n Error Workflow / Make error route) → `/fail` URL, mapping the **error message field only, never the full execution payload**. The workflow page shows per-workflow coverage honestly: "heartbeat ✓ / error reporting —" so nobody believes they have error detection when they only wired silence detection. (Zapier note: Webhooks by Zapier is a Premium app; free-tier users are structurally excluded by Zapier itself — a docs sentence, not a build item.)
- **Custom scripts: NO SDK, no published package.** A copy-paste snippet per language (curl / Node / Python), generated in the dashboard with the token pre-filled: wrapped in try/catch (an Euclio outage can never crash the client's automation), short timeout (~3–5s), **awaited, not fire-and-forget** (serverless runtimes freeze before a dangling promise sends), zero dependencies. The catch-block pings `/fail`. Plus a "copy for your coding agent" tab — a one-paragraph instruction block for Claude Code / Cursor.
- **Snippet presentation is productized, not raw:** token pre-filled, per-language tabs, a one-line data manifest ("this sends: your workflow token + a timestamp — nothing else" / the diagnostics variant when opted in), and the live ✓ confirmation. Full inspectability is the trust story: the freelancer can show their client every line they added and exactly what it sends.
- **`npx euclio-init` is a fast-follow**, not the MVP mechanism. A public GitHub repo of the snippets (credibility furniture without a dependency) is a cheap later add.

---

## Data model — see `schema.prisma`

Full schema in `schema.prisma` (inversion-tested). Key invariants, also in `CLAUDE.md`: scope **every** query by `accountId` (a cross-tenant leak is the highest-severity bug); the watcher never writes `healthy` for a span it didn't observe; `Note` and `ClientUpdate` bodies are always human-authored; Client and Workflow are soft-deleted, never hard-deleted. **Account is auto-created per signup** (solo = its own account); Clerk-Org-backed membership is added only when agencies actually arrive. `Ping.payload` is for a small non-sensitive metric only — never customer PII.

---

## The honesty-critical modules (now three, all unit-tested)

```ts
// facts.ts — the ONLY place client-facing text is generated.
factsForIncident(workflowName, source, stoppedAt, resumedAt?) => string[]
// heartbeat:     ["Booking sync stopped checking in at 9:02am", "Back at 9:14am · 12 min"]
// explicit_fail: ["Booking sync reported a failure at 9:02am", "Back at 9:14am · 12 min"]
// NEVER emits "brief", "minor", "hiccup", "smoothly", "nothing was missed",
//   "no impact", or any how-bad language.
// NEVER includes Incident.errorText — the diagnostic is freelancer-only, structurally.
```

```ts
// scrub.ts — one pure function, shared by snippet-generation AND server ingest.
scrub(raw: string) => { text: string; redacted: boolean }
// 1) truncate to ~200 chars FIRST (truncation is the strongest scrub — most
//    secrets die at the cap), 2) pattern-redact: api keys (sk-..., bearer
//    tokens), emails, card-number shapes. Layered: runs client-side inside the
//    generated snippet, then AGAIN at ingest (the server pass is the only scrub
//    for platform-sourced /fail pings, and the only one you can ever upgrade).
```

Tests: facts.ts (times/durations render correctly; banned-words assertion — including a fixture for the `reported a failure` shape) and scrub.ts (a fixture list of secret shapes gets redacted; truncation-first order holds). Same tier as the watcher's time-logic. These tests are the honesty and data principles in CI.

**Copy rule that follows from the layering:** never claim "we catch everything." The honest claim is: *off by default; when on, error text is truncated and redacted before it leaves the machine it runs on, scrubbed again on arrival, capped, and deleted after 30 days.* Platform variant: *on platforms, redaction happens on arrival, before anything is stored.*

---

## Milestones (vertical slices, in order — each deployable and testable)

**M0 · Skeleton + deploy + observability.** Next.js + Prisma + Clerk on Railway against Neon; **Account auto-created per signup** (with owner User); **Sentry + structured logging** wired; `/api/health`; empty authed dashboard live; a smoke-test harness. *Test: sign in → empty dashboard on a real URL; a thrown error shows in Sentry.*

**M1 · Add client + workflow + self-verifying setup.** Forms to add a client/workflow; unique token; **per-platform snippets** (n8n / Make / Zapier HTTP module instructions) + **per-language safety-baked snippets** (curl / Node / Python: try/catch, ~3–5s timeout, awaited, zero deps, catch-block → `/fail`) + a **"copy for your coding agent" instruction block**; a per-workflow **"capture error details" checkbox (default OFF)** that changes which snippet is generated; **optional error-handler snippets** (`/fail` for n8n Error Workflow / Make error route — error message field only); a **coverage indicator** per workflow ("heartbeat ✓ / error reporting —"); a **"send a test ping" step with a live "✓ received" confirmation** so setup is verified, not silently broken. *Test: paste the snippet, fire it, see the ✓; toggle diagnostics and watch the snippet change.*

**M2 · Ping ingest + status.** `/api/ping/[token]` and `/api/ping/[token]/fail`, **GET and POST** — idempotent, fast, **rate-limited, payload size-capped**. Records `lastPingAt` (+ Ping with `kind`). **`scrub.ts` runs on every /fail payload at ingest** (truncate-first, then redact; set `errorRedactedByServer` when the server pass catches something); scrubbed text is held for the incident. Workflow list shows status + last-seen. *Test: ping → healthy/last-seen; /fail with a fake `sk-live-...` key in the body → stored text is redacted.*

**M3 · Watcher (worker) + incidents.** node-cron worker: **reconcile** + **debounce** (min sustained-down before opening; no re-open storms) → open Incident (`source: heartbeat`) once; resolve on return; **ping the dead-man's-switch each run**; **nightly TTL purge** (NULL `errorText` older than 30 days — never delete the Incident). Plus: **an explicit `/fail` ping opens an Incident (`source: explicit_fail`) immediately via the ingest path — no debounce — with a re-fail suppression window** (no re-open/re-alert if it re-fails within N hours of resolving), attaching scrubbed `errorText` when the workflow opted in. Plus a **"simulate a missed check-in"** action so the whole flow can be triggered on demand (demo + partner's first "aha"). *Test: overdue → red + incident (after debounce); ping → resolves; /fail → incident opens instantly; repeated /fail on an open incident → no storm; fail-resolve-fail inside the suppression window → no re-alert; stop the worker → dead-man's-switch alerts; flapping → no alert storm; aged errorText purged, incident intact.*

**M4 · Alert email.** On incident open (either source), Resend one email to the freelancer, idempotent per incident. *Test: force a down → receive it once; force a /fail → receive it once.*

**M5 · Facts + note view.** Incident detail renders `factsForIncident(...)` as lines (heartbeat: "stopped checking in"; explicit_fail: "reported a failure") + **the scrubbed `errorText` in a clearly freelancer-only diagnostic panel** + a note field (human-authored) + "mark resolved." `errorText` never enters facts output or anything composable into a ClientUpdate. *Test: see facts, see the diagnostic, add a note, save; confirm the diagnostic is absent from the compose flow.*

**M5.5 · Reach the client (this closes the validation loop).** Freelancer composes a **`ClientUpdate`** from the facts + their notes (choosing what to include), marks it sent (copy-paste to their own inbox in v1 — Euclio doesn't email the client), and it's viewable at a **no-login `/u/[publicSlug]` page.** Plus a lightweight **"all-green" status they can send** in a quiet month, so value exists between incidents. *Test: compose an update, mark sent, open the public page.*

---

## Definition of done — the loop a partner can *validate* with

> add workflow → **confirm test ping ✓** → status → watcher (reconcile + debounce + dead-man's-switch) **+ explicit `/fail` → instant incident with scrubbed diagnostic** → alert → facts + note → **compose & send a client update + the no-login page** → **plus "simulate failure" and an "all-green" you can send.** Sentry + smoke test live. Deployed on Railway.

That's M0–M5.5. The demo is now complete end to end: simulate a miss → caught by silence; throw an error → red incident *with the reason* in the same second → one click to a drafted heads-up that says only what happened. **Scope line, drawn on purpose: `/fail` + scrubbed diagnostics is the last pre-partner addition.** Everything past this (real client email delivery, per-client cadence, metrics, drift, agent-native, euclio-init, the redaction-flag notification) waits for a partner to ask.

---

## How to work with Claude Code

1. **Create `CLAUDE.md` + `schema.prisma` at the repo root first.** Read every session; keeps principles + invariants + skip list in context.
2. **One slice per session/PR.** Build M0, test, commit, then M1. Don't ask for the whole thing at once.
3. **Have it write the tests** for `facts.ts` (banned-words + formatting, including the "reported a failure" shape), `scrub.ts` (secret-shape fixtures + truncate-first), and the watcher (reconcile + debounce + /fail suppression time-logic), and run them. Skip tests for CRUD/UI.
4. **Seed the Northgate scenario** so the UI builds against realistic data and you can demo without a live automation.
5. **Point at the skip list when it wanders** (client dashboard, billing, cadence).
6. **Deploy + smoke-test after each slice.**
7. **Realistic pace: 3–5 focused sessions for M0–M5.5.** Don't shortcut the watcher under time pressure — it's the one place you can't.

---

## Paste this into `CLAUDE.md` at the repo root

```md
# Euclio — project context for Claude Code

## What this is
Euclio watches the automations a freelancer/small agency runs for their clients
(n8n, Make, Zapier, custom scripts) via a heartbeat ping. The moment one stops
checking in, the freelancer finds out first — before their client does. The
freelancer reviews the facts, adds their own note, and sends the client an
update in their own words. It makes their monitoring retainer visibly worth it.

Buyer/user = the freelancer. The freelancer's client is non-technical and never
uses Euclio directly.

## Non-negotiable principles
1. HONESTY: Euclio states only what it captured — a workflow stopped checking in,
   and when; that it resumed, and when; duration. It NEVER characterizes severity
   or impact ("brief", "minor", "hiccup", "nothing was missed", "smoothly"). All
   client-facing text comes from facts.ts and is unit-tested against banned words.
2. THE FREELANCER SENDS, NOT EUCLIO. Euclio derives facts; a human reviews and
   sends. Euclio never contacts the client on its own.
3. TWO VIEWS, KEPT APART: dense factual views for the freelancer; the client only
   gets what the freelancer chooses to send. Never pipe the raw view to a client.
4. EUCLIO IS INVISIBLE TO THE CLIENT. No client login, no client dashboard.
5. VALUE MUST BE VISIBLE WITHOUT WAITING: a "simulate failure" path + an all-green
   status the freelancer can send, so a quiet month still delivers value.
6. THE LOOP MUST REACH THE CLIENT: composing + sending a ClientUpdate is in scope,
   because whether the CLIENT values it is the thing being validated.
7. DATA: Euclio stores facts about the machinery, never the data flowing through
   it. The sole exception is Incident.errorText: opt-in per workflow (default
   OFF), truncated+scrubbed client-side in the snippet, scrubbed AGAIN at ingest
   (scrub.ts — the server pass is the only scrub for platform pings), size-capped,
   hard-deleted after 30 days by the nightly purge. errorText renders ONLY in the
   freelancer's incident view — never in facts.ts output, a Note, or a
   ClientUpdate. Never claim "we catch everything"; the claim is layered-and-
   deleted, stated honestly.

## Watcher = the core (a monitoring tool's scheduler is the product)
- Always-on node-cron worker. RECONCILIATION-BASED: each run processes every
  workflow overdue since the last successful check, idempotently.
- DEBOUNCE: require a minimum sustained-down duration before opening an incident;
  never re-open storms on a flapping workflow. A monitor that cries wolf is dead.
- DEAD-MAN'S-SWITCH each run (Healthchecks.io / cron-job.org): if the watcher
  dies, something independent alerts us. During a trial, Euclio missing a real
  incident is worse than no tool. Trust-critical.
- TWO DETECTION PATHS, DIFFERENT RULES: silence (missed heartbeat) is debounced
  by the watcher. An explicit /fail ping is unambiguous — the INGEST path opens
  the incident (source: explicit_fail) IMMEDIATELY, no debounce — but with a
  re-fail suppression window: no re-open/re-alert if it re-fails within N hours
  of resolving. Suppression is tested time-logic, same tier as debounce.
- NIGHTLY PURGE: the watcher NULLs Incident.errorText older than 30 days.
  Purging the diagnostic NEVER deletes the Incident — the fact outlives the data.
- Ingest: /api/ping/[token] (success) and /api/ping/[token]/fail (explicit
  failure), accepting GET and POST. Simple, fast, idempotent, rate-limited,
  payload size-capped. scrub.ts runs on every /fail payload at ingest.

## Observability & security
- Sentry + structured logging from M0. A monitoring tool blind to its own errors
  is unacceptable.
- Scope EVERY query by accountId. A cross-tenant leak is the highest-severity bug
  — treat it as a review/test gate, not a convention.
- Ping.payload is a small non-sensitive metric only. Never customer PII/PHI.
- Snippets are the integration (NO SDK, no published package): per-language,
  token pre-filled, try/catch so an Euclio outage can never crash the client's
  automation, short awaited timeout, zero deps, catch-block -> /fail. Platform
  /fail wiring maps the error message field ONLY, never the execution payload.

## Data model
Full schema in schema.prisma. Account is the tenant root, AUTO-CREATED per signup
(don't force a Clerk Org yet). Status is pending|healthy|down|paused; never write
healthy for a span the watcher didn't observe. Note/ClientUpdate bodies are always
human-authored (authorUserId). Soft-delete Client and Workflow (archivedAt).

## MVP scope (build only this — the DoD loop)
add client + workflow -> confirm test ping ✓ -> ping ingest (+ /fail + scrub) +
status -> node-cron watcher (reconcile + debounce + dead-man's-switch + nightly
purge) opens/resolves incidents; /fail opens incidents immediately with
suppression -> email the freelancer -> facts + diagnostic + note view ->
compose & send a ClientUpdate + no-login page -> plus simulate-failure and an
all-green status. Sentry + smoke test live. /fail + scrubbed diagnostics is the
LAST pre-partner addition — anything further waits for a partner to ask.

## Do NOT build (out of scope — flag if asked, don't add)
- client-facing dashboard/portal or client login
- Euclio emailing the client directly (freelancer sends from their own inbox)
- billing / payments in the app
- an SDK or any published npm/pip package (the snippet IS the integration)
- listed platform integrations (a Zapier app, an n8n community node) — the
  native HTTP module is the mechanism
- the euclio-init CLI (fast-follow, after partners)
- a "we redacted something" notification to the freelancer (open decision,
  post-MVP — the errorRedactedByServer flag is stored so this needs no migration)
- per-client cadence, Loom/voice, AI anomaly detection, drift, agent-native
  setup, teams/roles UI, multi-tenant scaling beyond the Account key
- any cold-email / outreach pipeline

## Stack
Next.js (App Router, TS) as a long-running server on Railway (web + worker, one
repo) · Prisma v7 · Neon Postgres · Clerk auth · Resend email · Sentry ·
node-cron watcher. One repo, one host, one DB, one language. No serverless cron,
no queue, no Docker, no microservices.

## Topology (modular monolith, split by reliability tier — not by fashion)
- One repo, ONE Postgres, one shared Prisma/domain layer. Two Railway processes:
  a WEB service (dashboard + compose + auth + ingest) and a WATCHER worker.
- Ingest (POST /api/ping/[token]) MUST stay a clean, self-contained module with
  no shared mutable state with the dashboard. It rides in the web service for now
  but must be extractable into its own always-up process as a lift-and-shift.
  WHY: ingest is must-be-up; the UI is what gets deployed constantly. Keeping them
  separable means a UI deploy can't threaten the ping path.
- EXTRACT ingest into its own process only when: (a) you run >1 web instance, or
  (b) UI deploy frequency starts threatening ping reliability. Not before.
- Do NOT merge ingest into the watcher worker. The watcher is a pure internal loop
  with ZERO inbound public surface — a public endpoint there lets a ping flood
  compete with the tick. Different shapes, kept apart.
- No separate databases, ever, at this stage: a single accountId-scoped query +
  transactions is the security invariant. Separate DBs break it.

## Conventions
- Vertical slices; each milestone deploys and is testable on its own.
- Tests only for the three honesty-critical modules: facts.ts (banned-words +
  formatting, incl. the "reported a failure" shape), scrub.ts (secret-shape
  fixtures redacted; truncate-first order), and the watcher (reconcile +
  debounce + /fail suppression time-logic).
- Keep it boring and small. When unsure, do less.
```

## First prompt to Claude Code

> Read `CLAUDE.md` and `schema.prisma`. Build the M0 slice only: scaffold a Next.js (App Router, TypeScript) app configured to run as a long-running server on Railway, with Prisma + a Neon Postgres connection and Clerk auth. Use the provided `schema.prisma` and run the initial migration against Neon. On sign-up, auto-create an `Account` and a `User` row (do not require a Clerk Organization). Wire Sentry + structured logging and a `/api/health` endpoint. Add a single authenticated `/dashboard` route showing "no workflows yet." Give me the exact steps to get Neon, Clerk, Resend, and Sentry keys into `.env`, run `prisma migrate deploy`, and deploy the web service to Railway. Do NOT build any ping/watcher/worker logic yet — that's M1+. Keep the skip list in mind.

Then one slice per session down the list. The worker service stands up at M3.