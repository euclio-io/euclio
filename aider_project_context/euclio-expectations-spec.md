# Euclio — "What should have happened?" · Setup flow spec

**Scope:** the workflow-setup experience that replaces "create an integration" with declared expectations, the four expectation types shippable against the current ping + canary architecture, and the data model each compiles down to.

---

## Principles

1. **Expectations, not integrations.** The user declares outcomes; Euclio figures out how to prove them.
2. **Business language everywhere.** Checklist items name outcomes a freelancer recognizes ("An email arrives"), never mechanisms ("Configure IMAP polling"). The noun the user types at setup is the same noun in the ledger and in Answer Ready.
3. **Ticking a box is a complete configuration.** Every field has a default. A user who ticks and saves without typing gets a working, sensible expectation.
4. **Every expectation previews its ledger line.** As the user configures, they see the sentence the ledger will write when it passes. Configuration happens in the same language as the product's output.
5. **Stay outside the workflow.** Three of the four launch types require zero changes to the automation. The fourth (A system confirms) adds exactly one HTTP request, and says so honestly.

---

## The flow: three screens

### Screen 1 — What happened?

Establishes the anchor: what a "run" is and when to expect one.

| Field | Type | Default | Notes |
|---|---|---|---|
| Workflow name | text | — | e.g. "Appointment reminders". Becomes the ledger heading. |
| Client | select / create | — | Ledgers are kept per client. |
| When does it run? | radio | *Learn it* | Options below. |

**"When does it run?" options:**

- **On a schedule** → reveals cadence: `Every [n] [minutes / hours / days]` or `[Weekdays / Every day / Custom days] at [time]`, plus timezone (defaults to account TZ).
- **When something happens** (a form is filled, an order comes in) → event-driven. No missed-run alarm; runs are counted and verified, not scheduled. Optional field: `Flag if quiet for [7] days` (catches dead triggers without false alarms).
- **Learn it from the first week** *(default)* → Euclio infers cadence from observed pings, shows the learned schedule after ~7 days for one-tap confirmation, then arms the missed-run alarm.

**Output:** a `Workflow` record with `anchor_mode` and `schedule`.

---

### Screen 2 — What should have happened?

A checklist. Ticking an item expands it into a short form inline. All ticked expectations are implicitly **AND**ed: every one must pass for the run to count as verified. (Conditional logic — "if VIP, also expect SMS" — is deliberately out of v1.)

```
What should have happened?

☑ The workflow checks in            (pre-ticked; this is the ping — the anchor)
☐ An email arrives
☐ A system confirms
☐ An answer checks out
▨ A text arrives          · soon — tap to ask for it
▨ A Slack message posts   · soon — tap to ask for it
```

The two grayed items are visible but disabled. A tap registers demand ("We'll email you when this is live") — the roadmap doubles as a demand survey.

---

### Screen 3 — The receipt

- The generated snippet(s): the ping URL, plus one evidence URL per "A system confirms" fact. Same presentation as the current landing-page setup block (try/catch, 4s timeout, "an Euclio outage never touches your work").
- The canary address to add to the send list, if "An email arrives" is ticked.
- A **Test** button per snippet → live `✓ test ping received · 0.4s` confirmation.
- A **ledger preview**: the quiet-day line this workflow will write once running ("All quiet · 212 sends, 212 arrivals"), so the payoff is visible before day one.

---

## The four launch expectation types

Deadlines for every type are anchored to the run: `run.started_at + offset`. The ping *is* the anchor — which is why "The workflow checks in" is pre-ticked and required.

---

### 1 · The workflow checks in

*Proves the workflow ran when it should.* Exists today; this spec just formalizes it as the first checklist item.

**Fields**

| Field | Default | Notes |
|---|---|---|
| Schedule | inherited from Screen 1 | Not repeated here. |
| Grace period | `5 minutes` | For sub-hourly cadences, default to 25% of the interval instead. |

**Evidence produced:** ping timestamp.
**Failure:** no ping by `scheduled_time + grace` → incident opens ("paused"), reconciliation starts (see Incidents below).
**Ledger lines:** `Checked in 9:01am · on schedule` · `Reminder sync paused 12 min, caught in one`.

---

### 2 · An email arrives

*Proves what the client's customers receive actually arrives — sent and arrived are different facts.* The canary is auto-provisioned per workflow (one silent address added to the send list; no workflow changes).

**Fields**

| Field | Default | Notes |
|---|---|---|
| Within | `5` minutes of the run | Deadline offset. |
| How many per run | `Exactly one` | Options: exactly one / at least one / `[n]` (batch sends). |

**Optional sub-checks** (collapsed under *"Also check the message looks right"* — this is the "checking each send looks right" roadmap item from the founder note):

| Check | Input | Default state |
|---|---|---|
| Subject contains | text | off |
| From address is | email | off |
| Body contains | static text | off |
| Has an attachment | min size `[10]` KB | off |
| Authentication passes (SPF/DKIM) | toggle | **on** (free to verify, high-value catch) |

Body/subject matching is **static text only** in v1. Dynamic per-customer matching (`{{first_name}}`, `{{booking_id}}`) is deliberately excluded — it requires the ping to carry customer PII, which changes the privacy posture ("scrubbed, deleted in 30 days") and is a separate strategic decision.

**Evidence produced:** message-id, received-at, delay vs. ping, auth results, size, matched checks.
**Failure modes:** deadline passes with no matching message → incident, kind *sent-but-not-arrived*. Message arrives but a sub-check fails → incident, kind *arrived-but-wrong* (distinct, because the client conversation is different).
**Ledger line:** `Reminder arrived 9:01am · 43s after send · checks passed`.

---

### 3 · A system confirms

*Proves any other outcome — booking updated, contact created, PDF uploaded — by that step calling Euclio.* This is the webhook-received evidence type: a per-fact URL, generated at setup.

**Fields**

| Field | Default | Notes |
|---|---|---|
| Name this fact | — (required) | e.g. "Booking updated". Free text; slugged into the URL; becomes the ledger noun verbatim. |
| Within | `2` minutes of the run | Deadline offset. |
| Payload must include | `[field]` = `[value]` | Optional; one key/value pair in v1. |

**Generated:** `POST https://api.euclio.io/evidence/wf_8f2a/booking-updated` with the same fire-and-forget snippet pattern as the ping.

**Honesty note for the UI copy:** this is the one expectation that touches the workflow — one added HTTP request at the step being proven. Say so: *"One more request, at the step you want proven. Still nothing installed."* The Does/Doesn't promise bends from "one request" to "one request per fact" — it does not break "no package, no plugin, no dependency."

**Evidence produced:** received-at, payload hash, matched field/value.
**Failure:** deadline passes → incident, named by the fact: *"Booking updated: not confirmed."*
**Ledger line:** `Booking updated · confirmed 9:02am`.

---

### 4 · An answer checks out

*Proves a URL says what it should after the run* — public page updated, API status correct, file downloadable. Euclio probes from outside; zero workflow changes, zero OAuth.

**Fields**

| Field | Default | Notes |
|---|---|---|
| URL | — (required) | https only. |
| First check after | `30` seconds | Then retry `[3]` times, one minute apart. Retries must finish before any later deadline. |
| Expect status | `200` | |
| And *(optional, choose one)* | — | `Response contains [text]` **or** `Field [json.path] equals [value]`. One assertion in v1. |
| Auth *(optional)* | header name + value | For non-public endpoints. Value encrypted at rest, never shown again after save. |

**Retention rule:** the response body is never stored — only the verdict, latency, status, and (on a text match) a ≤200-character excerpt around the match. Keeps the privacy story intact.

**Evidence produced:** status, latency, matched excerpt, attempt count.
**Failure:** retries exhausted → incident.
**Ledger line:** `Order page live · responded 200 in 0.8s`.

---

## Data model: what each expectation compiles to

Five records carry the whole system. Every integration ever added later is just a new way of resolving a `Check`.

```
Workflow    { id, client_id, name, anchor_mode, schedule }
Expectation { id, workflow_id, type, params{}, deadline_offset }   ← saved rule
Run         { id, workflow_id, started_at, source: ping }          ← an Event
Check       { id, run_id, expectation_id,
              state: pending | verified | failed | timed_out,
              evidence{}, resolved_at }                            ← Evidence
LedgerEntry { id, workflow_id, run_id?, kind, human_text, check_refs[] }
Incident    { id, workflow_id, opened_at, check_refs[],
              impact{ due, arrived, affected },
              answer_ready_draft, state: open | resolved }
```

**Lifecycle of one run:**

1. Ping hits `/ping/{wf}` → `Run` created.
2. One pending `Check` spawns per enabled `Expectation`, deadline = `started_at + offset`.
3. Resolvers work independently: the **canary matcher** (inbound mail → matching pending email checks), the **evidence receiver** (webhook route → matching fact checks), the **prober** (scheduled HTTP attempts), the **scheduler** (watches for the next expected ping).
4. All checks verified → run folds into the quiet-day roll-up (`All quiet · n sends, n arrivals`).
5. Any check failed or timed out → incident logic.

**Matching rules:** inbound canary messages attach to the most recent `Run` whose deadline window is open. A message with no matching run becomes a quiet ledger note (*"send recorded with no run"*) — logged, not alarmed, in v1. It's a genuinely interesting fact (someone ran the workflow outside the automation?) but not an incident.

---

## Incidents, reconciliation, and Answer Ready

**Opening:** a missed check-in opens an incident after grace; any other check opens one when its deadline passes or retries exhaust. Multiple failing checks on the same run share one incident.

**Reconciliation (the "four due, four arrived" engine):** on a pause, compute sends due in the gap from the declared/learned cadence; as the canary confirms arrivals, count them against dues. The impact block — `due / arrived / customers affected` — is what makes the incident a business fact instead of an alert.

**Answer Ready assembly:** the draft is built only from verified facts, one template line per check kind:

- check-in → *"a 12-minute pause Tuesday morning, caught in one"*
- email → *"all four reminders due in that window were delivered"*
- fact → *"the booking record was confirmed updated"*
- HTTP → *"the page came back healthy at 9:04"*

Anything unverified is **absent from the draft, never guessed** — the mechanical enforcement of "Confirmed, not guessed." Resolution: the next fully verified run auto-resolves the incident and writes the catch line to the ledger.

---

## Deliberately excluded from v1

- **Variables / dynamic PII matching** — privacy decision, deferred; static `contains` only.
- **Conditions** (if/then, OR) — everything is ANDed; revisit when real usage shows demand.
- **Browser (Playwright) checks, database row checks** — heavy infrastructure; the HTTP check covers the public-outcome cases cheaply.
- **Per-node workflow graphs** — Euclio verifies outcomes from outside, not steps from inside.
- **Multiple assertions per HTTP check** — one URL, one assertion; add a second check instead.

---

## Copy rules for the screen

- Checklist labels are outcomes in plain verbs. No vendor names in labels (vendors appear in helper text: *"works with anything that can send a request — n8n, Make, Zapier, your own code"*).
- One vocabulary end to end: the fact name typed at setup is the noun in the snippet URL, the ledger, and the Answer Ready draft.
- Failure copy states what wasn't proven, not what code failed: *"No reminder reached the canary within 5 minutes"*, never *"SMTP timeout (code 421)"*.
- The word **verify/verified** for passing checks, **confirmed** in client-facing drafts, **the ledger** for the record — never logs, history, or dashboard.