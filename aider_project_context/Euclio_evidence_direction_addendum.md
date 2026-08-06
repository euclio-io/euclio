# Euclio — Evidence Direction Addendum (decision record)

> **Aug 6, 2026.** Reconciles the August AI-strategy conversations (landing-page
> critique → observation types → evidence model → expectations-spec) into the
> docs. Companion to `Euclio_canary_synthesis_addendum.md`. Style rule inherited
> from it: this file records decisions; CLAUDE.md and the implementation plan
> receive only the exact edits listed in §7. Nothing in this addendum enters
> launch scope. The scope line stands: **nothing enters launch scope unless a
> partner asks or a public claim requires it.**

---

## §1 · The decision in one paragraph

Euclio's identity is **evidence that the real-world outcome happened** — not
"monitoring," and not "Sentry for business workflows" (internal/investor
shorthand only; never page copy — it imports a developer audience and a
category we don't want). The long-term product model is four concepts:
**Workflow → Run → Check → Ledger**, where every future integration is nothing
more than a new way of resolving a Check. The long-term setup UX is
expectations-first ("What happened? / What should have happened?"), specified
in `euclio-expectations-spec.md`. All of this is **v2 direction**: it shapes
vocabulary, page copy, and the order in which future work is considered — and
changes zero launch milestones. Launch scope remains exactly
**M4 → M5 → M5.2 → M5.5**, after which design partners are the next milestone,
not more product.

---

## §2 · Adopted now (costs launch nothing)

1. **Identity + category language.** "Evidence," "verified," "confirmed,"
   "proof," "facts," "the ledger" are the product's vocabulary. Never "logs,"
   "traces," "dashboard," "uptime," "observability" in customer-facing surfaces.
   (This extends, and is enforced by, the facts.ts discipline of Principle 1.)
2. **The four-concept model as design north star.** Workflow → Run (an event)
   → Check (evidence: pending | verified | failed | timed_out) → LedgerEntry.
   Test every proposed feature against: *does it produce or resolve evidence a
   freelancer can forward to a client?* Metrics dashboards, p95 charts, and
   uptime percentages fail this test and stay out.
3. **Landing page v2 — shipped Aug 6.** Thesis ("Sent and arrived are different
   facts") promoted to the hero lede; "✓ Answer Ready" as a named state (pill,
   card close, Does column); canary reframed as a real inbox sitting among the
   client's customers; sent/arrived echo added at the ledger caption; nav
   "Dashboard" → "Your ledger"; meta description aligned. Recorded here so the
   next audit doesn't flag the page as drifted — the page moved *toward* this
   addendum.
4. **Answer Ready, defined precisely.** Answer Ready = the facts block of an
   incident, assembled mechanically and *only* from verified checks, one
   template line per check kind; anything unverified is absent from the draft,
   never guessed. See §5.1 for how this coexists with the required human read.
5. **`euclio-expectations-spec.md` enters `aider_project_context/`** as the v2
   setup-UX specification. It is a discovery artifact first: in partner
   conversations, the Screen-2 checklist is shown and the partner is asked
   which boxes they'd tick for a real workflow. Which boxes get reached for is
   the roadmap vote.

---

## §3 · Rejected (with the principle that rejects it)

- **Per-node workflow graphs / verifying steps inside the workflow.** Requires
  platform APIs or user-maintained pipeline definitions inside Euclio — pulls
  Euclio inside the workflow. Violates the outside-the-fence differentiation
  and the never-in-critical-path doctrine. Euclio verifies *endpoints*
  (outcomes), and the opt-in scrubbed diagnostics already answer "why."
  Rejected for the foreseeable product, not merely deferred.
- **Watching workflow definitions to suggest rules (platform OAuth).** The
  original "Phase 4" magic as proposed = reading n8n/Zapier/Make configs via
  their APIs. That is the integration burden the whole strategy exists to
  avoid, and it contradicts "doesn't touch your automations." Rejected in that
  form; reshaped in §4 as evidence-learned suggestions.
- **"Open tracked" as evidence.** Pixel-based opens are fiction under Apple
  MPP and increasingly elsewhere. A product whose brand is "confirmed, not
  guessed" does not report unreliable facts. Violates Principle 1 and
  Principle 9. Rejected permanently.
- **Browser (Playwright) verification.** Headless fleet, flaky selectors,
  anti-bot walls — permanent maintenance for marginal coverage the HTTP check
  handles for public outcomes. Deferred indefinitely; treat as rejected unless
  multiple partners bring an outcome only a browser can prove.
- **Dynamic / PII variable matching (`{{first_name}}`, `{{booking_id}}`).**
  Requires pings to carry customer PII, converting Euclio into a data
  processor and breaking Principle 8 and the canary data rule (headers +
  subject hash only, bodies transient). Not rejected forever — recorded as a
  **conscious privacy decision deferred**, to be reopened only deliberately,
  never as a feature checkbox. Static `contains` checks on the transient body
  at ingest (verdict persisted, body never) are the compatible form.

---

## §4 · Deferred, with promotion triggers

Each item below is out of scope until its trigger fires. When one fires, it is
promoted by a doc edit in the same commit as the code (the standing ritual).

| Item | Promotion trigger | Lands as |
|---|---|---|
| **Evidence type #2: "A system confirms"** (webhook fact, `POST /evidence/{wf}/{fact}`) | A partner needs a non-email outcome proven (CRM row, booking update, file upload) — expected to fire first | The schema-generalization migration (§6) + one route beside ping ingest |
| **Evidence type: "An answer checks out"** (HTTP assertion, outbound probe) | A partner's outcome is a public URL/API state; or ≥2 discovery conversations cite it | Prober process in the watcher tier; body never stored, verdict + ≤200-char excerpt only |
| **Richer email checks** (subject/from/attachment/SPF-DKIM verdicts) | Already promised publicly in soft form (founder note: "checking each send looks right") — promote when M5.2 is stable and a partner hits an arrived-but-wrong incident | Sub-checks on the canary at ingest, transient body inspection |
| **Slack canary / SMS canary** | Demand taps on the grayed checklist items, or a direct partner ask | New resolvers; SMS via Twilio number, Slack via bot-in-channel |
| **AI output validation (rule-based)** | A partner runs an AI-step workflow | Cheap checks first (non-empty, length, contains); LLM-as-judge is a separate future decision |
| **Evidence-learned suggestions** (the reshaped Phase-4 magic) | ≥2 partners with a week of ledger history | Euclio proposes expectations from *observed* pings/receipts ("this runs weekdays ~9am and sends 'Appointment Reminder' — want me to expect both?"). Zero platform integration. Optional cousin: paste-your-n8n-JSON-export one-time import — no OAuth, no watching |
| **Expectations checklist UI** (spec Screens 1–3) | After M5.5 ships and ≥1 partner onboards on the current setup | Replaces setup incrementally; the spec's defaults table governs |
| **Conditions / OR logic; multiple assertions per check** | A partner writes a workaround for their absence | Only then |

---

## §5 · Reconciliations with existing doctrine

Points where the expectations spec and current principles could be read as
conflicting. Resolved here so no future model "optimizes" a principle away.

1. **Answer Ready vs. Principle 2 (the required human read).** Answer Ready
   assembles the *facts* portion only. The "what it means / your read" slot
   remains human-only, REQUIRED, and send-blocking, exactly as M5.5 specifies.
   Any future automation of the read slot is a principle violation, not an
   improvement. Mechanical facts + mandatory human meaning is the product.
2. **Generalized checks inherit watcher doctrine.** Any future Check type gets
   debounce-equivalent grace, retry/suppression rules, and reconciliation-based
   processing. A check that cries wolf is dead, same as a monitor. The spec's
   deadline/retry defaults are subordinate to the watcher's anti-flap rules.
3. **Ledger-line templates pass through facts.ts.** The spec's example lines
   are illustrative; production templates use only observational language and
   the banned-words test extends to them. (E.g., "responded 200 in 0.8s," not
   "page live" — "live" is an inference.)
4. **HTTP-check auth secrets** (optional header for non-public endpoints) are
   a new sensitive-data class not covered by Principle 8. Storing encrypted
   probe credentials is a decision to make at that item's promotion, not a
   default.
5. **The footprint promise bends honestly at the webhook fact.** "The whole
   footprint is one request" becomes "one request per fact — still nothing
   installed" the day evidence type #2 ships. The copy change ships in the
   same commit as the route.

---

## §6 · Schema: generalize at evidence type #2, not before

M5.2 lands the canary-specific tables exactly as the canary synthesis addendum
§6 specifies (`CanaryExpectation`, `CanaryReceipt`, gap counters). **Do not
pre-generalize.** Abstracting Expectation/Check from a single concrete
evidence type is how the wrong abstraction gets built; the general model is
earned by the second type. When that trigger fires, the migration maps:

```
CanaryExpectation           → Expectation { type: "email", params }
CanaryReceipt               → Check.evidence (verified email check)
Incident.sendsDue/Arrived   → Incident.impact { due, arrived, affected }
WorkflowDailyStat counters  → unchanged (rollups survive, Principle 7)
```

Until then the schema stays boring.

---

## §7 · Exact edits to apply (and nothing else)

**Files added to the repo this commit:**
- `aider_project_context/Euclio_evidence_direction_addendum.md` (this file)
- `aider_project_context/euclio-expectations-spec.md`

**CLAUDE.md — two edits:**
1. In the header paragraph, after the canary addendum citation, append:
   `…and `Euclio_evidence_direction_addendum.md` is the v2 direction record
   (identity, evidence model, deferred items + triggers). Nothing in it is
   launch scope.`
2. In **Do NOT build**, append one line:
   `- per-node workflow graphs, platform-API workflow watching, browser/Playwright
   checks, open-tracking, PII variable matching (see evidence addendum §3)`

**Implementation plan — no edits.** M4 → M5 → M5.2 → M5.5 unchanged. The
plan's scope-line paragraph already covers this addendum by reference to the
rule it restates.

**Landing repo:** GoatCounter script removed (decision: no analytics for now —
Aug 6). No other page changes; landing v2 already shipped.

---

## §8 · Status log

- **Clerk production instance:** DONE (plugged in, Aug 6).
- **GoatCounter:** dropped. The placeholder script tag is deleted from
  `index.html` (dead third-party request otherwise). If analytics are wanted
  later, that's a fresh decision — nothing depends on it.
- **Repo position:** M0–M3 shipped and audited (Aug 6); docs reconciled;
  next commit is M4 (alert email).
- **Design partners:** next milestone after M5.5 — demo parity with the
  landing page is the gate. Quiet discovery conversations (the one question:
  *"when did an automation last break and your client noticed first — what was
  it?"*) run in parallel starting now; they cost no build time and pre-warm
  the partner pipeline. Answers get logged per conversation and vote on §4
  triggers.

---

## §9 · The scope line, restated

Unchanged and hardened by this addendum: **nothing enters launch scope unless
a partner asks or a public claim requires it.** This document is the third
strategy reframe this project has absorbed; unlike the first two, it enters
through the docs with zero scope change — which is the ritual working. When
the next compelling reframe arrives, it gets an addendum, a trigger table,
and no milestones.
