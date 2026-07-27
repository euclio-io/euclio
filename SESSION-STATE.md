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

### Just done — account auto-create + auth pages (plan §6), UNCOMMITTED
- `lib/account.ts` `getOrCreateAccountForCurrentUser()`: `auth()` (JWT, no network) → lookup User by
  `clerkUserId`; on first visit `currentUser()` + create Account+User in one `$transaction`; P2002
  (two-tabs race) → re-resolve. Improvement over plan: `currentUser()` only on the create path.
- `app/sign-in|sign-up/[[...]]/page.tsx` mounting `<SignIn/>`/`<SignUp/>` on our domain (user's chosen approach).
- Routing as `<ClerkProvider>` props (signIn/UpUrl + *FallbackRedirectUrl=/dashboard) — NOT env vars,
  since these paths are app structure, not per-env config.
- `app/dashboard/page.tsx`: `auth()`-guard → redirect `/sign-in`; then the CANONICAL tenant-scoping
  query `client.count({ where: { accountId } })` with the invariant documented as a review gate.
- `app/page.tsx`: minimal Euclio landing → link to `/dashboard`.
- **Verified end-to-end:** build green (routes `/dashboard` `/sign-in` `/sign-up`), `tsc` clean,
  `/dashboard` unauth → 307 `/sign-in`, real Google sign-up → landed on dashboard, and a scoped DB
  read confirms exactly 1 Account (`clerkOrgId = NULL`) + 1 linked User. No duplicates.

### Not started (rest of `docs/plans/m0-scaffold.md`)
Sentry (§7), `/api/health` (§8), `railway.json` (§9), Railway deploy + prod env (§10). None need new migrations.

### Single next slice (per plan §7)
Sentry: `npx @sentry/wizard -i nextjs` (or manual `instrumentation.ts`, `sentry.*.config.ts`,
`instrumentation-client.ts`, `withSentryConfig` in `next.config.ts`) + `lib/logger.ts` wrapping
`Sentry.logger.*` (swap the `console.info("account.created")` placeholder in `lib/account.ts`).
Credential-gated: needs `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

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
- [ ] Provision **Sentry** (§7) when ready: keys into `.env.local`, then wizard/manual wiring + `lib/logger.ts`.
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
