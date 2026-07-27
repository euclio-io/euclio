# Euclio M0 — Next.js + Prisma/Neon + Clerk + Sentry scaffold

> Handoff doc for starting a fresh Claude Code session on any machine. Clone the
> repo, read `CLAUDE.md` first (governing rules), then this file (what to build
> and how), then start at "Status" below for what's already done.

## Status (as of this commit)

Done:
- `schema.prisma` has the confirmed fix applied: `Account.clerkOrgId` is
  `String? @unique` (nullable). `Account.id` is the tenant key; `clerkOrgId`
  stays `null` for solo freelancers and is only set later if an agency adopts
  a real Clerk Org.

Not started: everything else below — no `package.json`, no Next.js app, no
Prisma client wiring, no Clerk/Sentry integration, no Railway config. This repo
is currently just `CLAUDE.md` + `schema.prisma` on `master`, pushed to
`github.com/euclio-io/euclio`.

## Context

The repo currently has only `CLAUDE.md` and `schema.prisma`. This plan builds exactly the M0 slice: a deployable skeleton (auth, DB, error monitoring, one authenticated page, one health endpoint) with **no ping ingest, no watcher, no email, no client-facing anything**. Every later milestone builds on top of this without restructuring it, per CLAUDE.md's "vertical slices, each milestone deploys and is testable on its own."

Two decisions were confirmed with the user before finalizing (the first is already applied, see Status above):
- **`Account.clerkOrgId` is nullable** (`String? @unique`). The tenant key is `Account.id`, not `clerkOrgId` — every query already scopes by `accountId`. A solo freelancer signing up has no Clerk Organization, so `clerkOrgId` is simply `null` at creation and gets set later only if/when an agency adopts a real Clerk Org.
- **Node version**: install `nvm`, use Node 22 LTS locally (`.nvmrc` pins it), because Next.js 16 requires Node ≥20.9 and Prisma 7 requires Node ≥20.19/22.12/24. Railway is unaffected since it provisions its own Node from `package.json#engines`.

All package versions and API shapes below were verified against live npm registry output and current docs during planning (not recalled from training data), since this stack (Next 16, Prisma 7, the `middleware.ts`→`proxy.ts` rename, Railway's Railpack builder) is all recent:
- Next.js latest: `16.2.12`, requires Node `>=20.9.0`
- Prisma latest: `7.9.0`, requires Node `^20.19 || ^22.12 || >=24.0`
- Prisma 7 **requires a driver adapter** — the old zero-config internal engine is gone, no fallback.
- Prisma 7's `datasource` block **no longer holds `url`** (moves to `prisma.config.ts`); `directUrl` field is **removed entirely** in `prisma.config.ts` too — verified against Prisma's own config reference.
- Generator provider should be `"prisma-client"` (new default, TS output), not the deprecated `"prisma-client-js"`.
- Next.js 16 renamed `middleware.ts` → `proxy.ts` (same code, new filename/export name); Clerk's `clerkMiddleware()` still works unchanged inside it.
- Clerk's current guidance: **don't** gate routes via middleware matchers — protect "as close to the resource as possible" (i.e., inside `/dashboard/page.tsx` itself).
- Railway's current builder is **Railpack** (`"builder": "RAILPACK"` in `railway.json`), the maintained successor to Nixpacks — still satisfies CLAUDE.md's "no Docker" rule.

## 1. Local prerequisites (before any code)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart shell, then:
nvm install 22
nvm use 22
node -v   # confirm v22.x
```
Add `.nvmrc` containing `22` at repo root once the project exists, so `nvm use` is automatic for future sessions.

## 2. Scaffold Next.js into the existing repo

`create-next-app` refuses non-empty directories, so scaffold into a temp dir and merge:
```bash
npx create-next-app@latest euclio-scaffold \
  --typescript --app --eslint --tailwind --no-src-dir \
  --import-alias "@/*" --use-npm
# move app/, public/, next.config.ts, tsconfig.json, eslint config,
# postcss config, .gitignore, package.json into the real repo root
# (merge, don't overwrite CLAUDE.md); rm -rf the scaffold dir
```
`git mv schema.prisma prisma/schema.prisma` — Prisma 7 convention expects the schema under `prisma/`.

Target layout:
```
euclio/
  CLAUDE.md
  docs/plans/m0-scaffold.md   (this file)
  .nvmrc
  prisma/schema.prisma
  prisma.config.ts
  app/
    layout.tsx
    page.tsx                 (minimal — can just link to /dashboard)
    dashboard/page.tsx
    api/health/route.ts
  lib/
    prisma.ts
    account.ts
    logger.ts
  proxy.ts
  instrumentation.ts
  instrumentation-client.ts
  sentry.server.config.ts
  sentry.edge.config.ts
  next.config.ts
  .env.local            (gitignored)
  .env.example
  railway.json
```

## 3. schema.prisma edits still needed (mechanical only — the clerkOrgId fix is already applied)

Prisma 7 requires these boilerplate changes to the generator/datasource blocks (the data model itself — all models/enums/relations/indexes — stays untouched):
```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```
(no `url` in the datasource block — Prisma 7 forbids it there)

## 4. Prisma 7 + Neon wiring

Packages:
```bash
npm install @prisma/client @prisma/adapter-pg pg dotenv
npm install -D prisma @types/pg
```

`prisma.config.ts` (root, next to `package.json`) — used only by the Prisma **CLI** (migrate/generate), not by the running app:
```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: env("DIRECT_URL"), // unpooled Neon connection — CLI/migrations only
  },
});
```
Note: `directUrl` is not a valid field in v7 config, so the CLI's one `url` slot is deliberately pointed at Neon's **direct/unpooled** connection string (DDL + Prisma's migration advisory locks are unreliable through a transaction pooler). This is unrelated to what the running app uses.

`lib/prisma.ts` — the running app's client, independent of `prisma.config.ts`, using the **pooled** Neon URL:
```ts
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 });
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```
`max: 5` — deliberately small; Neon's pooler already multiplexes underneath, an oversized app-level pool on top just holds idle connections against Neon's limit for no benefit.

So: **`DATABASE_URL` = pooled** (has `-pooler` in hostname, used by the app), **`DIRECT_URL` = unpooled** (used only by `prisma.config.ts` for CLI operations). Both come from Neon's Connection Details panel (the pooled toggle on/off).

Migration commands:
```bash
npx prisma migrate dev --name init   # local, creates + applies the first migration
npx prisma generate                  # v7 no longer auto-runs this after migrate — explicit step
npx prisma migrate deploy            # non-interactive, idempotent — run against prod later
```

## 5. Clerk

```bash
npm install @clerk/nextjs
```
- Clerk dashboard: create an app, leave Organizations **off** (matches the nullable-`clerkOrgId` decision). Copy publishable + secret keys.
- `proxy.ts` (Next 16's renamed `middleware.ts`):
  ```ts
  import { clerkMiddleware } from "@clerk/nextjs/server";
  export default clerkMiddleware();
  export const config = { matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"] };
  ```
  No route-matching/protection logic here — per Clerk's current guidance, protection happens at the resource (the `/dashboard` page itself), not in middleware.
- `app/layout.tsx` wraps the tree in `<ClerkProvider>`.
- Use Clerk's hosted sign-in/sign-up (Account Portal or `<SignIn/>`/`<SignUp/>` components) rather than custom auth UI. Set post-auth redirect to `/dashboard`.

## 6. Account/User auto-create — lazy, inside `/dashboard`, no webhook

`lib/account.ts`:
```ts
export async function getOrCreateAccountForCurrentUser() {
  const user = await currentUser(); // @clerk/nextjs/server
  const existing = await prisma.user.findUnique({ where: { clerkUserId: user.id } });
  if (existing) return prisma.account.findUniqueOrThrow({ where: { id: existing.accountId } });

  try {
    return await prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: { name: user.primaryEmailAddress?.emailAddress ?? "Untitled", clerkOrgId: null },
      });
      await tx.user.create({
        data: { clerkUserId: user.id, accountId: account.id, email: ..., name: ... },
      });
      return account;
    });
  } catch (e) {
    // P2002 on User.clerkUserId = two concurrent first-loads (e.g. two tabs); re-fetch instead of erroring
    if (isUniqueConstraintError(e)) return getOrCreateAccountForCurrentUser();
    throw e;
  }
}
```
Rejected alternative: a Clerk `user.created` webhook. It needs a public signing endpoint, retry/idempotency handling, and a tunnel for local testing — and you'd still need this lazy path as a fallback for the race between webhook delivery and first dashboard visit. Strictly more moving parts for the same M0 behavior, against "keep it boring and small."

`app/dashboard/page.tsx` (async Server Component):
- `const { userId } = await auth(); if (!userId) redirect("/sign-in");` — this is where "protect close to the resource" lands.
- Call `getOrCreateAccountForCurrentUser()`.
- Do one real `accountId`-scoped query even though it's guaranteed empty right now: `prisma.client.count({ where: { accountId: account.id } })`. Comment it as the canonical pattern — CLAUDE.md treats cross-tenant leaks as a review/test gate, so the very first read establishing "every query has `where: { accountId }`" matters more than the query being trivial.
- Render "no workflows yet" regardless of the count.

## 7. Sentry

```bash
npx @sentry/wizard@latest -i nextjs   # interactive; needs Sentry browser login
```
If run non-interactively isn't possible, create manually:
- `instrumentation.ts` (root) — Next's hook, imports `sentry.server.config.ts` or `sentry.edge.config.ts` based on `NEXT_RUNTIME`.
- `sentry.server.config.ts` / `sentry.edge.config.ts` — `Sentry.init({ dsn, enableLogs: true })`.
- `instrumentation-client.ts` (root, replaces the old `sentry.client.config.ts` name) — client-side `Sentry.init({ dsn, enableLogs: true })`.
- `next.config.ts` wrapped in `withSentryConfig(nextConfig, { org, project, authToken: process.env.SENTRY_AUTH_TOKEN, silent: true })`.

`lib/logger.ts` — thin wrapper over `Sentry.logger.{info,warn,error}` giving one consistent call shape (`logger.info("account.created", { accountId })`), used in the account auto-create path. This is the "structured logging from M0" CLAUDE.md asks for, and the one place to keep enforcing no-PII-in-log-attributes once ping payloads exist later.

## 8. `/api/health`

`app/api/health/route.ts` — public (not behind auth), pure process-alive check, **no DB round-trip**:
```ts
export async function GET() {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
}
```
Deliberately not checking DB connectivity here — Railway's health check gates deploy promotion, and a transient Neon blip shouldn't flap deploys for a reason unrelated to the process itself being alive.

## 9. Railway deploy

`package.json` scripts:
```json
"scripts": { "build": "next build", "start": "next start -p ${PORT:-3000}" }
```
No `output: "standalone"` — buys nothing under Railpack (full `node_modules` persists anyway) and adds manual server-launch steps for zero benefit here.

`railway.json`:
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "RAILPACK" },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

`package.json` also gets `"engines": { "node": "22.x" }` so Railpack provisions the same Node major as local dev.

The repo now has a remote (`github.com/euclio-io/euclio`) — connecting it to Railway for git-based auto-deploy is the natural path (Railway dashboard → New Project → Deploy from GitHub repo). `railway up` (uploading the working directory directly) remains a fallback if GitHub-based deploy isn't set up yet.

Migrations against the production DB stay a manual step for M0 (one migration, `init` — not worth wiring a release-phase command yet): `railway run npx prisma migrate deploy` right after deploy.

## 10. Env vars — exact steps to hand off

| Var | Source |
|---|---|
| `DATABASE_URL` | Neon Console → Connection Details, **pooled** toggle ON (hostname has `-pooler`) |
| `DIRECT_URL` | Neon Console → Connection Details, pooled toggle OFF |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Project Settings → Client Keys |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens (`project:releases` scope) — build-time only |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Sentry org/project slugs |

Steps:
1. Neon: create project + database, copy pooled + direct URLs into `.env.local`.
2. Clerk: create app, Organizations off, copy both keys into `.env.local`.
3. Sentry: create a Next.js project, copy DSN, generate an auth token, note org/project slugs.
4. `npx prisma migrate dev --name init` locally against Neon.
5. Connect the GitHub repo to a new Railway project (or `railway login && railway init && railway up`).
6. Set every var above on the Railway service (`railway variables set KEY=value`, or via dashboard) — including on the build environment for `SENTRY_AUTH_TOKEN`.
7. `railway run npx prisma migrate deploy` once, against production.
8. Visit `<deployed-url>/api/health` → `{status:"ok"}`; sign up via `/dashboard` → confirms Clerk + account auto-create + Sentry logging all work together.
9. Create `.env.example` (var names only, no values) and commit it; verify `.env.local` is gitignored.

## Explicitly not built in this slice
`/api/ping/[token]`, node-cron watcher, Resend email, ClientUpdate compose/send, simulate-failure, any client-facing view. Nothing above introduces shared mutable state that would make extracting ingest into its own process harder later.

## Verification
- `npm run build` succeeds locally with Node 22.
- `npx prisma migrate dev` applies cleanly against Neon; `npx prisma studio` shows empty `Account`/`User` tables with the nullable `clerkOrgId` column.
- `npm run dev`: visiting `/dashboard` unauthenticated redirects to sign-in; after signing up, `/dashboard` renders "no workflows yet" and a new `Account`+`User` row exists with `clerkOrgId = null`.
- Trigger a manual `Sentry.captureException` or throw inside a route temporarily to confirm an event lands in the Sentry project, then remove it.
- `curl localhost:3000/api/health` → `{"status":"ok",...}`.
- After Railway deploy: same checks against the public URL, plus confirm `railway logs` shows structured log lines from the account auto-create path.
