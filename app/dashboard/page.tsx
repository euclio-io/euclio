import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

/**
 * The freelancer's dashboard — and the M0 tenant-bootstrap resource.
 *
 * Auth is enforced HERE, at the resource, not via middleware matchers: Clerk's
 * current guidance is to protect as close to the resource as possible, so the
 * guard can't drift out of sync with what it guards.
 */
export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in"); // protect close to the resource

  const account = await getOrCreateAccountForCurrentUser();

  // CANONICAL TENANT-SCOPING PATTERN — the security invariant of the whole app.
  // Every query scopes by accountId, sourced ONLY from the resolved Account,
  // never from a URL param or client input. A cross-tenant leak is the
  // highest-severity bug (CLAUDE.md), so this is a review gate, not a style choice.
  // This read is trivial today (guaranteed 0) but establishes the pattern.
  const workflowCount = await prisma.client.count({
    where: { accountId: account.id },
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        {workflowCount === 0
          ? "No workflows yet."
          : `${workflowCount} client${workflowCount === 1 ? "" : "s"}.`}
      </p>
    </main>
  );
}
