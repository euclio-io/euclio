> **STATUS (Jul 30, 2026):** Research corpus + feature source. Gap accounting graduated to launch scope (M5.2) per `Euclio_canary_synthesis_addendum.md`. Evidence remains valid.

# Euclio — Client-Moment Features & Gap Accounting (product change map)

*Source: inversion sessions on the client-facing layer (July 2026). The governing test for anything client-facing: it must remove a moment of effort or anxiety the client already has, give them nothing to operate, and never disintermediate the freelancer. No new client-facing surfaces — the freelancer remains the only interface.*

---

## The five features, as product changes

### 1 · "Make replying magic" — the per-client incident history
**Client moment served:** "A customer says they never got their reminder" → the client hits reply → the freelancer answers instantly and precisely.
**Product change:** a per-client incident history view — every incident for that client, with facts and durations, scannable in seconds while writing a reply. No new data; it's a list query over what M3/M5 already record.
**Build cost:** trivial. **When:** M5-adjacent or first fast-follow.

### 2 · The year-in-catches recap
**Client moment served:** renewal — the client justifying the retainer to themselves, a partner, an accountant.
**Product change:** a new ClientUpdate kind (`recap`) composed from incident aggregates over a date range ("this year: 7 things caught and fixed before they reached you; 4,100 reminders out the door"). Same compose-review-send flow; human note required, as always.
**Build cost:** aggregate queries + a compose variant. **When:** v2 by necessity — it has no value until months of data exist. But it creates two *present-day* obligations (see "Change now" below): the `kind` field and the data-retention decision.

### 3 · The "what runs for you" map
**Client moment served:** dependency anxiety — the client not knowing what automations exist in their own business.
**Product change:** per-workflow client-facing fields — `clientFacingName` + a one-line plain-language `clientDescription` ("appointment reminders — texts your patients the day before") — captured in the add-workflow form. A generated one-page, jargon-free inventory the freelancer sends at onboarding.
**Guardrail:** must read as "here's the map, I hold it" — reassurance, never complexity. No counts, no statuses, no tech nouns.
**Build cost:** two schema fields now; the rendered map is v2. **When:** fields in M1, map later.
**Side discovery (do this regardless):** `facts.ts` should render the *client-facing* name, not the internal workflow name. "Appointment reminders stopped checking in" lands; "wf-northgate-sms-v2 stopped checking in" doesn't.

### 4 · "The watch doesn't sleep"
**Client moment served:** the freelancer's absence — holidays, quiet weeks.
**Product change:** almost none — the dead-man's-switch already makes the claim *true*. What's missing is making it *sayable*: ready-made "what to tell your client" copy inside the product (e.g. a vacation line: "even while I'm away, the monitoring never stops and I'll hear about anything within minutes"). Optionally later, a `coverage` ClientUpdate kind.
**Implied hardening (v2):** if the promise is "I'll hear about it even on holiday," the freelancer-side alert should be hard to miss — an optional SMS alert channel to the *freelancer* (never the client).
**Build cost:** copy now; SMS alert later.

### 5 · Gap accounting (from the Sentry-contact signal)
**Client moment served:** the inevitable question after any incident — "did anything get missed?" Today the freelancer reconstructs the answer by hand; the enterprise version of this pain ("it affected X users before we knew") is the same question at scale.
**Product change:** the incident view gains historical-context lines built from data Euclio already holds — check-in cadence and the optional `Ping.payload` metric:
> "In the past 30 days, this workflow checked in ~24×/day."
> "It normally reports ~15 reminders/day."
The freelancer combines these with their own investigation to give the client a fact-based answer.
**The honesty rule, extended:** gap lines state *history only*, never inference. "~8 runs were missed during the gap" is inference and is banned — it claims knowledge Euclio doesn't have. Add this phrasing class to the `facts.ts` banned-words test suite (no "missed," "would have," "were affected," or any estimated-impact construction in generated text).
**Positioning boundary this feature enforces:** Euclio's promise is "know the moment it stops running" — never "know when it has a bug." The Sentry-customer story proves even instrumented teams can't promise semantic-failure detection; heartbeats catch absence, not wrongness. Marketing must never drift across this line.
**Build cost:** moderate (rolling stats + rendering + tests). **When:** fast-follow after M5.5.

---

## Change NOW (inside M0–M5.5 — cheap, prevents migration pain)

1. **M1 form:** add `clientFacingName` + `clientDescription` to Workflow; prompt "what would your client call this?"
2. **facts.ts:** render client-facing names in all client-facing text.
3. **Schema:** `ClientUpdate.kind` as an extensible enum (`incident | all_green`, with `recap` / `coverage` reserved).
4. **Data retention decision:** recap and gap accounting both need history. Either keep Pings ≥ 12 months, or (better) add daily rollups (per-workflow: check-in count + payload-metric sum per day) so pruning raw pings never destroys the math.
5. **Copy asset:** the vacation line + "what to tell your client" snippets — content work, zero code.

## Fast-follow (after first design partner is live)

- Per-client incident history view (#1)
- Gap-accounting context lines + banned-inference tests (#5)

## v2 (needs accumulated data or new infra)

- Year-in-catches recap composer (#2)
- Rendered "what runs for you" map page (#3)
- Freelancer-side SMS alert option (#4)

## Explicitly rejected (unchanged)

- Any client-facing login, portal, dashboard, or app
- On-demand status ("text STATUS anytime") — pull in a trench coat
- Any generated text that characterizes severity, impact, or what was missed

---

*The pattern across all five: none give the client a thing to use — they give the freelancer a well-timed, fact-grounded thing to send at the client's four anxious moments (something looks off · renewal · "what even runs?" · the freelancer's absence) plus the one question every incident produces ("did anything get missed?").*
