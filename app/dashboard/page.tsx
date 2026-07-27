import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { AddClientForm } from "./add-client-form";
import { AddWorkflowForm } from "./add-workflow-form";

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
  const clients = await prisma.client.findMany({
    where: { accountId: account.id, archivedAt: null },
    orderBy: { name: "asc" },
    include: {
      workflows: {
        where: { archivedAt: null },
        orderBy: { name: "asc" },
      },
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Add a client</h2>
        <AddClientForm />
      </section>

      <section className="flex flex-col gap-6">
        {clients.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">No clients yet.</p>
        ) : (
          clients.map((client) => (
            <div
              key={client.id}
              className="flex flex-col gap-3 rounded border p-4 dark:border-zinc-700"
            >
              <h3 className="font-medium">{client.name}</h3>

              {client.workflows.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">No workflows yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {client.workflows.map((workflow) => (
                    <li
                      key={workflow.id}
                      className="flex flex-col gap-1 rounded border px-3 py-2 text-sm dark:border-zinc-800"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{workflow.name}</span>
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {workflow.status}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          every {workflow.expectedIntervalMinutes}m
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500">
                        Ping token (check-in URL isn&apos;t live yet):{" "}
                        <code className="text-zinc-600 dark:text-zinc-400">{workflow.token}</code>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <AddWorkflowForm clientId={client.id} />
            </div>
          ))
        )}
      </section>
    </main>
  );
}
