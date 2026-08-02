> **STATUS (Jul 30, 2026):** Authoritative. Extended: the slot grammar (facts generated, meaning slot human-only and required) now also governs the answer-view summary — see `euclio-answer-view.html` and `Euclio_master_reference.md`.

# Euclio — The Note Spec (M5.5 compose requirements)

*The client-facing note, specified. Folds the interpretation-layer research into build requirements for the M5.5 `ClientUpdate` compose flow. This supersedes any earlier description of "the email" — the note is channel-agnostic (email default; text and Loom-script renderings are copy variants of the same content).*

---

## Design principle (governs every decision below)

**The note's job is felt presence, not information transfer.** Success = the client absorbs "he's on top of it" in a five-second skim. A skim is a read. Therefore the note must fully deliver its message in the subject + first line; everything after is optional depth. Never measure this artifact by whether the body was read.

Corollary: the value of the product rides on the **event heads-up** (the catch-moment). The **monthly note** only proves pulse. Do not ask the monthly note to carry stakes it can't hold.

---

## 1 · Subject line (the designed surface)

- **Pattern:** client's business noun + what happened + resolution state.
  - ✅ `your booking reminders this morning — caught & fixed`
  - ✅ `quick one about your review requests (handled)`
  - ❌ `Update` · ❌ `June check-in` · ❌ `Monitoring alert` · ❌ anything with "report"
- **Always the client-facing workflow name** (`clientFacingName`), never platform or internal names.
- **Monthly note subjects must vary every month.** A repeated subject trains archive-on-sight. The compose flow should show the last 3 subjects used for this client and refuse an exact repeat.
- No brackets, no emoji, no ALL CAPS, no "[Automated]" markers of any kind.

## 2 · First line (carries the entire message)

One sentence containing all four beats: something happened → I caught it → it's handled → nothing needed from you.

> "Quick one — your appointment reminders paused for 12 minutes this morning; I caught it, they're back, and I checked that nothing was missed. Nothing you need to do."

Rules:
- The reassurance clause ("nothing was missed") appears **only if the freelancer verified it** — it lives in the human slot, never pre-filled (see claims boundary, §4).
- If the incident is still open, the first line states that plainly instead: "…it paused at 9:02 and I'm on it now — I'll confirm when it's back." No recovery-time promises.
- The compose UI renders the first line as its own field, above the body, labeled "the one line they'll actually read."

## 3 · Body — the four-slot scaffold

Rendered as four short prompts in the compose flow. Target length: 3–5 sentences (event note), 1–2 sentences (quiet-month note).

1. **What happened** — pre-filled from `facts.ts`, phrased in the client's business objects. Editable.
2. **What it means for you** — **empty and mandatory.** Euclio never pre-fills, suggests, or templates this slot. Placeholder text: `[your read — only you can say what this meant for their business]`. The send/mark-sent action is disabled while this slot is empty. This blank is the structural guard against automation-tell and the entire value of the message; it is a feature, not a gap.
3. **What I did** — human-authored, free text. Optional pre-fill: none.
4. **What you need to do** — defaults to "Nothing — just keeping you in the loop." Editable. If the client genuinely must act, this is where it goes, stated as one concrete step.

Quiet-month (all-green) variant collapses to two slots: one line of fact ("everything ran on schedule this month — 340 reminders out the door") + the human line. Same mandatory-human-slot rule.

## 4 · The claims boundary (enforced, not advisory)

> Euclio states what it observed. Only the human states what it meant. Only a human who checked may reassure.

- **Observation** (Euclio, pre-filled): stopped/resumed times, durations, historical cadence, payload-metric history. Always allowed.
- **Interpretation** (human slot 2): never generated.
- **Reassurance** (human, post-verification): "nothing slipped through," "all bookings got their reminders" — never generated, never suggested as placeholder copy.

**`facts.ts` banned classes — extended test suite:**
- Existing: severity/impact words (brief, minor, hiccup, smoothly, nothing was missed, no impact).
- Add: inference constructions (missed, would have, were affected, ~N runs lost).
- Add: recovery-time promises (should be back, expect it fixed by, within the hour).
- Add: abstract-pain phrases (any inconvenience, may have been affected, some users might).
- Add: passive-voice patterns in generated lines (a fix has been implemented → we/I fixed). Generated facts use active constructions with the workflow as subject ("Booking reminders stopped checking in at 9:02").

## 5 · Strip-list (what the note must never contain)

No links (including "view details"), no logos, no images, no attachments, no HTML styling, no footers, no "powered by," no unsubscribe, no metrics blocks, no charts, no uptime percentages. Plain text. Every one of these pushes a personal note into the inbox category the client ignores. The plainness is the deliverability and the trust.

Euclio's name never appears in any rendering.

## 6 · Renderings (one content, three shapes)

The compose flow produces the note once, then offers copy-ready variants:
- **Email** (default): subject + first line + body as above.
- **Text/WhatsApp**: first line only, lightly compressed, with the human slot's sentence appended.
- **Loom script**: the four slots as spoken beats, ~30 seconds.

Freelancer picks per client; Euclio stores the channel choice per client for next time. v1 ships email + text variants (bakery-owner persona); Loom script is copy-only and nearly free.

## 7 · Cadence rules

- **Event heads-up:** send at catch or at resolution — freelancer's call — but never more than one note per incident, and flapping never generates multiple notes (debounce is a trust feature; the service recovery paradox inverts under repeated failures).
- **Monthly note:** short email, per the standing decision. Anti-sameness rule: never the same template shape twice in a row; lead with anything eventful; a genuinely quiet month may be the two-line variant.
- The compose flow surfaces, per client, when they last heard anything — so silence never exceeds a month unnoticed.

## 8 · Success metric (for design partners)

Not opens. After a partner's first real heads-up, ask one question a week later: **"Did the client react?"** (a reply, a mention on a call, anything). Log it per note. That reaction rate — not read rate — is the artifact's KPI, and the first real data on the open-rate fear.

---

## Build placement

- Slots + mandatory-empty rule + subject variance check + strip-by-construction (plain-text only): **M5.5 compose flow**.
- Banned-class test extensions: **M5 `facts.ts` suite** (small addition).
- Per-client channel memory + text variant: M5.5 or first fast-follow.
- Loom script variant: copy template, fast-follow.
- Nothing here adds schema beyond what's already planned (`ClientUpdate.kind`, `clientFacingName`).
