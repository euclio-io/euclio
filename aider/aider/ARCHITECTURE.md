# ARCHITECTURE.md — Structure, Boundaries & Where Things Live

<!--
  PURPOSE (for the AI reading this):
  This file is your map of the project. Use it to decide WHERE code goes and
  WHAT it may touch. Rules here are boundaries, not suggestions:
  - If a requested change would violate a boundary, say so before editing.
  - If you create a new file, it must fit a location defined below — if none
    fits, propose an update to this file rather than inventing structure.
  - When something here contradicts what you see in the actual code, flag the
    drift; do not silently pick one.

  FORMAT (for the human maintaining this):
  Update this whenever the file layout or a boundary changes. Keep it terse —
  this loads on every turn. Details that are decisions ("we chose X because Y")
  belong in DECISIONS.md, not here.
-->

---

## 1. System overview

Single static landing page. No framework, no build step, no backend.
Everything ships as-is: what's in the repo is what the browser gets.

```
Browser ──> index.html ──> Tailwind (CDN) + styles.css (custom vars/overrides)
                      └──> js/main.js (all behavior, initialized on DOMContentLoaded)
```

## 2. File layout

```
euclio-landing/
├── index.html          # the entire page: all sections live here
├── styles.css          # CSS custom properties (theme vars) + anything Tailwind can't do
├── js/
│   └── main.js         # single entry point for all interactivity
├── assets/
│   ├── img/            # images (optimized: webp/avif preferred)
│   └── fonts/          # self-hosted fonts, if any
├── ai/                 # AI harness files — NEVER referenced by the site itself
│   ├── IDENTITY.md
│   ├── PROJECT.md
│   ├── ARCHITECTURE.md   (this file)
│   ├── CONVENTIONS.md
│   └── DECISIONS.md
├── .aider.conf.yml
└── .aiderignore
```

<!-- Adjust the tree above to match reality if your layout differs,
     then keep it in sync. A wrong map is worse than no map. -->

## 3. Page structure (index.html)

Sections appear in this order, each as a top-level `<section>` with a stable `id`:

1. `#hero`      — headline, subhead, primary CTA
2. `#features`  — feature grid
3. `#social`    — social proof / logos / testimonials
4. `#pricing`   — pricing tiers (if applicable)
5. `#cta`       — closing call to action
6. `#footer`    — footer, inside `<footer>`

Boundary: sections are self-contained. A change to one section must not
require edits to another. Shared visuals go through theme variables, not
copied styles.

## 4. Styling boundaries

- Tailwind utilities are the default for layout and spacing.
- All COLOR flows through CSS custom properties defined once at the top of
  `styles.css` (`--bg`, `--surface`, `--text`, `--accent`, etc.).
  No raw hex/rgb values in `index.html`. No exceptions.
- `styles.css` is for: variable definitions, keyframe animations, and the
  rare thing utilities can't express. If it grows past ~150 lines, something
  is being done in CSS that should be reconsidered.

## 5. JavaScript boundaries

- One entry point: `js/main.js`. New behavior = new function in this file
  (or a new file in `js/` ONLY if main.js exceeds ~300 lines — then split by
  feature and load each with `<script defer>`).
- All initialization wrapped in `DOMContentLoaded` (see DECISIONS.md).
- No global namespace pollution: everything inside an IIFE or module scope.
- No dependencies. If a task seems to need a library, stop and flag it —
  that's a DECISIONS.md conversation, not an npm install.
- JS is enhancement only: the page must be fully readable and navigable
  with JS disabled.

## 6. Assets & performance budget

- Total page weight target: keep it lean (images optimized, fonts subset).
  Hard numbers, if set, live in DECISIONS.md.
- Images: explicit `width`/`height` attributes (no layout shift), `loading="lazy"`
  below the fold, modern formats first.
- No render-blocking scripts: `defer` on everything.

## 7. What the AI must never touch

- `ai/` contents are edited only when the user explicitly asks.
- `.aider.conf.yml` and `.aiderignore` — same rule.
- Anything in `assets/` — reference files, don't regenerate or rename them.

## 8. Known drift / TODO

<!-- List places where reality doesn't yet match this document.
     The AI should treat items here as "in transition," not violations. -->
- (none yet)