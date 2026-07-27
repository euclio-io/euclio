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
- `3212ee4` — Clerk auth foundation (§5): `@clerk/nextjs@7.6.1`, `proxy.ts` bare `clerkMiddleware()`
  (no route-gating), `<ClerkProvider>` in `app/layout.tsx`. Build/dev verified. Pushed.
- `6767b1f` — account auto-create + auth pages + tenant-scoped dashboard (§6): `lib/account.ts`
  (`auth()` JWT lookup, first-visit `currentUser()` + transactional create, P2002 retry), mounted
  `<SignIn/>`/`<SignUp/>`, `<ClerkProvider>` routing props, `auth()`-guarded `/dashboard` with the
  canonical `accountId`-scoped query, minimal landing. Verified with a real Google sign-up +
  scoped DB read (1 Account `clerkOrgId=NULL` + 1 linked User). Pushed.

### Just done — Sentry + structured logging (plan §7), UNCOMMITTED
- Installed `@sentry/nextjs@10.68.0` (no Next 16 peer conflict). Manual wiring (wizard needs an
  interactive Sentry login that doesn't fit this env).
- `instrumentation.ts` (runtime-split register + `onRequestError`), `sentry.server.config.ts`,
  `sentry.edge.config.ts`, `instrumentation-client.ts` (+ `onRouterTransitionStart`). All init with
  `enableLogs: true` and `sendDefaultPii: false` (explicit no-PII stance).
- `next.config.ts` wrapped in `withSentryConfig` (org/project/authToken from env; source-map upload
  is build-time only and skipped without the token).
- `lib/logger.ts` — thin wrapper over `Sentry.logger.{info,warn,error}` (attrs typed
  `Record<string, unknown>`; note: `logger.info` has an extra template-literal overload, so don't
  inherit its Parameters type). Swapped the `console.info("account.created")` placeholder for it.
- `.env.local`/`.env.example`: `NEXT_PUBLIC_SENTRY_DSN` set (public, safe); auth token + org/project blank.
- **Verified:** build + `tsc` clean; a temporary `/api/sentry-check` route captured an exception + a
  log and `Sentry.flush()` returned `true` (queue drained to the project), no transport errors. Route deleted.

### Not started (rest of `docs/plans/m0-scaffold.md`)
`/api/health` (§8), `railway.json` (§9), Railway deploy + prod env (§10). None need new migrations.

### Single next slice (per plan §8)
`app/api/health/route.ts` — public, no auth, no DB round-trip: `GET` returns `{ status: "ok",
timestamp }`. Pure process-alive check for Railway's healthcheck. NOT credential-gated — pure code.

## Environment (this machine, 2026-07-27)
- **Dependencies: installed** — Next + Prisma 7 + `@clerk/nextjs` + `@sentry/nextjs` present.
- **Node: OK when activated.** Node `v22.21.1` via `nvm use 22` (`.nvmrc` pins it). `nvm default` still points to Node 20 and new shells start on Node 18 — run `nvm use` in the repo first. Every command that touches node/npm/prisma must source nvm + `nvm use 22`.
- **Minor:** `npm run build` warns "Detected additional lockfiles" (a `package-lock.json` higher up the tree). Benign; can pin Turbopack root later via `next.config.ts`.
- **`.env.local` exists (gitignored):**
  - Neon: `DATABASE_URL` (pooled) + `DIRECT_URL` (unpooled) — **set, working** (migration applied through them).
  - Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — **set, working** (dev instance; Organizations OFF).
  - Sentry: `NEXT_PUBLIC_SENTRY_DSN` — **set, working** (events verified reaching the project).
    `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` — **still blank** (build-time source-map upload only; needed for readable prod stack traces at §9/§10).
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
- [ ] **Sentry source maps (finish §7 for prod):** fill `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` +
      `SENTRY_PROJECT` in `.env.local` (and on Railway) so `withSentryConfig` uploads source maps for
      readable prod stack traces. App + error capture already work without them.
- [ ] **Railway / prod env (§10)** deferred: set all vars on the Railway service, `migrate deploy` once.
- [ ] Consider a `postinstall: prisma generate` (or build-step generate) so fresh clones/CI/Railway
      build the client automatically — `generated/` is gitignored, so build is red until generate runs.
      (Becomes necessary at §9 Railway deploy; fine to skip locally.)
- [ ] **Rebrand Google OAuth consent → "Euclio"** (production-setup, deferred): the Google sign-in
      screen currently says "Sign in to Clerk" because the Clerk DEV instance uses Clerk's shared
      Google OAuth credentials. Fix at production-instance setup: create a Google Cloud OAuth client
      (consent screen named Euclio) and add it as custom credentials in Clerk → SSO Connections →
      Google. Cosmetic in dev; Clerk production requires custom credentials anyway.
- [ ] **Minor — pg SSL mode warning:** `pg` warns that `sslmode=require` will change semantics in
      pg v9 (currently treated as the stricter `verify-full`). Our Neon URLs use `sslmode=require`.
      No action now (current behavior is safe); revisit if we bump pg to v9.
- [ ] Keep build-out inside the "Do NOT build" skip list (no ingest, watcher, email, client-facing).
