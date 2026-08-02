# DECISIONS.md — Architecture & Product Decision Log

<!--
  PURPOSE (for the AI reading this):
  This file is the project's memory. Every entry below is a SETTLED decision.
  Do not re-litigate, reverse, or work around these choices unless the user
  explicitly asks to revisit one. If a request conflicts with an entry here,
  point out the conflict before making edits.

  FORMAT (for the human maintaining this):
  Newest entries at the top. One entry per decision. Keep each entry to 2-4
  lines. Update STATUS if a decision is ever superseded — never delete
  entries, so the history of "why" is preserved.
-->

---

## Template for new entries

### YYYY-MM-DD — Short decision title
- **Decision:** What was chosen.
- **Why:** The reasoning, constraint, or tradeoff behind it.
- **Rejected:** What alternative was considered and why it lost.
- **Status:** Active

---

## Decisions

### 2026-07-29 — No framework, no build step
- **Decision:** The site is plain semantic HTML5, native ES6+ JS, and Tailwind via CDN/utility classes. No React, no bundler, no npm build pipeline.
- **Why:** This is a landing page. Load speed, simplicity, and zero-maintenance deployment matter more than component architecture.
- **Rejected:** Vite + framework — overkill for a single page, adds tooling drag.
- **Status:** Active

### 2026-07-29 — Dark minimalist aesthetic is fixed
- **Decision:** Visual direction is dark, minimalist, cyberpunk/SaaS. All colors flow through defined variables — no ad-hoc hex values in markup.
- **Why:** Consistency across future edits by different models/sessions; a single place to retheme.
- **Rejected:** Per-element inline colors — drifts immediately with AI edits.
- **Status:** Active

### 2026-07-29 — Defensive DOM initialization
- **Decision:** Any script touching global state or the DOM wraps init in a `DOMContentLoaded` listener.
- **Why:** Scripts must be order-independent and safe to move around the page.
- **Status:** Active

### 2026-07-29 — Aider is the primary dev agent
- **Decision:** Development runs through Aider (architect mode) with a strong reasoning model + cheap editor model via OpenRouter. Standing context lives in the `ai/` folder and loads via `read:` in `.aider.conf.yml`.
- **Why:** Claude-level quality at lower cost; harness files replace session memory.
- **Status:** Active

<!--
  Add new entries ABOVE this line, below the "## Decisions" heading.

  Examples of things that belong here when they happen:
  - "Switched hero animation from CSS to JS because of Safari flicker"
  - "Chose Formspree for the contact form; no backend"
  - "Page weight budget: 100KB excluding fonts"
  - "Dropped Qwen editor model; diffs were unreliable, moved to X"
-->