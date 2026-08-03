# Euclio MVP — Implementation Plan for Claude Code

> **Updated Aug 2, 2026:** canary synthesis applied (M5.2 inserted; M5.5 rewritten as the ledger + answer view; scope line re-drawn). Decision record: `Euclio_canary_synthesis_addendum.md`.

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

**M5.2 · The canary (second sensor — launch scope per the synthesis addendum).** Schema deltas land here, not before (addendum §6): `Workflow.canaryAddress`, `CanaryExpectation` (rule + lateness window), `CanaryReceipt` (headers + subject hash only, bodies never persisted), `Incident.sendsDue/sendsArrived`, `WorkflowDailyStat.receiptsCount`. Inbound mail (Cloudflare Email Routing or SES → webhook, riding in the web service beside ping ingest, passive by construction): resolve workflow by address → match the nearest open expectation occurrence → write receipt → if an incident is open, recompute gap counts. First matched receipt becomes a ledger milestone. Unmatched receipts log with a null expectation and surface nowhere client-facing. *Test: a simulated pause spanning two due sends ends with "2 due in the gap, 2 arrived"; an unexpected send logs unmatched; receipts prune with raw pings while rollup counts survive.*

**M5.5 · The ledger + answer view (this closes the validation loop).** Per-client register — NOT an issue-detail page (design spec: `euclio-answer-view.html`; kinship is Stripe's activity log, never Sentry): incidents, quiet runs, and milestones as rows, newest first; an incident expands inline to events + receipts side by side; a factual summary assembled from the record with a REQUIRED empty "your read" slot; Copy; Share receipt. Composing a **`ClientUpdate`** is one action on the entry (facts + the filled read, send blocked until the read exists; copy-paste to their own inbox in v1 — Euclio doesn't email the client), viewable at the **no-login `/u/[publicSlug]` page**, now framed as an attachable receipt. Keep the **"all-green" status** for quiet months. Inline expansion holds to ~10 events; beyond that, a focused panel. *Test: answer a simulated client question from the answer view in under a minute; compose is blocked until the read is filled; the diagnostic panel is absent from compose; open the public page.*

---

## Definition of done — the loop a partner can *validate* with

> add workflow → **confirm test ping ✓** → status → watcher (reconcile + debounce + dead-man's-switch) **+ explicit `/fail` → instant incident with scrubbed diagnostic** → alert → facts + note → **compose & send a client update + the no-login page** → **plus "simulate failure" and an "all-green" you can send.** Sentry + smoke test live. Deployed on Railway.

That's M0–M5.5. The demo is now complete end to end: simulate a miss → caught by silence; throw an error → red incident *with the reason* in the same second → one click to a drafted heads-up that says only what happened. **Scope line (amended by the canary synthesis): M5.2 was consciously added past the original "/fail + diagnostics is the last addition" line, because the landing page's "four arrived" made the canary load-bearing — honesty outranks scope discipline. The line is re-drawn after M5.2 and hardens: nothing else enters launch scope unless a partner asks or a public claim requires it.** Everything past this (real client email delivery, per-client cadence, metrics, content integrity, drift, euclio-init and the fuller agent setup doc, the redaction-flag notification) waits for a partner to ask — the M1 coding-agent snippet tab is already in scope above.

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

## CLAUDE.md

Maintained ONLY at the repo root — one copy, no duplication (duplicated context is how this project drifted twice). If a milestone here and CLAUDE.md ever disagree, fix both in the same commit.