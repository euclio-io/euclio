import { PrismaClient } from "@/generated/prisma/client";
import { logger } from "./logger";
import { PrismaPg } from "@prisma/adapter-pg";

// The running app's Prisma client. Independent of prisma.config.ts (which is
// CLI-only). Prisma 7 requires a driver adapter — the old zero-config engine is
// gone with no fallback — so we hand it a pg pool over Neon's POOLED URL.
//
// max: 5 is deliberately small. Neon's pooler already multiplexes underneath;
// an oversized app-level pool on top just pins idle connections against Neon's
// limit for no benefit.
// First arg is a pg.PoolConfig — connectionString and `max` both live here.
// (The optional second arg is Prisma-specific, e.g. `schema`, and has no `max`.)
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 });

// Reuse one client across hot-reloads in dev, so we don't exhaust connections
// by minting a new PrismaClient on every module reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Log a startup message so we know the client was initialised.
logger.info("prisma.client.init");
