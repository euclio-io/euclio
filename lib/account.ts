import { auth, currentUser } from "@clerk/nextjs/server";
import { Prisma, type Account } from "../generated/prisma/client";
import { prisma } from "./prisma";

/**
 * Ensures the currently signed-in Clerk user has an Account (tenant root) and a
 * User row, creating them lazily on first visit, and returns the Account.
 *
 * Responsibility: this is the single entry point that bootstraps and resolves
 * the tenant. `Account.id` — NOT `clerkOrgId` — is the tenant key every
 * downstream query must scope by (`where: { accountId: account.id }`).
 *
 * Cost/flow:
 *  - Steady state (User already exists): one indexed lookup, no Clerk API call.
 *  - First visit: create Account + User atomically in one transaction, so a
 *    half-created tenant can never exist.
 *  - Two concurrent first-loads (e.g. two browser tabs) race on the
 *    `User.clerkUserId` unique constraint; the loser catches P2002 and
 *    re-resolves instead of surfacing an error.
 *
 * Rejected alternative: a Clerk `user.created` webhook. It needs a public signed
 * endpoint, retry/idempotency handling, and a tunnel for local dev — and you'd
 * still need this lazy path as a fallback for the webhook-vs-first-visit race.
 * Strictly more moving parts for identical M0 behavior.
 */
export async function getOrCreateAccountForCurrentUser(): Promise<Account> {
  const { userId } = await auth();
  if (!userId) {
    // Callers must guard with auth() before invoking this; safety net only.
    throw new Error(
      "getOrCreateAccountForCurrentUser called without an authenticated user",
    );
  }

  // Steady-state path: `auth()` above is a JWT read (no network); this is the
  // only DB hit, and we never call the Clerk API on a repeat visit.
  const existing = await prisma.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (existing) {
    return prisma.account.findUniqueOrThrow({
      where: { id: existing.accountId },
    });
  }

  // First visit for this Clerk user — fetch the profile (a Clerk API call) only
  // now, to seed the User/Account rows.
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";

  try {
    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        // Auto-created per signup. clerkOrgId stays null for solo freelancers;
        // it's only set later if an agency adopts a real Clerk Org.
        data: { name: email || "Untitled", clerkOrgId: null },
      });
      await tx.user.create({
        data: {
          clerkUserId: userId,
          accountId: created.id,
          email,
          name: clerkUser?.firstName ?? null,
        },
      });
      return created;
    });

    // Structured logging (CLAUDE.md: "from M0"). Placeholder over console until
    // the Sentry logger lands in §7. No PII: accountId only, never email/name.
    console.info("account.created", { accountId: account.id });
    return account;
  } catch (e) {
    // P2002 = unique violation on User.clerkUserId: a concurrent first-load won
    // the race and already created the rows. Re-resolve rather than error.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return getOrCreateAccountForCurrentUser();
    }
    throw e;
  }
}
