> **STATUS (Jul 30, 2026):** Partially superseded. §1 principle numbering, §3 fast-follow ordering, and the M5.5 framing are amended by `Euclio_canary_synthesis_addendum.md`; the current consolidated view is `Euclio_master_reference.md`. Schema and runbook edit lists remain valid where not contradicted.

# Euclio — Master Alignment Audit (Certainty Reframe → All Artifacts)

*Every Euclio artifact reviewed against the vision adopted this session. Coverage note: audited from the full excerpts of all eleven project documents surfaced this session plus today's five new artifacts; two items were only partially visible (the standalone north-star/vision doc, if separate from CLAUDE.md, and the full schema.prisma file) — their sections below flag what to verify by hand.*

---

## The vision being aligned to (one paragraph)

Euclio sells **certainty to the freelancer**: never be caught not knowing. The heartbeat (plus, later, the canary) means they always know first; the per-client **ledger** means any "is it working?" question gets answered in one message, with receipts; the record proves the retainer at renewal. The client note survives exactly as spec'd but as an **optional cash-in** of a catch, not the load-bearing artifact. Value peaks in each client's **scrutiny window** (onboarding, when "is it broken?" questions cluster) and at renewal; mid-relationship silence is earned trust, not neglect. Wedge: the "just landed a new client" moment. Everything client-facing remains human-sent, honesty-bound, Euclio-invisible.

## The invariants (unchanged in every artifact — do not touch)

The honesty module and banned-words tests · the claims boundary (Euclio states observations; humans state meaning; only a verified human reassures) · the freelancer sends, never Euclio · no client-facing surfaces (no dashboard, portal, login) · the note spec (four slots, mandatory human slot) · event-first insight · the engine (M0–M5) · palette/ledger aesthetic · the etymology, now literal: **"a record well told" is the product description.**

---

## Artifact-by-artifact

### 1 · CLAUDE.md (inside the MVP implementation plan) — CHANGE (highest leverage; Claude Code reads this every session)

Replace the "What this is" paragraph with:

> Euclio watches the automations a freelancer/small agency runs for their clients (n8n, Make, Zapier, custom scripts) via a heartbeat ping. The moment one stops checking in, the freelancer knows first — before their client does. Every catch, resolution, and quiet day lands in a per-client ledger, so the freelancer can answer any "is it working?" question in one message, with receipts, and walk into every renewal with the record in hand. When a catch is worth telling, they compose a note from the facts in their own words — optional, never automated. Euclio sells certainty to the freelancer: never be caught not knowing. The client is non-technical and never uses Euclio directly.

Principles: keep 1 (HONESTY) and append: *"Extended claims boundary: generated text states only observations; interpretation and reassurance are human-only; facts.ts additionally bans inference ('missed', 'would have', 'were affected'), recovery-time promises, abstract-pain phrases, and passive constructions."* Keep 2 (THE FREELANCER SENDS) verbatim. Add principle 3: *"THE LEDGER IS THE PRODUCT: incident and rollup data is never pruned below 12 months; per-workflow daily rollups (check-in count, payload-metric sum) preserve the math if raw pings are pruned."*

### 2 · schema.prisma — CHANGE (verify against the actual file)

Add: `Workflow.clientFacingName`, `Workflow.clientDescription` · `ClientUpdate.kind` enum (`incident | all_green`; reserve `recap | coverage`) · `WorkflowDailyStat` (workflowId, date, checkInCount, payloadMetricSum) written by the watcher · confirm `Client.createdAt` exists (client age drives the lifecycle phase; no new field needed — derive "scrutiny window" as first N days, N configurable, default 90). Nothing else.

### 3 · MVP implementation plan (milestones) — CHANGE (M5, M5.5, definition of done)

- **M0–M4:** unchanged, word for word.
- **M5:** facts.ts renders `clientFacingName`; extended banned classes per the note spec (tests included).
- **M5.5 — retitle from "Reach the client" to "The ledger + answer view."** New scope: (a) per-client ledger (every incident, facts, durations, status, newest first, phone-readable); (b) incident answer view (one incident's timeline formatted to answer a client question in one message); (c) optional note composition per the note spec — slot 2 empty and mandatory, send disabled while empty; (d) all-green quick note kept; (e) `/u/[publicSlug]` **demoted** from vehicle to optional attachable receipt.
- **Definition of done, updated loop:** add workflow (with client-facing name) → test ping ✓ → status → watcher → alert → ledger entry → **answer a simulated client question from the answer view** → optionally compose & send a note → simulate-failure + all-green. The "answer a simulated question" step is the new validation aha.
- **Fast-follow order:** FF1 email canary (inbound mailbox + expectation schedule — differentiator #2) · FF2 gap-accounting context lines · FF3 onboarding kit surfaced at client creation (expectation-setter, "what runs for you" map, canary setup) · FF4 note channel variants. Recap/kill-switch/radar stay v2.
- Skip list: unchanged; explicitly re-add "no client-facing surfaces, ever."

### 4 · Claude Code build runbook — CHANGE (three slice prompts)

- **M1 prompt:** add capture of `clientFacingName` + `clientDescription` ("what would your client call this?").
- **M3 prompt:** watcher additionally writes `WorkflowDailyStat` rollups each run (one line).
- **M5 prompt:** add extended banned classes + clientFacingName rendering; keep the banned-words-test-must-fail verification.
- **M5.5 prompt — replace entirely:**
  > Build the M5.5 slice only. Two views: the per-client Ledger (every incident with facts, durations, status, newest first, readable on a phone in seconds) and the incident Answer view (one incident's full timeline formatted so the freelancer can answer a client's "is it working?" in one message). From either, the freelancer may optionally compose a ClientUpdate per the note spec: four slots; slot 2 ("what it means for you") ships empty and mandatory — do NOT generate placeholder content for slot 2; send/mark-sent is disabled while it's empty. Keep the all-green quick note. Keep the no-login /u/[publicSlug] page as an optional attachable receipt only. Euclio still never emails the client. *Verify:* open a client's ledger, answer a simulated question from the answer view in under a minute, compose a note and confirm send is blocked until slot 2 is filled.
- Working rules (one slice per session, tests for watcher/facts, seed Northgate, skip-list pointing): unchanged.

### 5 · MVP build scope — CHANGE (minor)

The guardrail (build + recruit in parallel) and the corollary: unchanged. "The one loop the MVP must do," step 4: from "sees a drafted heads-up note" → "sees the incident in the ledger with the answer view; a drafted note is one optional action." Everything else stands.

### 6 · Landing pages (three versions) + landing reframe blueprint + AI-tell audit — MAJOR CHANGE + RECONCILE

**Flagged inconsistency to resolve first:** three live versions with three prices and two names — euclio-landing-reframed.html ($15/mo, note-hero), the reframe blueprint ($25/mo, note-hero), and the July 17 "Ledger" design-system page ($39/mo, Sentry-style continuous document, report-format language). Pick one price and confirm the name (the "Ledger" page's *aesthetic* is the most aligned with the new vision; its *copy* is the least — it still promises "input on the report format").

**The rewrite (applies to whichever version wins):**
- **H1:** `Never be caught not knowing.`
- **Sub:** `Every new client watches you like a hawk. Euclio makes those first months flawless — you know the moment anything stops, you answer any "is it working?" in one message with the record, and you walk into renewal with the year's catches in hand.`
- **Hero artifact — the load-bearing visual change:** replace the note-draft card with **the answer moment**: an incoming client text ("hey — Sarah says she didn't get her reminder, is the booking thing ok?") and the freelancer's ledger-backed reply ("Yes — it paused Tue 9:02–9:14, I'd already caught it, and I checked: all four bookings in the gap got their reminders."). The demo is the reply.
- **How-it-works step 3:** from "read the draft, send in your words" → "answer anything with the record — and when a catch is worth telling, send a note in your own words."
- **Evidence section:** churn quotes demote to supporting; lead with the scrutiny-window story and the Sentry-shaped anecdote (silent failure, relationships damaged before anyone knew).
- **Keep:** palette, founder honesty section, does/doesn't scope (add "Doesn't: contact your clients, ever — the note is always optional and always yours"), Stripe card-on-file reserve mechanics, "not live yet" honesty.
- **Promote the etymology to the hero area:** *Euclio — a record well told.* It is now the literal product.
- **AI-tell audit:** carries forward as the checklist for the rewrite (em-dash rule, no triads twice, concrete beats smooth); re-run it on the new copy before shipping.

### 7 · Cold email strategy + outreach kit — CHANGE (the question and the anecdote; mechanics unchanged)

Peer-note architecture, no-pitch rule, timing, personalization protocol, funnel tracking: all unchanged — none of it depended on the old framing.

- **Email 1's genuine question — reframe** from between-check-ins visibility to the dread moment: *"random one — when a client pings you 'hey, is the [booking thing] still working?', what's your move right now? I used to lose an hour scrambling through execution logs every time."*
- **Follow-up 1's reciprocity anecdote — replace** the monthly-note answer with the certainty answer: *"for me the fix ended up being embarrassingly simple: having the timeline ready before they asked. One reply with exact times and 'already handled' — the escalations just stopped."*
- **Warm Email 2 / call script:** pitch = never be caught not knowing; demo = the answer moment; wedge = "for the next new client you land."
- **Discovery-call additions (already decided, restated here as the kit's new questions):** frequency + current behavior ("how often, and what do you do right now?") and clustering ("do those questions bunch up with new clients, then fade?").

### 8 · Research corpus (client-side analysis · optimal client-facing reframe · validation synthesis · Reddit prompts · interpretation-layer research) — KEEP AS RECORD, with one header note

These are evidence, not plans — do not edit their findings. Add a one-line header to the two whose *recommendations* made the note load-bearing (client-side analysis, optimal client-facing reframe): *"Superseded on emphasis by the certainty reframe (July 2026): the note is now optional upside; the findings on honesty, human voice, and push-over-pull remain binding on the note spec."* The validation synthesis needs no note — its event-first correction is the direct ancestor of the new vision. The Reddit prompts are a completed instrument; archive.

### 9 · This session's artifacts — ALREADY ALIGNED

Note spec (M5.5 compose requirements) · client-moment features & gap accounting · interpretation-layer research · certainty reframe scoring + lifecycle addendum. One touch-up: in the client-moment features doc, re-rank feature #1 ("make replying magic") from "fast-follow adjunct" to "this is the hero — built as M5.5's answer view."

---

## Flagged for hand-verification

1. **Name/price reconciliation:** Euclio vs the "Ledger"-titled page; $15 vs $25 vs $39 founding. One decision, then dead versions deleted.
2. **North-star / agent-native vision doc** (if it exists as a standalone): verify its long-term arc still reads correctly when the near-term hero is the ledger; the agent-native future arguably fits *better* (an agent that knows the record can draft the answer), but read it with fresh eyes.
3. **schema.prisma actual file:** apply §2 against the real file, not my reconstruction.

## Priority order

1. CLAUDE.md paragraph + principles (one edit, aligns every future build session)
2. Runbook M5.5 prompt + M1/M3/M5 additions (before the next Claude Code session)
3. Name/price decision → landing rewrite (H1, hero artifact, step 3) → AI-tell re-audit
4. Outreach kit question + anecdote swap (before any sends)
5. Schema deltas + implementation-plan milestone text
6. Header notes on the two superseded research docs

Nothing on this list is large. The reframe's best property holds at audit scale: it re-points the story while the machine underneath barely moves.
