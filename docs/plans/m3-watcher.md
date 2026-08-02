# M3 — Watcher Worker + Incidents

## Goal
A always-on node-cron worker that detects missed heartbeats, opens/resolves
incidents, pings a dead-man's-switch, and purges aged error text. Plus a
"simulate failure" action in the dashboard so the full flow can be demoed
without waiting for a real miss.

## What gets built

### 1. Schema migration
Add `Workflow.lastCheckedAt DateTime?` — the watcher stamps this on every
reconcile run per workflow. This is what makes reconciliation idempotent:
"overdue since last check" is computable without relying on wall-clock drift.

No other schema changes needed — `Incident`, `WorkflowStatus`, and
`IncidentSource` are already correct.

### 2. New files

**`worker/index.ts`** — entry point for the Railway worker service.
- Imports and starts the watcher.
- No inbound HTTP surface. Pure outbound loop.

**`worker/watcher.ts`** — the reconcile loop.
- `startWatcher()`: sets up node-cron schedule (every minute), calls
  `reconcile()` on each tick, pings the dead-man's-switch after each
  successful run.
- `reconcile(now?: Date)`: exported for tests. Pure logic, injectable clock.
  - Finds all non-archived, non-paused workflows.
  - For each: computes `overdueAt = lastPingAt + expectedIntervalMinutes +
    graceMinutes`. If `now >= overdueAt` AND no open incident exists →
    debounce check → open incident.
  - Debounce: only open if `now - overdueAt >= DEBOUNCE_MINUTES` (default 2).
    This means the workflow must have been continuously overdue for at least
    2 minutes before an incident opens. Prevents a single slow ping from
    firing an alert.
  - Sets `Workflow.status = down` when opening, `healthy` when resolving.
  - Resolves open `heartbeat` incidents when `lastPingAt > incident.openedAt`.
  - Stamps `Workflow.lastCheckedAt = now` on every workflow it processes.

**`worker/purge.ts`** — nightly TTL purge.
- `purgeAgedErrorText(now?: Date)`: NULLs `Incident.errorText` (and sets
  `errorRedactedByServer = false`) where `openedAt < now - 30 days`.
- Never deletes the Incident row. The fact outlives the data.
- Called from the watcher on a separate node-cron schedule (daily at 02:00).

**`worker/deadmans.ts`** — dead-man's-switch ping.
- `pingDeadMansSwitch()`: fires a GET to `process.env.DEADMANS_SWITCH_URL`.
  Fails silently (logs warn, never throws) — the watcher must not crash
  because the external monitor is unreachable.
- If `DEADMANS_SWITCH_URL` is unset, logs a one-time warning at startup and
  skips silently on each run.

### 3. Dashboard: simulate failure action

**`app/dashboard/actions.ts`** — add `simulateFailure(workflowId)`:
- Auth + account ownership check (same pattern as `createWorkflow`).
- Sets `Workflow.lastPingAt = new Date(Date.now() - overdueDuration)` where
  `overdueDuration` makes it immediately overdue past grace + debounce.
  Specifically: `lastPingAt = now - (expectedIntervalMinutes + graceMinutes +
  DEBOUNCE_MINUTES + 1) * 60_000`.
- Does NOT open an incident directly — the watcher does that on its next
  tick. This keeps the watcher as the sole writer of heartbeat incidents.
- Logs `workflow.simulate_failure`.
- Revalidates `/dashboard`.

**`app/dashboard/page.tsx`** — add a "Simulate miss" button per workflow,
wired to `simulateFailure`. Only shown when `workflow.status !== 'down'`.

### 4. Tests

**`worker/__tests__/watcher.test.ts`**
- `reconcile()` with injectable `now` — no real DB, use a mock/stub for
  prisma calls.
- Cases:
  - Workflow not yet overdue → no incident opened.
  - Workflow overdue but within debounce window → no incident opened.
  - Workflow overdue past debounce → incident opened, status set to `down`.
  - Workflow already has open incident + ping came in after openedAt →
    incident resolved, status set to `healthy`.
  - Flapping (overdue → ping → overdue again) → only one incident per
    sustained-down period, no storm.
  - `explicit_fail` open incident is NOT resolved by the watcher (only the
    ingest path resolves those — or a future manual action).

**`worker/__tests__/purge.test.ts`**
- `errorText` older than 30 days → NULLed.
- `errorText` newer than 30 days → untouched.
- Incident row itself never deleted.

## Railway worker service setup

In `railway.json` (or Railway dashboard), add a second service pointing at
the same repo with start command:

npx tsx worker/index.ts

Environment variables needed (add to `.env.example`):
- `DEADMANS_SWITCH_URL` — the Healthchecks.io or cron-job.org ping URL.
- `WATCHER_DEBOUNCE_MINUTES` — optional override, defaults to 2.

## Constants (in `worker/watcher.ts`)

```ts
const DEBOUNCE_MINUTES = Number(process.env.WATCHER_DEBOUNCE_MINUTES ?? "2");
const PURGE_DAYS = 30;

Invariants to uphold

    The watcher is the ONLY writer of Workflow.status = healthy and Workflow.status = down for heartbeat incidents.
    The watcher NEVER opens or resolves explicit_fail incidents — those are owned by the ingest path (/api/ping/[token]/fail).
    Incident.errorText purge never touches the Incident row itself.
    Dead-man's-switch failure must never crash or stall the watcher loop.
    reconcile() is idempotent: running it twice for the same now produces the same DB state.

Definition of done

    worker/index.ts starts without error.
    reconcile() unit tests pass (all cases above).
    purge.test.ts passes.
    Simulate failure → next watcher tick → incident opens → dashboard shows down.
    Ping the workflow → next watcher tick → incident resolves → dashboard shows healthy.
    Dead-man's-switch URL is pinged on each run (verify via Healthchecks.io log or a test spy).
    Aged errorText is NULLed by purge; incident row intact.
    Worker service deployed on Railway as a second process.

I added these files to the chat: railway.json Let me know if there are others we should add.

I already have railway.json — you added it two messages ago and I can see its contents. It currently defines only the web service (npm run start).

The M3 plan I just wrote covers what needs to change for Railway: a second service in the Railway dashboard pointing at the same repo with start command npx tsx worker/index.ts. The railway.json file itself only needs a new env var entry in .env.example — the second Railway service is configured in the Railway dashboard, not in railway.json (which only describes one service).

Do you want me to proceed with building M3 now, or review the plan first?

I added these files to the chat: .env.example Let me know if there are others we should add.

I already have .env.example — you added it two messages ago and I can see its contents.

Based on the M3 plan, two new variables need to be added to .env.example:

In .env.example, add a new section at the bottom:

# --- Watcher worker (M3) ---
# Dead-man's-switch ping URL (Healthchecks.io or cron-job.org). If unset,
# the watcher logs a warning at startup and skips silently on each run.
DEADMANS_SWITCH_URL=

# Optional: override the debounce window before a missed heartbeat opens an
# incident. Defaults to 2 minutes.
WATCHER_DEBOUNCE_MINUTES=

That's the only change needed to .env.example. Ready to start building M3 when you say go.