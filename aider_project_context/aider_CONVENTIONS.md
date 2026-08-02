# Euclio conventions — read before editing anything

## Honesty (non-negotiable)
- Never invent quotes, testimonials, citations, or attributions. The two blockquotes in index.html are verbatim research quotes and are deliberately uncited. Do not edit, extend, or attribute them.
- Never present unbuilt capabilities as live product. Launch scope: heartbeat, canary arrival verification, gap accounting, the ledger, the optional note. FF1: content integrity. v2: kill-switch, pre-failure radar, timing drift, cadence baseline. v2 items appear only in the founder's "next" line.
- Claims boundary: Euclio states observations only. "Arrived" means arrived at the canary. Severity, reassurance ("minor", "nothing was missed"), and per-recipient delivery are human-only statements.
- The founder section is Sergio: real photo, real signature, hello@euclio.io. Never replace with a placeholder persona.

## Voice
- No em-dashes in brand voice. Em-dashes are allowed only inside mocked human text (the client's message, the freelancer's reply).
- No triads ("always exact, always sourced, always yours" is banned rhythm). Pairs are fine.
- Concrete beats smooth: exact times, counts, and names over abstractions ("visibility", "peace of mind", "seamless" are banned).
- Withhold mechanisms, not names. Curiosity comes from not explaining how; the ledger, the canary, and gap accounting are always called by name.

## Design
- Palette is bone/pine/gold (light). Do not switch to a dark theme.
- index.html is self-contained; there is no styles.css. Do not create one.
- Positioning is certainty-led (the three moments). Do not re-anchor the page on "monitoring" or "proof of delivery".

## Packaging
- Euclio is never a runtime dependency. Setup is one check-in per workflow — a short dashboard-generated snippet the freelancer can read in full (snippet, not SDK; no published packages; euclio-init is a fast-follow, never the primary mechanism) — plus one silent canary address. The snippet fails open, so an Euclio outage is invisible to client workflows. Do not add copy or code that puts Euclio in the critical path, and never write "one line": the snippet is short, not one line.
- Diagnostics copy: opt-in, scrubbed-before-it-leaves, deleted-after-30-days framing only. Never claim "we never receive it" or "we catch everything."
- Footprint claims: "the whole footprint is one request" is the ceiling. Never write "zero overhead" or "no performance impact" — the request is the overhead. On platforms, sell the native HTTP node (no plugin, survives platform updates); never claim the ping is free on Zapier (it consumes a task — docs cover it).
- The ledger screenshot in moment two is base64-embedded and generated from euclio-answer-view.html (the M5.5 ledger spec). To change it: edit that HTML, re-screenshot, rebuild. index.html stays a single self-contained file; never add external asset references.
- The snippet shown in "The whole setup" is the canonical ping contract and a public promise. Never edit it cosmetically, never let it diverge from what the dashboard generates, and never add capability internals (canary matching, /fail wiring, diagnostics) to the page — the rule is: show the contract, withhold the internals.
