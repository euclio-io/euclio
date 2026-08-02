# Euclio — project context for Claude Code

Strategy docs live in `aider_project_context/`; `Euclio_master_reference.md` is the consolidated source of truth and `Euclio_canary_synthesis_addendum.md` is the decision record (schema deltas §6, packaging §11). This file is maintained ONLY here — the implementation plan points to it, never duplicates it. No code change may contradict a principle below; no strategy change exists until committed to the docs.

## What this is
Euclio watches the automations a freelancer/small agency runs for their clients
(n8n, Make, Zapier, custom scripts) from both ends: a heartbeat ping says it ran,
and a canary address riding silently in the send list confirms that what the
client's customers receive actually arrived. The moment either signal breaks, the
freelancer knows first — before their client does. Every catch, resolution,
verified arrival, and quiet day lands in a per-client ledger, so the freelancer
can answer any "is it working?" question in one message, with receipts, and walk
into every renewal with the record in hand. When a catch is worth telling, they
compose a note from the facts in their own words — optional, never automated.
Euclio sells certainty to the freelancer: never be caught not knowing.

Buyer/user = the freelancer. The freelancer's client is non-technical and never
uses Euclio directly.

## Non-negotiable principles
1. HONESTY: Euclio states only what it observed — stopped checking in / resumed /
   duration / reported a failure (the /fail fact shape, distinct from silence) /
   receipt arrived at the canary. It NEVER characterizes severity or impact
   ("brief", "minor", "hiccup", "nothing was missed", "smoothly"). All client-facing
   text comes from facts.ts and is unit-tested against banned words.
2. THE FREELANCER SENDS, NOT EUCLIO. Euclio derives facts; a human reviews and
   sends. Euclio never contacts the client on its own. Note/answer compose: the
   "what it means" slot is human-only and REQUIRED; send is blocked until filled.
3. TWO VIEWS, KEPT APART: dense factual views for the freelancer; the client only
   gets what the freelancer chooses to send. Never pipe the raw view to a client.
   `Incident.errorText` and canary-derived content render in freelancer views only
   and must be STRUCTURALLY unable to reach a ClientUpdate.
4. EUCLIO IS INVISIBLE TO THE CLIENT. No client login, no client dashboard.
   `/u/[publicSlug]` is only an optional attachable receipt.
5. VALUE MUST BE VISIBLE WITHOUT WAITING: a "simulate failure" path + an all-green
   status the freelancer can send, so a quiet month still delivers value. Quiet is
   positive evidence — the ledger renders quiet runs as rows, not absence.
6. THE LOOP MUST REACH THE ANSWER MOMENT: what's being validated is the
   freelancer's certainty — answer a simulated client question from the ledger in
   under a minute. Composing + sending a ClientUpdate stays in scope as the
   optional last hop of that loop, not its destination.
7. THE LEDGER IS THE PRODUCT: incident + rollup data is never pruned below 12
   months; WorkflowDailyStat rollups preserve the counts when raw pings and canary
   receipts are pruned.
8. THE DATA PRINCIPLE: diagnostics are opt-in per workflow, default OFF; the
   consent checkbox changes which snippet is generated. Scrub layers: truncate
   ~200 chars → client-side redaction (visible in the snippet) → server-side pass
   at ingest (the only pass for platform senders) → hard cap → 30-day TTL nightly
   purge that never deletes the incident fact.
9. THE CANARY OBSERVES, IT DOES NOT INFER: a receipt means the canary received a
   copy; "arrived" in generated text always means arrived at the canary. Never
   claim any other recipient received anything. Headers + subject hash only;
   bodies transient (FF1 checks), never persisted.
10. NEVER IN THE CRITICAL PATH: generated snippets fail open (try/catch, 3–5s
    timeout, ≤1 retry, awaited, zero deps). An Euclio outage must be invisible to
    client automations. The v2 kill-switch is the sole exception and defaults to
    RUN on any timeout/error — describe it only as "stops the bleeding while
    Euclio is reachable."

## AI safety contract (applies to ANY future AI feature — in code, not policy)
Facts-linked (every AI statement links to the raw event) · negative space declared
("what I did not check") · no machine severity · human-final (nothing reaches a
client without human-authored meaning and a human send) · tenant-scoped (no
learning across accountId without explicit anonymized opt-in) · provenance-labeled
(operator UI always distinguishes AI-suggested from human-authored). The MVP ships
with ZERO LLM; AI layers are post-validation and operator-side only. Full strategy:
aider_project_context/Euclio_AI_strategy.md.

## Watcher = the core (a monitoring tool's scheduler is the product)
- Always-on node-cron worker. RECONCILIATION-BASED: each run processes every
  workflow overdue since the last successful check, idempotently.
- DEBOUNCE: require a minimum sustained-down duration before opening an incident;
  never re-open storms on a flapping workflow. A monitor that cries wolf is dead.
- Explicit /fail bypasses debounce (immediate open via the ingest path), with a
  re-fail suppression window. The watcher never opens/resolves explicit_fail
  incidents; only the /fail route manages them.
- DEAD-MAN'S-SWITCH each run: if the watcher dies, something independent alerts
  us. Trust-critical.
- Ingest (POST + GET /api/ping/[token]): simple, fast, idempotent, rate-limited,
  payload size-capped.
- Canary inbound (M5.2) is PASSIVE: an inbound-mail webhook writes receipts and
  recomputes gap counts; an inbound outage can never affect a client workflow.

## Observability & security
- Sentry + structured logging from M0. A monitoring tool blind to its own errors
  is unacceptable.
- Scope EVERY query by accountId. A cross-tenant leak is the highest-severity bug
  — treat it as a review/test gate, not a convention.
- Ping.payload is a small non-sensitive metric only. Never customer PII/PHI.
  Canary stores headers + subject hash only.

## Data model
Full schema in schema.prisma; canary deltas in the addendum §6 (canaryAddress,
CanaryExpectation, CanaryReceipt, Incident.sendsDue/sendsArrived,
WorkflowDailyStat.receiptsCount — added at M5.2, not before). Account is the
tenant root, AUTO-CREATED per signup. Status is pending|healthy|down|paused;
never write healthy for a span the watcher didn't observe. Note/ClientUpdate
bodies are always human-authored (authorUserId). Soft-delete Client and Workflow.

## MVP scope (build only this — the DoD loop)
add client + workflow -> confirm test ping ✓ -> ping ingest + status -> watcher
(reconcile + debounce + dead-man's-switch) opens/resolves incidents; /fail opens
instantly -> email the freelancer -> facts + note view -> canary receipt matched,
gap computed (M5.2) -> ledger + answer view: answer a simulated client question
from the record in under a minute (M5.5) -> optional ClientUpdate (blocked until
the human "your read" is filled) + /u/[publicSlug] receipt + all-green status ->
plus simulate-failure. Sentry + smoke test live. Answer-view design spec:
aider_project_context/euclio-answer-view.html (register layout, NOT an
issue-detail page).

## Do NOT build (out of scope — flag if asked, don't add)
- client-facing dashboard/portal or client login
- Euclio emailing the client directly (freelancer sends from their own inbox)
- an installable SDK or published package (npm/pip) — snippet only, per doctrine
- listed platform integrations (Zapier app, n8n community node, Make app)
- euclio-init as the primary mechanism (optional FF generator of the same snippet)
- the redaction-flag notification; storing message bodies or recipient PII
- billing / payments in the app
- per-client cadence, Loom/voice, AI anomaly detection, drift, cadence baseline,
  kill-switch, pre-failure radar (all v2), teams/roles UI, charts/uptime-% views
- client-facing AI of ANY kind: AI-authored client updates, machine severity,
  client chatbots, auto-send (permanent policy, also marketing)
- AI triage/digest/voice-matching/AI-tell linter before design partners validate
  the core loop (post-validation Layers 1–2, operator-side only)
- any cold-email / outreach pipeline
- anything placing Euclio in a workflow's run path

## Stack
Next.js (App Router, TS) as a long-running server on Railway (web + worker, one
repo) · Prisma v7 · Neon Postgres · Clerk auth · Resend email · Sentry ·
node-cron watcher · inbound mail for the canary at M5.2 (Cloudflare Email
Routing or SES inbound → webhook; pick at build time). One repo, one host, one
DB, one language. No serverless cron, no queue, no Docker, no microservices.

## Topology (modular monolith, split by reliability tier — not by fashion)
- One repo, ONE Postgres, one shared Prisma/domain layer. Two Railway processes:
  a WEB service (dashboard + compose + auth + ingest) and a WATCHER worker.
- Ingest (POST /api/ping/[token]) MUST stay a clean, self-contained module with
  no shared mutable state with the dashboard. It rides in the web service for now
  but must be extractable into its own always-up process as a lift-and-shift.
  WHY: ingest is must-be-up; the UI is what gets deployed constantly.
- EXTRACT ingest into its own process only when: (a) you run >1 web instance, or
  (b) UI deploy frequency starts threatening ping reliability. Not before.
- Do NOT merge ingest into the watcher worker. The watcher is a pure internal loop
  with ZERO inbound public surface. The canary inbound webhook rides in the web
  service beside ping ingest, same extractability rule.
- No separate databases, ever, at this stage: a single accountId-scoped query +
  transactions is the security invariant. Separate DBs break it.

## Conventions
- Vertical slices; each milestone deploys and is testable on its own.
- Tests for the honesty-critical modules: facts.ts (banned words + both fact
  shapes), scrub.ts (redaction fixtures + truncation), and the watcher
  (reconcile + debounce + suppression + purge-preserves-incident time-logic).
- Never invent quotes, testimonials, or metrics anywhere.
- Keep it boring and small. When unsure, do less. If a refactor beats the plan,
  propose the doc edit in the same PR — code and docs move together or not at all.