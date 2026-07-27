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

## Watcher = the core (a monitoring tool's scheduler is the product)
- Always-on node-cron worker. RECONCILIATION-BASED: each run processes every
  workflow overdue since the last successful check, idempotently.
- DEBOUNCE: require a minimum sustained-down duration before opening an incident;
  never re-open storms on a flapping workflow. A monitor that cries wolf is dead.
- DEAD-MAN'S-SWITCH each run (Healthchecks.io / cron-job.org): if the watcher
  dies, something independent alerts us. During a trial, Euclio missing a real
  incident is worse than no tool. Trust-critical.
- Ingest (POST /api/ping/[token]): simple, fast, idempotent, rate-limited,
  payload size-capped.

## Observability & security
- Sentry + structured logging from M0. A monitoring tool blind to its own errors
  is unacceptable.
- Scope EVERY query by accountId. A cross-tenant leak is the highest-severity bug
  — treat it as a review/test gate, not a convention.
- Ping.payload is a small non-sensitive metric only. Never customer PII/PHI.

## Data model
Full schema in schema.prisma. Account is the tenant root, AUTO-CREATED per signup
(don't force a Clerk Org yet). Status is pending|healthy|down|paused; never write
healthy for a span the watcher didn't observe. Note/ClientUpdate bodies are always
human-authored (authorUserId). Soft-delete Client and Workflow (archivedAt).

## MVP scope (build only this — the DoD loop)
add client + workflow -> confirm test ping ✓ -> ping ingest + status -> node-cron
watcher (reconcile + debounce + dead-man's-switch) opens/resolves incidents ->
email the freelancer -> facts + note view -> compose & send a ClientUpdate +
no-login page -> plus simulate-failure and an all-green status. Sentry + smoke
test live.

## Do NOT build (out of scope — flag if asked, don't add)
- client-facing dashboard/portal or client login
- Euclio emailing the client directly (freelancer sends from their own inbox)
- billing / payments in the app
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
- Tests only for facts.ts (banned-words + formatting) and the watcher
  (reconcile + debounce time-logic).
- Keep it boring and small. When unsure, do less.