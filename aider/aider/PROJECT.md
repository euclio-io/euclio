# PROJECT.md — Project Context (General Template)

<!--
  PURPOSE: This file tells you WHAT you're building, for WHOM, and WHY —
  the context that turns rule-following into judgment.

  IMPORTANT — THIS IS A TEMPLATE. Sections marked [FILL ME] may be empty or
  stale. Your handling rules for that situation are in §1 and they are not
  optional.
-->

---

## 1. If context here is missing or unclear (READ FIRST)

- **Never invent project context.** If a section below is [FILL ME] or
  contradicts what you see in the code, do not guess silently.
- On the FIRST substantial task of a session where required context is
  missing, ask the user for the minimum you need — one question, most
  important gap first. Typical priority order:
  1. Is there a directory of project context docs I should know about?
     (vision, specs, plans, design docs — see §8)
  2. What is this project and who is it for?
  3. What does "done" look like for the current task?
  4. Are there constraints I should know (stack, budget, deadline, no-go areas)?
- If a context directory exists (§8), CHECK IT before asking questions 2–4 —
  the answers are probably already written down. Only ask about gaps the
  docs don't cover.
- If the user answers, OFFER the text to fill the section below so this file
  stops being empty ("Want me to draft §2 with that? You can paste it in.").
- If the user declines to give context or says "just do it": proceed using
  the defaults in §6, state which defaults you applied, and keep the task
  small and reversible.
- For trivial tasks (typo fix, rename, obvious bug), skip the questions and
  just do the work. Do not interrogate the user about vision to fix a typo.

## 2. What this project is

[FILL ME]
<!-- Two or three sentences: what it does, what stage it's at
     (prototype / active / maintenance), and what it is NOT. -->

## 3. Who it's for

[FILL ME]
<!-- The audience, and what they care about. "Non-technical small-business
     owners on phones" produces different code than "internal ops team on
     desktop Chrome." -->

## 4. What matters most (priority order)

[FILL ME]
<!-- Rank these for THIS project, delete what doesn't apply:
     correctness, speed to ship, load performance, visual polish,
     maintainability, accessibility, cost.
     Ties are broken top-down: when two goods conflict, the higher one wins. -->

## 5. Current focus

[FILL ME — update per work phase]
<!-- What we're working toward right now, so isolated requests are
     interpreted in service of the current goal. -->

## 6. Default operating assumptions (apply when §2–§5 are empty)

Until real context exists, assume:

- The project is early-stage: prefer reversible choices, avoid lock-in.
- Priorities are: correctness > simplicity > speed of shipping > polish.
- No new dependencies, services, or build steps without asking.
- Scope conservatively: do exactly what was asked, note (don't build)
  adjacent improvements.
- Anything destructive or hard to undo (deleting files, rewriting large
  sections, schema/data changes) requires an explicit go-ahead.

## 7. Out of bounds

[FILL ME]
<!-- Things this project must never do or include: e.g. "no user tracking,"
     "no paid APIs," "never touch /legacy." If empty, §6 rules apply. -->

## 8. Context directory — where the deep docs live

**Location:** [FILL ME — e.g. `docs/`, `context/`, `planning/`]

<!-- This is the single most valuable section to fill in. It points to the
     directory holding the project's long-form context: vision doc,
     implementation plan, design spec, roadmap, research notes, etc. -->

### Index of context docs

[FILL ME — one line per file: filename → what it answers]
<!-- Example:
     - vision.md            → why this exists, who it's for, success criteria
     - implementation.md    → phased build plan, what's done vs. pending
     - design.md            → visual direction, components, spacing/type rules
     - data-model.md        → entities and relationships
     - marketing.md         → positioning, tone of voice for copy
     - open-questions.md    → unresolved decisions (treat as NOT settled)
-->

### Rules for using the context directory

- These docs are the source of truth for intent. When a task touches an
  area a doc covers, consult that doc BEFORE asking the user — ask only
  about what the docs don't answer.
- Do not assume every doc is loaded into your context. If the index above
  says a relevant doc exists but you can't see its contents, ask the user
  to add it: "This touches the design spec — can you `/read docs/design.md`?"
  Name the specific file; don't ask generically for "more context."
- Precedence when sources conflict:
  user's live instruction > DECISIONS.md > context docs > the code as-is.
  If a context doc contradicts DECISIONS.md, flag the drift.
- If the location above is [FILL ME] and the repo visibly contains a docs
  folder or *.md planning files, ask ONCE whether that's the context
  directory, then offer to draft this section's index from it.
- If you learn something during a session that belongs in one of these docs
  (a plan change, a new design rule), point at the specific doc it should
  go in — but edit context docs only when explicitly asked.