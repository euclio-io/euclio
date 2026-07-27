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
  `prisma/`, Prisma 7 datasource/generator edits. Build green. Pushed.
- `09fe71b` — Prisma 7 + Neon wiring (§4): `@prisma/client`/`@prisma/adapter-pg`/`pg`/`dotenv`,
  `prisma.config.ts` (CLI, `DIRECT_URL`), `lib/prisma.ts` (app, pooled `DATABASE_URL`, `max:5`),
  `.env.example`, migration `20260727163422_init` applied to Neon (`clerkOrgId` nullable `TEXT` +
  unique index). Pushed. Fixed two plan gaps (see below).

### Just done — Clerk auth foundation (plan §5), UNCOMMITTED
- Installed `@clerk/nextjs@7.6.1` (no Next 16 peer conflict).
- `proxy.ts` — Next 16's renamed middleware; bare `clerkMiddleware()`, NO route-gating
  (protection lands at the resource in §6). Confirmed Next 16 supports the `proxy` filename.
- `app/layout.tsx` — wrapped in `<ClerkProvider>`; replaced placeholder metadata with Euclio's.
- `.env.local` + `.env.example` gained the two Clerk key slots; user filled `.env.local`.
- **Verified:** `npm run build` green (registers `ƒ Proxy (Middleware)`), `tsc` clean, dev server
  boots → `/` returns 200, title "Euclio", Clerk connects to a dev instance (no key errors).

### Not started (rest of `docs/plans/m0-scaffold.md`)
Account/User auto-create + sign-in/up + protected `/dashboard` (§6), Sentry (§7),
`/api/health` (§8), `railway.json` (§9), Railway deploy + prod env (§10). None need new migrations.

### Single next slice (per plan §6)
`lib/account.ts` `getOrCreateAccountForCurrentUser()` (lazy, tx, P2002-retry), sign-in/up routing
with post-auth redirect to `/dashboard`, and `app/dashboard/page.tsx` that `auth()`-guards, creates
the Account/User, and does one `accountId`-scoped `client.count`. Uses the Clerk keys already set —
NOT credential-gated. First feature code touching the DB; propose structure before writing (global CLAUDE.md).

## Environment (this machine, 2026-07-27)
- **Dependencies: installed** — Next + Prisma 7 + `@clerk/nextjs` present. Sentry packages NOT yet added.
- **Node: OK when activated.** Node `v22.21.1` via `nvm use 22` (`.nvmrc` pins it). `nvm default` still points to Node 20 and new shells start on Node 18 — run `nvm use` in the repo first. Every command that touches node/npm/prisma must source nvm + `nvm use 22`.
- **Minor:** `npm run build` warns "Detected additional lockfiles" (a `package-lock.json` higher up the tree). Benign; can pin Turbopack root later via `next.config.ts`.
- **`.env.local` exists (gitignored):**
  - Neon: `DATABASE_URL` (pooled) + `DIRECT_URL` (unpooled) — **set, working** (migration applied through them).
  - Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — **set, working** (dev instance; Organizations OFF).
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
