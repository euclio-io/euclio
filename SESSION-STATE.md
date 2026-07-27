# Euclio — Session State

> Reconciliation log for resuming across machines/sessions. Read after `CLAUDE.md`
> (governing rules) and `docs/plans/m0-scaffold.md` (M0 build steps).
> Last reconciled: 2026-07-27 (Next.js scaffold merged; uncommitted).

## Milestone: M0 — deployable skeleton (auth + DB + Sentry + one page + health)

### Done (committed on `master`, tree clean)
- `e85af73` — initial commit: `CLAUDE.md` (project context, governing rules) + `schema.prisma` (full M0 data model).
- `87b6dbd` — `Account.clerkOrgId` made nullable (`String? @unique`) + added `docs/plans/m0-scaffold.md`.
- That is the **entire** repo. M0 is at the *pre-scaffold* state: schema + decisions are locked, **no application code exists yet.**

### Just done — scaffold slice (plan §1 → §2 + §3), UNCOMMITTED
- Node 22 activated (`v22.21.1`); `.nvmrc` = `22` added.
- `create-next-app@latest` (Next `16.2.12`, React `19.2.4`, TS + Tailwind + ESLint,
  App Router, no src dir, `@/*` alias) scaffolded into `/tmp/euclio-scaffold` and
  merged into repo root. Scaffold's generic `CLAUDE.md`/`AGENTS.md` dropped so ours governs.
- `git mv schema.prisma prisma/schema.prisma`; applied Prisma 7 §3 mechanical edits
  (`provider = "prisma-client"`, `output = "../generated/prisma"`, removed `url` from datasource).
- `npm install` clean; **`npm run build` succeeds** on Node 22.
- All scaffold files are **untracked / uncommitted** — awaiting review before commit.

### Not started (rest of `docs/plans/m0-scaffold.md`)
No Prisma client wiring (`prisma.config.ts`, `lib/prisma.ts`, packages `@prisma/client`
`@prisma/adapter-pg` `pg` `dotenv`), no Clerk (§5), no Account/User auto-create (§6),
no Sentry (§7), no `/api/health` (§8), no `railway.json` (§9), no `.env.local`/`.env.example` (§10).
**No Prisma migration has ever been created or applied.**

### Single next slice (per plan §4)
Prisma 7 + Neon wiring — install packages, add `prisma.config.ts` + `lib/prisma.ts`.
BLOCKED until `.env.local` exists (needs `DATABASE_URL` pooled + `DIRECT_URL` unpooled from Neon).

## Environment (this machine, 2026-07-27)
- **Dependencies: installed** — scaffold `package.json` + `node_modules` present after `npm install` (Prisma/Clerk/Sentry packages NOT yet added).
- **Node: OK when activated.** Node `v22.21.1` via `nvm use 22` (`.nvmrc` now pins it). Note: `nvm default` still points to Node 20 and each new shell starts on Node 18 — run `nvm use` in the repo first.
- **Minor:** `npm run build` warns "Detected additional lockfiles" (a `package-lock.json` exists higher up the tree). Benign; can pin Turbopack root later via `next.config.ts` if it becomes noisy.
- **`.env` / `.env.local`: does NOT exist.** Therefore every required var is missing:
  - Neon: `DATABASE_URL` (pooled), `DIRECT_URL` (unpooled) — **missing**
  - Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — **missing**
  - Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` — **missing**
  - (No values printed or inspected — file simply is not present.)

## Anchor-file reconciliation
- `CLAUDE.md` → `## Topology` section **present** (modular-monolith, web + watcher split). ✓
- `schema.prisma` → `Account.clerkOrgId String? @unique` (nullable) **confirmed** at line 54. ✓
- Known-pending (planned in §3, not stale surprises): schema still has
  `provider = "prisma-client-js"` and `url = env("DATABASE_URL")` in the datasource,
  and lives at repo root rather than `prisma/`. Prisma 7 needs `provider = "prisma-client"`
  + `output` + no `url` in datasource — these are mechanical scaffold-time edits, not drift.

## clerkOrgId migration check
- `prisma migrate status` **could not run**: Prisma CLI is not installed, there is no
  `prisma.config.ts`, no `DATABASE_URL`/`DIRECT_URL`, and no `prisma/migrations/` dir.
- **No migration has ever been created or applied to Neon.** There is therefore no
  applied `NOT NULL` `clerkOrgId` to correct. The schema is already nullable; the first
  migration (`init`) will encode it correctly. **No corrective migration needed** — the
  concern is moot until an `init` migration exists to compare against.

## Open threads / decisions needed
- [ ] **Review the scaffold, then commit it** (currently all untracked). Suggested msg: `M0: scaffold Next.js 16 + relocate schema to prisma/ (Prisma 7 edits)`.
- [ ] Provision Neon / Clerk / Sentry and create `.env.local` (plan §10). Blocks Prisma wiring, `migrate dev`, and `npm run dev` with auth.
- [ ] When adding `.env.example`, add a `!.env.example` exception to `.gitignore` (current `.env*` rule would ignore it).
- [ ] Watch that build-out stays inside the "Do NOT build" skip list (no ingest, watcher, email, client-facing anything in M0).
