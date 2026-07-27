import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The Prisma CLI runs outside Next.js, so it does NOT auto-read `.env.local`
// (that filename is a Next convention; plain dotenv only loads `.env`). Load
// `.env.local` first so it wins, then `.env` as a fallback — dotenv won't
// overwrite vars already set, mirroring Next's precedence.
loadEnv({ path: ".env.local" });
loadEnv();

// Used ONLY by the Prisma CLI (migrate/generate) — never imported by the app.
// Prisma 7 moved the datasource `url` out of schema.prisma to here, and dropped
// the separate `directUrl` field entirely. So the CLI's one `url` slot is
// deliberately the UNPOOLED (direct) Neon connection: DDL and Prisma's migration
// advisory locks are unreliable through a transaction pooler.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
