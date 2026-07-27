# Euclio — Session State

> Reconciliation log for resuming across machines/sessions. Read after `CLAUDE.md`
> (governing rules) and `docs/plans/m0-scaffold.md` (M0 build steps).
> Last reconciled: 2026-07-27 (add-client-workflow slice implemented + build-verified on a
> fresh machine; not yet runtime-tested against a live Neon/Clerk instance on this machine).

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
- `a41d312` — Sentry + structured logging (§7): `@sentry/nextjs@10.68.0`, `instrumentation.ts`
  (+`onRequestError`), `sentry.server/edge.config.ts`, `instrumentation-client.ts`, `withSentryConfig`
  in `next.config.ts` (all `enableLogs:true`, `sendDefaultPii:false`), `lib/logger.ts` choke point
  (replaces the `console.info` placeholder). Verified via a temp route: `Sentry.flush()` → `true`. Pushed.

### Just done — /api/health + Railway config (plan §8 + §9), UNCOMMITTED
- `app/api/health/route.ts` — public `GET` → `{ status: "ok", timestamp }`. `force-dynamic`, NO auth,
  NO DB round-trip (a Neon blip must not flap Railway deploy health). Verified: 200 + JSON, public.
- `package.json`: renamed to `euclio`, `engines.node = "22.x"`, `start = next start -p ${PORT:-3000}`,
  and `build = "prisma generate && next build"` — Railway must regenerate the gitignored Prisma client
  at build (this closes the earlier postinstall/generate open thread). Local build verified green.
- `railway.json` — RAILPACK builder, `startCommand npm run start`, `healthcheckPath /api/health`,
  timeout 30, restart ON_FAILURE.
- ⚠ Railway build needs `DIRECT_URL` present as a build env var (prisma.config.ts reads it during
  `prisma generate`) — fold into the §10 env setup.

### ✅ DONE — Railway deploy (plan §10) — M0 COMPLETE
- Railway project **thorough-possibility**, env **production**, service **euclio**. URL:
  https://euclio-production.up.railway.app
- Env vars point at the SAME shared Neon DB (`ep-flat-sound-awealxsh`), no Railway-provisioned Postgres —
  one-DB rule holds. Sentry source-map tokens filled.
- `railway run npx prisma migrate deploy` → "No pending migrations to apply" (schema live in prod).
- **Verified in prod:** `/api/health` → `200 {status:"ok"}`; `/dashboard` unauth → `307 /sign-in`;
  Google sign-in works; scoped prod DB read = 1 Account (`clerkOrgId NULL`) + 1 User, no duplicate
  (idempotent tenant path across dev/prod).

## 🎉 M0 skeleton is DONE and deployed. All of §1–§10 committed to `master` and verified in production.

## Milestone: "Add client + workflow" — IMPLEMENTED, build-verified, NOT yet runtime-tested
Per CLAUDE.md's MVP loop (`add client + workflow -> confirm test ping -> ping ingest + status -> ...`),
this is the slice right after M0 and right before ping ingest — deliberately scoped to
just the CRUD (confirmed with the user): no ping ingest endpoint, no "confirm test ping"
UI, no watcher. Full design plan: `docs/plans/` history / plan-mode session (see git log
message on the commit landing this slice for the rationale summary).

- `lib/token.ts` — `generateWorkflowToken()`, `crypto.randomBytes(24).toString("base64url")`.
  No new dependency; 192 bits of entropy; `Workflow.token @unique` is the collision backstop.
- `app/dashboard/actions.ts` (NEW — first Server Actions / first mutation path in the app;
  no API-route or Server Action precedent existed before this) — `createClient` and
  `createWorkflow`, both FormData-based for `useActionState`. Both independently re-check
  `auth()` (never assume reaching the action means authenticated) and resolve `account` via
  the existing `getOrCreateAccountForCurrentUser()` — no new tenant-resolution logic.
  `createWorkflow`'s ownership check is baked into the query itself
  (`prisma.client.findFirst({ where: { id: clientId, accountId: account.id, archivedAt: null } })`),
  not a follow-up JS equality check — this is the cross-tenant-leak gate CLAUDE.md calls
  highest-severity. `expectedIntervalMinutes`/`graceMinutes` are bounded to Postgres INT4
  max (2147483647) so an absurd input fails validation with a friendly message instead of
  an uncaught DB error. `status` is never set explicitly on create — schema
  `@default(pending)` is the only writer, preserving "never write healthy for an unobserved
  span." Both actions log via the existing `lib/logger.ts` convention
  (`client.created`/`workflow.created`, IDs only, no names, no tokens — tokens are bearer
  credentials, same never-log bucket as PII) and `revalidatePath("/dashboard")` on success.
- `app/dashboard/add-client-form.tsx`, `app/dashboard/add-workflow-form.tsx` (NEW — first
  client components in the app) — `useActionState` for inline `role="alert"` error text,
  no new dependency, no toast/state library. Manual validation only (no zod — not a direct
  dependency, adding one for 2-3 field forms was judged premature).
- `app/dashboard/page.tsx` (EDITED) — replaced the `workflowCount` bug (was counting
  `Client` rows while named as if counting Workflows) with a real accountId-scoped
  `prisma.client.findMany({ ..., include: { workflows: { where: { archivedAt: null } } } })`,
  renders the client list with nested workflows (name, status badge, interval, token shown
  inline with a "check-in URL isn't live yet" caption — deliberately no constructed
  `/api/ping/{token}` URL and no copy button, so the UI doesn't promise a capability this
  slice doesn't build) plus both forms.
- No schema changes — `Client`/`Workflow` models already existed from the M0 data model.

### Build verification performed on THIS machine (fresh clone, see Environment below)
- Installed nvm + Node 22.23.1 (this machine had neither `nvm` nor a new-enough system
  Node before this session).
- `npm install` — clean, matches `package-lock.json`, no errors (`npm audit` reports some
  vulnerabilities inherited from existing M0 dependencies, not investigated — out of scope
  for this slice, unrelated to the new files).
- Created a **local-only placeholder `.env.local`** (fake but syntactically valid Neon/
  Clerk/Sentry values, gitignored, never committed) specifically so `npm run build` could
  run for real without touching any live service. `npm run build` (`prisma generate && next
  build`) — clean; `/dashboard` correctly compiles as a dynamic route (`ƒ`), confirming no
  DB query fires at build time even without a real `DATABASE_URL`. `npm run lint` — clean.
- **NOT done**: real runtime testing (sign in, actually create a Client/Workflow, verify
  rows in Neon, verify the cross-tenant "Client not found" rejection, verify
  `logger.info` reaches Sentry). This needs real Neon/Clerk/Sentry credentials, which this
  machine doesn't have — the placeholder `.env.local` must be replaced with real values
  (or swapped in from wherever the other machine's values live) before any of that can run.
  Flagging this explicitly so it isn't mistaken for "fully verified."

## Environment — TWO machines now, tracked separately (this repeats going forward)

### Laptop (previous session, as of 2026-07-27 M0 work)
- **Dependencies: installed** — Next + Prisma 7 + `@clerk/nextjs` + `@sentry/nextjs` present.
- **Node: OK when activated.** Node `v22.21.1` via `nvm use 22` (`.nvmrc` pins it). `nvm default` still points to Node 20 and new shells start on Node 18 — run `nvm use` in the repo first. Every command that touches node/npm/prisma must source nvm + `nvm use 22`.
- **Minor:** `npm run build` warns "Detected additional lockfiles" (a `package-lock.json` higher up the tree). Benign; can pin Turbopack root later via `next.config.ts`.
- **`.env.local` exists (gitignored), REAL values:**
  - Neon: `DATABASE_URL` (pooled) + `DIRECT_URL` (unpooled) — **set, working** (migration applied through them).
  - Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — **set, working** (dev instance; Organizations OFF).
  - Sentry: `NEXT_PUBLIC_SENTRY_DSN` — **set, working** (events verified reaching the project).
    `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` — **still blank** (build-time source-map upload only; needed for readable prod stack traces at §9/§10).
  - Prod (Railway) env vars: **set** (§10 done).

### This machine (second machine, first session on it: 2026-07-27)
- Fresh clone — had neither `nvm` nor a new-enough system Node (`/usr/bin/node` was 18.19.1).
  Installed `nvm` + Node 22.23.1 this session. **Same caveat as the laptop applies going
  forward: new shells start on system Node 18, always `nvm use` (or `nvm use 22`) first.**
- `npm install` run this session — `node_modules` now present, matches lockfile.
- **`.env.local` exists (gitignored), PLACEHOLDER values only** — fake Neon/Clerk/Sentry
  strings, created solely so `npm run build` could be verified without a live DB. **Must be
  replaced with real values before `npm run dev` or any runtime testing on this machine.**
- Onboarding this machine properly (pulling real secrets instead of hand-copying) was
  discussed and deliberately deferred: since dev and prod currently share the same Neon DB,
  `railway variables`/`railway run` could pull the real values directly — planned as a
  follow-up bootstrap script, not done yet. This exact two-machine gap is expected to recur,
  so it's worth doing before a third machine/session needs onboarding.

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
- [ ] **Clerk PRODUCTION instance** (before real launch): current keys are a Clerk DEV instance.
      A production instance needs its own keys (into Railway env) and its own custom OAuth credentials.
      This is the natural moment to do the Google OAuth rebrand below.
- [x] ~~Sentry source maps~~: `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT` filled + on Railway; `withSentryConfig`
      uploads on build. (If the current deploy predated the tokens, next deploy uploads maps.)
- [x] ~~Railway / prod env (§10)~~: done — vars set, `migrate deploy` run, prod verified.
- [x] ~~postinstall/build-step prisma generate~~: done — `build = "prisma generate && next build"`.
- [ ] **Rebrand Google OAuth consent → "Euclio"** (production-setup, deferred): the Google sign-in
      screen currently says "Sign in to Clerk" because the Clerk DEV instance uses Clerk's shared
      Google OAuth credentials. Fix at production-instance setup: create a Google Cloud OAuth client
      (consent screen named Euclio) and add it as custom credentials in Clerk → SSO Connections →
      Google. Cosmetic in dev; Clerk production requires custom credentials anyway.
- [ ] **Minor — pg SSL mode warning:** `pg` warns that `sslmode=require` will change semantics in
      pg v9 (currently treated as the stricter `verify-full`). Our Neon URLs use `sslmode=require`.
      No action now (current behavior is safe); revisit if we bump pg to v9.
- [ ] Keep build-out inside the "Do NOT build" skip list (no ingest, watcher, email, client-facing).
- [ ] **Runtime-verify the add-client-workflow slice** on whichever machine has real
      credentials first: sign in, create a Client, create a Workflow (including a bad
      input to see the inline error), confirm rows in Neon via `prisma studio`, confirm the
      cross-tenant `findFirst` rejection actually returns "Client not found." with no write,
      confirm `client.created`/`workflow.created` reach Sentry with no name/token in the
      attributes. Build+lint are clean; this is the remaining, more important check.
- [ ] **Multi-machine onboarding bootstrap** (deferred, see Environment above): a script that
      does `nvm install 22 && nvm use 22 && npm install` plus pulls real env vars via
      `railway variables`/`railway run` instead of hand-copying `.env.local`. Worth doing
      before a third machine needs onboarding — this session hit the exact gap it would fix.
- [ ] Next slice after this one (once runtime-verified): ping ingest (`POST /api/ping/[token]`)
      + "confirm test ping" UI, per the MVP loop — not started.
