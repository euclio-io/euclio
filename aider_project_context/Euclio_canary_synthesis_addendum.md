# Canary synthesis — decision addendum & artifact deltas

**Status:** Adopted. This document amends `Euclio_certainty_reframe_positioning_and_scoring.md` and `Euclio_master_alignment_audit.md`. Where it conflicts with either, this document wins.

**Origin:** An external aider session (Jul 29) proposed re-anchoring the entire product on canary verification ("proof of delivery"). The proposal was partly right. This addendum records what was adopted, what was rejected, and why — plus every downstream artifact change.

---

## 1 · The decision

Positioning stays **certainty-led**. The page and the pitch remain the three moments (breaks-and-I-don't-know, asks-and-I-scramble, renewal-and-no-proof). The canary is promoted from a supporting clause to the **named second sensor** — the engine that makes "arrived" a fact — and moves from fast-follow into **launch scope**, together with gap accounting.

Why not canary-led, in three tests the certainty framing passes and canary-led fails. Coverage: the canary only exists for workflows whose output is a message with a send list; syncs, CRM writes, invoice pushes, and spreadsheet jobs have nowhere to put a canary, while the heartbeat covers everything. Anchoring on delivery proof makes the headline promise structurally false for a large share of the workflows a freelancer actually runs. Evidence: nobody in the ~800-post corpus ever asked for delivery proof; the directly observed behaviors are the freelancer's dread, the client's worried question, and the renewal audit — moments, which is what certainty sells. Category: "proof of delivery" files Euclio next to deliverability dashboards the way "monitoring" filed it next to Cronitor; the whole strategy is refusing a commodity shelf.

The honesty constraint that forced the scope change: once the landing page shows "four due in the gap, four arrived," that claim is load-bearing. A reservation page may not demo a sensor that won't exist at launch. The inversion analysis already judged the canary "barely harder than the heartbeat" (an inbound mailbox plus an expectation schedule), so the fix is to build it, not soften the page.

## 2 · Adopted from the aider session

Three things, each reshaped to fit the voice and the claims boundary. The compressed sending-end/receiving-end contrast — now one small two-row panel under Minute one, not a diagram plus annotated checklists. Gap accounting named as a capability ("Accounts for every gap: sends due during a pause, sends arrived after") rather than living only inside the hero card's numbers. First-send verification — the scrutiny-window wedge as a product moment: the canary's first matched receipt becomes a ledger milestone ("First send verified, customers receiving · day one"), surfaced in onboarding and now the first entry of the landing page's ledger mock.

## 3 · Rejected, and must not resurface

The full canary-led repositioning ("You send it. We verify it arrived." as H1). The six-capability feature walk. The fake hero receipt demonstrating unbuilt checks. Content integrity, timing drift, and cadence baselines presented as product (they are FF1 and v2 — see §5). The dark palette (deep-forest-with-glowing-accents is the visual uniform of the monitoring category we are escaping; the paper-colored ledger is the brand argument made visually — revisit after validation calls if it still pulls). The invented quote, the invented citations, the sentence appended to the real pricing quote, and the anonymous-founder replacement. Note: the fabrications exist in the landing repo's git history (commit 18beac2); never cherry-pick from it.

## 4 · CLAUDE.md deltas

Replace the "What this is" paragraph (supersedes the version in the master audit §1) with:

> Euclio watches the automations a freelancer/small agency runs for their clients (n8n, Make, Zapier, custom scripts) from both ends: a heartbeat ping says it ran, and a canary address riding silently in the send list confirms that what the client's customers receive actually arrived. The moment either signal breaks, the freelancer knows first — before their client does. Every catch, resolution, verified arrival, and quiet day lands in a per-client ledger, so the freelancer can answer any "is it working?" question in one message, with receipts, and walk into every renewal with the record in hand. When a catch is worth telling, they compose a note from the facts in their own words — optional, never automated. Euclio sells certainty to the freelancer: never be caught not knowing. The client is non-technical and never uses Euclio directly.

Principles stay as amended by the master audit and the ingestion-decision session (which added the data principle as principle 7). The principle below is therefore appended **by name, after the last existing principle** — not as "principle 4" as an earlier draft of this addendum numbered it:

> **THE CANARY OBSERVES, IT DOES NOT INFER.** A receipt means the canary received a copy. Euclio never claims any other recipient received anything; "arrived" in generated text always means "arrived at the canary," and per-recipient delivery is a judgment only the human makes. facts.ts bans "delivered to <anyone but the canary>", "everyone received", "all recipients".

This resolves the one honesty nuance the landing shorthand blurs: "four arrived" on the page means four canary copies landed — evidence each send fired and left the system intact. The freelancer's reply saying "delivered" is their call, after checking, exactly like "nothing was missed."

## 5 · Build order deltas (supersedes master audit §3 FF ordering)

M0–M5 unchanged, word for word. Insert one new slice before the ledger view:

**M5.2 — The canary.** Per-workflow inbound address (`canary-<id>@in.euclio.io`), an expectation schedule ("a reminder should arrive every weekday by 9:05am" — recurrence plus lateness window), receipt logging on inbound mail, and gap accounting (for any incident window: occurrences due vs receipts matched, denormalized onto the incident). Verify: simulate a paused workflow spanning two due occurrences, deliver both after recovery, and see the ledger line read "2 due in the gap, 2 arrived."

M5.5 (ledger + answer view) is unchanged in scope but now consumes canary data: arrival lines in the ledger, due/arrived counts in the answer view, and the first matched receipt rendered as the "First send verified" milestone.

Fast-follows renumber: **FF1** content integrity check (subject pattern, merge-field render check on the canary copy — headers-plus-minimal-body parse, discard after check) · **FF2** onboarding kit surfaced at client creation (expectation-setter, "what runs for you" map, canary setup) · **FF3** note channel variants. **v2:** kill-switch, pre-failure radar, timing drift, cadence baseline, recap. Definition-of-done loop gains one step after "watcher → alert": "inbound canary receipt matched → gap computed."

## 6 · Schema deltas (adds to master audit §2)

```prisma
model Workflow {
  // ...existing fields, plus master-audit additions...
  canaryAddress  String?  @unique   // canary-<publicId>@in.euclio.io, null = heartbeat-only
  expectations   CanaryExpectation[]
  receipts       CanaryReceipt[]
}

model CanaryExpectation {
  id          String   @id @default(cuid())
  workflowId  String
  workflow    Workflow @relation(fields: [workflowId], references: [id])
  rule        String   // recurrence, RRULE-style ("weekdays by 09:05")
  windowMins  Int      @default(30)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
}

model CanaryReceipt {
  id            String   @id @default(cuid())
  workflowId    String
  workflow      Workflow @relation(fields: [workflowId], references: [id])
  receivedAt    DateTime
  fromAddr      String?
  subjectHash   String?  // hash only; body discarded after FF1 checks
  expectationId String?  // matched occurrence, null = unexpected send
}

// Incident gains: sendsDue Int? , sendsArrived Int?   (gap accounting, denormalized)
// WorkflowDailyStat gains: receiptsCount Int @default(0)   (12-month rollup keeps arrival math)
```

Retention follows principle 3: receipts prune with raw pings; daily rollups preserve the counts for the twelve-month ledger.

## 7 · Inbound mail — tech spec sketch

Subdomain `in.euclio.io`, MX routed to an inbound provider (Cloudflare Email Routing or SES inbound → webhook; pick whichever the stack already touches). Webhook handler: parse headers → resolve workflow by address → match against the nearest open expectation occurrence within its window → write `CanaryReceipt` → if an incident is open on that workflow, recompute `sendsDue`/`sendsArrived`. Store headers and a subject hash only; bodies are read transiently for FF1's integrity checks and never persisted. Unmatched receipts log with `expectationId: null` and surface nowhere client-facing (they're a debugging signal, and later the raw material for cadence baselines in v2). Failure isolation mirrors the ping snippet's rule: an inbound outage may never affect the freelancer's workflow — the canary is a passive recipient by construction.

## 8 · Outreach & discovery deltas

Cold Email 1 stays a pure question, no pitch — first-send verification does **not** go into it. It goes into the discovery-call script as a new question alongside the worried-question frequency probe: "When you take on a new client, how do you know the first sends actually landed?" — and into the onboarding kit (FF2) as the day-one moment. If a discovery call bites on that question hard, that's the validation signal for making first-send the wedge in later outreach.

## 9 · Landing page — shipped state

`index.html` (this delivery) is the canonical page: certainty H1 ("Bad news should never come from your client"), answer-moment hero with "The ledger:" label, three moments with the canary named and the two-row sending-end/receiving-end panel under Minute one, first-send milestone atop the ledger mock, gap accounting and canary verification named in the Does column, bench line updated (content integrity nearest, then pause switch and expiry radar), Sergio's photo/signature/email intact, both research quotes verbatim and uncited, bone palette. 757 visible words; both em-dashes inside mock voices; no invented citations. Still pending before deploy: replace the GoatCounter `YOUR-CODE` placeholder.

## 10 · Repo hygiene

One canonical source from now on: the `euclio-landing` git repo. Replace its `index.html` with this file wholesale, delete `styles.css` (the page is self-contained and no longer links it — this also removes the conflicting ledger rules aider's editor model introduced), and commit. Drop `aider_CONVENTIONS.md` (delivered alongside) into `aider/CONVENTIONS.md` so any future aider session loads the voice and honesty rules it was missing; its startup log showed it looks for exactly that path. Retire the parallel copy that lived outside the repo — divergent lineages are how "copy nobody wrote" appears.

## 11 · Packaging & delivery doctrine (verified against the ingestion-decision chat)

**Provenance:** originally reconstructed from artifact fingerprints; now reconciled against the full "ingestion integration decision" conversation. The reconstruction held on fail-open, HTTP-first, agent-native, and no-published-SDK. It got two things wrong, both corrected below, and missed several decisions entirely. Where anything below is silent, that chat's own decision doc (in the project) is the source of truth.

**The mechanism.** Platforms: one native HTTP module, `POST https://api.euclio.io/ping/{token}`, and the endpoint accepts GET as well (removes a whole class of which-method setup mistakes). No listed integrations — no Zapier app, no n8n community node; native HTTP won on every scored dimension. Custom apps: **snippet, not SDK** — correcting this addendum's earlier "codegen, not SDK" framing, which over-credited `euclio-init`. The primary mechanism is a dashboard-generated, per-language copy-paste snippet (curl / Node / Python), token pre-filled, paired with the live "✓ test ping received" confirmation — the confirmation being the real friction-killer. `euclio-init` is an optional Node-only fast-follow that generates the same snippet; a published SDK package is banned outright (scored 10 vs the snippet's 18; its worst failure mode — our code crashing the automation we're paid to watch — is the inversion of the product promise). Recorded reopening condition: the SDK question returns only if the sensor deepens toward structured payloads or agent traces, and only from an installed base of trust.

**The snippet contract.** Wrapped in try/catch so an Euclio outage can never crash the automation; 3–5 second timeout, one retry at most; awaited, not fire-and-forget, so serverless runtimes don't freeze before the ping leaves; zero dependencies (fetch on Node 18+, requests/urllib on Python, curl in shell). With diagnostics enabled it grows to roughly twenty lines, so all copy says "one check-in," never "one line," and inspectability is the trust feature: a snippet you can read in full.

**/fail is launch scope** ("demoing wins"): `POST /ping/{token}/fail` from day one. An explicit fail opens the incident immediately with no debounce (silence detection keeps its debounce); repeated fails while an incident is open never re-alert; the snippet's catch-block pings /fail instead of swallowing; n8n's Error Workflow and Make's error route each get a copy-paste HTTP-module variant mapping the error-message field only, never the execution payload. facts.ts gains the distinction between "reported a failure at 9:02am" and "stopped checking in at 9:02am."

**Diagnostics and the data principle** (principle 7 in the plan): error capture is opt-in per workflow, default off, and the checkbox simply changes which snippet is generated — consent and mechanism are one artifact. Layered scrub: truncate to ~200 chars, client-side pattern redaction visible in the pasted code, a server-side second pass at ingest (the only pass for platform users), hard cap, 30-day TTL with nightly purge, and the firewall: errorText renders in the freelancer's incident view only and structurally cannot reach a ClientUpdate. Copy discipline: never "we never receive it," never "we catch everything" — layered-and-deleted is the claim. Parked and still parked: quiet redaction vs. the visible "we redacted what looked like a credential" flag.

**The canary under the same doctrine** (this addendum's extension, now explicitly tied in): the canary is a far larger client-data surface than a 200-character error string, so it inherits principle 7 wholesale — headers and subject hash only, bodies read transiently for FF1's integrity checks and never persisted, receipts pruned on the same schedule as raw pings with rollups preserving the counts, and canary content firewalled from ClientUpdate exactly as errorText is.

**Agent-native, corrected placement:** the mechanism is a fourth "copy for your coding agent" tab in the M1 snippet dashboard — one paragraph ("add this check-in at the end of the main run path, wrapped so it can never throw") — not the FF2 document this addendum previously specified. FF2's onboarding kit extends that tab with the canary address and expectation setup.

**Zapier free tier:** the exclusion is structural to Zapier (multi-step Zaps require a paid plan, and pings consume task quota), not created by Euclio's mechanism. One legible sentence in the setup docs; no build item; no listed app.

**The scope line, and the one conflict this reconciliation surfaces:** the ingestion chat closed with a hard line — "/fail + scrubbed diagnostics is the last pre-partner addition." This addendum's M5.2 (canary + gap accounting into launch scope) crossed that line. The crossing was conscious: the landing page's "four arrived" made the canary load-bearing, and the honesty rule outranks the scope rule. The line is re-drawn after M5.2 and hardens: nothing else enters launch scope unless a design partner asks for it or a public claim requires it.

**Blind spots carried forward** (documentation and onboarding problems, not SDK-solvable, per the source chat): a snippet pasted before the work completes produces a heartbeat that lies healthy; serverless edge cases (Lambda freeze, Workers waitUntil) can drop an awaited ping; a workflow that partially completes past the ping node is invisible; a freelancer who edits out the try/catch restores the crash risk.

**Principle numbering:** the plan already carries at least seven principles, so THE CANARY OBSERVES, IT DOES NOT INFER and NEVER IN THE CRITICAL PATH are appended by name after the last existing principle. NEVER IN THE CRITICAL PATH is confirmed by the snippet contract above; the kill-switch resolution (defaults to run on any timeout or error, weakened promise stated wherever described) stands.

**Validation items adopted:** time one real partner setup before the "two minutes" claim travels further than the landing page; add to the discovery script, alongside the worried-question and first-send probes: "Would you add an npm or pip package from a new tool into a client's codebase, or would you rather paste a few lines?" One question, and the SDK debate stays settled on evidence.

**Landing page deltas shipped with this reconciliation:** the Does column gains "Catches the reason too, when you opt in: error text scrubbed before it leaves your machine, deleted after 30 days." A subsequent pass replaced the coda's inspectability *claim* with the demonstration itself: the canonical six-line snippet now renders in "The whole setup" (try/catch, POST, 4s timeout, the fail-open promise as the code comment), with the "\u2713 test ping received" confirmation beneath it and the platform HTTP-node line restored above it. This makes the page snippet a public promise of the contract: **the snippet shown on the page and the snippet the dashboard generates must never diverge** — treat any change to either as a change to both. Capability internals stay withheld (gap-accounting mechanics, canary matching, /fail wiring, the diagnostics variant, the note flow); the refined curiosity rule is *show the contract, withhold the internals*. The earlier deltas (the fail-open Doesn't line, the coding-agent clause) stand. Moment two now carries a screenshot of the ledger view, base64-embedded so index.html stays a single self-contained file (the external-file variant broke local preview and was reverted). Source of truth: euclio-answer-view.html; the build script embeds the PNG asset at build time. When the app design changes: edit that HTML, re-screenshot, re-run the build. The scramble-vs-ledger compare block it replaced survives as the image caption. A footprint-emphasis pass followed: the Doesn't column gains "Install anything. No package in your code, no plugin in your platform. The whole footprint is one request"; the platform note now sells the native-module benefit ("nothing that breaks when the platform updates"); the snippet note opens with the verifiable footprint claim. Claim discipline recorded: "one request is the whole footprint" is the ceiling — never "zero overhead" (the request is the overhead, capped by the timeout), and the Zapier task-consumption cost lives in the setup docs, never denied and never on the page.
