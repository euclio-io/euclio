# Euclio — Session State

> Reconciliation log for resuming across machines/sessions. Read after `CLAUDE.md`
> (governing rules) and `docs/plans/m0-scaffold.md` (M0 build steps).
> Last reconciled: 2026-07-27 (Prisma 7 + Neon wired; init migration applied).

## Milestone: M0 — deployable skeleton (auth + DB + Sentry + one page + health)

### Done (committed on `master`)
- `e85af73` — initial commit: `CLAUDE.md` + `schema.prisma` (full M0 data model).
- `87b6dbd` — `Account.clerkOrgId` made nullable (`String? @unique`) + `docs/plans/m0-scaffold.md`.
- `fefde27` — scaffold slice (§1–§3): Node 22 + `.nvmrc`, `create-next-app` (Next `16.2.12`,
  React `19.2.4`, TS + Tailwind + ESLint, App Router, no src dir, `@/*`), `git mv` schema to
  `prisma/`, Prisma 7 datasource/generator edits. Build green. Pushed to `origin/master`.

### Just done — Prisma 7 + Neon wiring (plan §4), UNCOMMITTED
- Installed `@prisma/client` `@prisma/adapter-pg` `pg` `dotenv` (+ `-D prisma @types/pg`), all `7.9.1`/latest.
- `prisma.config.ts` — CLI-only, datasource `url = env("DIRECT_URL")` (unpooled).
- `lib/prisma.ts` — app client via `PrismaPg` over `DATABASE_URL` (pooled), pool `max: 5`, hot-reload singleton.
- `.env.example` (names only) + `.gitignore`: added `!.env.example` and `/generated`.
- `.env.local` filled by user (gitignored) with pooled `DATABASE_URL` + unpooled `DIRECT_URL`.
- **Migration `20260727163422_init` created + applied to Neon.** `migrate status` = up to date.
  `clerkOrgId` landed as `TEXT` (nullable) + unique index — matches the decision.
- `prisma generate` → client in `generated/` (gitignored). `npm run build` + `tsc --noEmit` both clean.
- **Two plan-gap fixes made** (see Open threads): `max` placement in `PrismaPg`, and `.env.local` loading.

### Not started (rest of `docs/plans/m0-scaffold.md`)
Clerk (§5), Account/User auto-create (§6), Sentry (§7), `/api/health` (§8),
`railway.json` (§9), Railway deploy + prod env (§10). None require new DB migrations.

### Single next slice (per plan §5)
Clerk auth — `npm i @clerk/nextjs`, `proxy.ts` with `clerkMiddleware()`, wrap `app/layout.tsx`
in `<ClerkProvider>`. Needs Clerk keys in `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`) — credential-gated, same as Neon was.

## Environment (this machine, 2026-07-27)
- **Dependencies: installed** — Next + Prisma 7 stack present. Clerk/Sentry packages NOT yet added.
- **Node: OK when activated.** Node `v22.21.1` via `nvm use 22` (`.nvmrc` pins it). `nvm default` still points to Node 20 and new shells start on Node 18 — run `nvm use` in the repo first. Every command that touches node/npm/prisma must source nvm + `nvm use 22`.
- **Minor:** `npm run build` warns "Detected additional lockfiles" (a `package-lock.json` higher up the tree). Benign; can pin Turbopack root later via `next.config.ts`.
- **`.env.local` exists (gitignored):**
  - Neon: `DATABASE_URL` (pooled) + `DIRECT_URL` (unpooled) — **set, working** (migration applied through them).
  - Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — **still missing** (needed for §5).
  - Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` — **still missing** (§7).
  - Prod (Railway) env vars: **not set** — deferred to §10.

## Anchor-file reconciliation
- `CLAUDE.md` → `## Topology` section **present** (modular-monolith, web + watcher split). ✓
- `prisma/schema.prisma` → `Account.clerkOrgId String? @unique` (nullable) confirmed; Prisma 7
  `provider = "prisma-client"` + `output` + no `url` in datasource all applied (committed in `fefde27`). ✓

## clerkOrgId migration check — RESOLVED
- `prisma migrate status` = **up to date** against Neon.
- Applied migration `20260727163422_init` defines `"clerkOrgId" TEXT,` (nullable) + a unique index —
  matches the schema and the decision. **No corrective migration needed.**

## Plan gaps found & fixed while wiring §4 (worth folding back into m0-scaffold.md later)
1. `PrismaPg` `max: 5` — plan put it in the constructor's first object as `{ connectionString, max }`,
   which is actually correct (first arg = pg PoolConfig). An earlier draft split it into the 2nd arg
   where it's ignored; verified against installed 7.9.1 `.d.ts` and fixed. Pool cap now applies.
2. `prisma.config.ts` used `import "dotenv/config"`, which loads only `.env` — NOT `.env.local`
   (that name is a Next convention). The CLI never saw `DIRECT_URL`. Fixed to explicitly
   `loadEnv({ path: ".env.local" })` then `loadEnv()` fallback.

## Open threads / decisions needed
- [ ] Provision **Clerk** (§5): create app, Organizations OFF, put `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
      + `CLERK_SECRET_KEY` into `.env.local`. Then wire `proxy.ts` + `<ClerkProvider>`.
- [ ] Provision **Sentry** (§7) when ready.
- [ ] **Railway / prod env (§10)** deferred: set all vars on the Railway service, `migrate deploy` once.
- [ ] Consider a `postinstall: prisma generate` (or build-step generate) so fresh clones/CI/Railway
      build the client automatically — `generated/` is gitignored, so build is red until generate runs.
- [ ] Keep build-out inside the "Do NOT build" skip list (no ingest, watcher, email, client-facing).
