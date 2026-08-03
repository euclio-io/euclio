import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/base-url";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { AddClientForm } from "./add-client-form";
import { AddWorkflowForm } from "./add-workflow-form";
import { SimulateFailureForm } from "./simulate-failure-form";

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
  const baseUrl = await getBaseUrl();

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
        include: {
          // Include the most recent open incident so we can link to it.
          incidents: {
            where: { status: "open" },
            orderBy: { openedAt: "desc" },
            take: 1,
            select: { id: true, source: true, openedAt: true },
          },
        },
      },
    },
  });

  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "32px 24px 64px",
        fontFamily: "var(--font-sans)",
        color: "var(--ink)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "25px",
          fontWeight: 500,
          letterSpacing: "-.005em",
          marginBottom: "28px",
        }}
      >
        {account.name}
      </h1>

      <section style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8.5px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
            marginBottom: "12px",
          }}
        >
          Add a client
        </h2>
        <AddClientForm />
      </section>

      <section>
        {clients.length === 0 ? (
          <p style={{ color: "var(--ink-2)", fontSize: "13px" }}>No clients yet.</p>
        ) : (
          clients.map((client) => (
            <div
              key={client.id}
              style={{
                marginBottom: "28px",
                paddingBottom: "28px",
                borderBottom: "1px solid var(--hair)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "12px" }}>
                <h3
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "17px",
                    fontWeight: 500,
                  }}
                >
                  <Link
                    href={`/dashboard/clients/${client.id}`}
                    style={{ color: "var(--ink)", textDecoration: "none" }}
                  >
                    {client.name}
                  </Link>
                </h3>
                {/* All-green status: no down workflows */}
                {client.workflows.every((w) => w.status !== "down") &&
                  client.workflows.length > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: "var(--green)",
                      }}
                    >
                      all clear
                    </span>
                  )}
                <Link
                  href={`/dashboard/clients/${client.id}`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    color: "var(--ink-2)",
                    textDecoration: "none",
                  }}
                >
                  ledger →
                </Link>
              </div>

              {client.workflows.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--ink-2)", marginBottom: "12px" }}>
                  No workflows yet.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, marginBottom: "12px" }}>
                  {client.workflows.map((workflow) => {
                    const openIncident = workflow.incidents[0] ?? null;
                    const isDown = workflow.status === "down";

                    return (
                      <li
                        key={workflow.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          padding: "10px 12px",
                          marginBottom: "6px",
                          background: "var(--lift)",
                          border: "1px solid var(--hair-2)",
                          borderLeft: isDown
                            ? "3px solid var(--amber)"
                            : "1px solid var(--hair-2)",
                          borderRadius: "6px",
                          fontSize: "13px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{workflow.name}</span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "9px",
                              letterSpacing: ".08em",
                              textTransform: "uppercase",
                              color: isDown ? "var(--amber-deep)" : "var(--ink-2)",
                            }}
                          >
                            {workflow.status}
                          </span>
                          <span style={{ color: "var(--ink-2)", fontSize: "12px" }}>
                            every {workflow.expectedIntervalMinutes}m
                          </span>
                        </div>

                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            color: "var(--ink-2)",
                          }}
                        >
                          Ping URL:{" "}
                          <code style={{ color: "var(--pine)" }}>
                            {baseUrl}/api/ping/{workflow.token}
                          </code>
                        </div>

                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            color: "var(--ink-2)",
                          }}
                        >
                          Last ping:{" "}
                          {workflow.lastPingAt
                            ? formatRelativeTime(workflow.lastPingAt)
                            : "never"}
                        </div>

                        {/* Link to open incident if one exists */}
                        {openIncident && (
                          <div style={{ marginTop: "4px" }}>
                            <Link
                              href={`/dashboard/incidents/${openIncident.id}`}
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "10px",
                                letterSpacing: ".06em",
                                textTransform: "uppercase",
                                color: "var(--amber-deep)",
                                textDecoration: "underline",
                                textUnderlineOffset: "3px",
                              }}
                            >
                              {openIncident.source === "explicit_fail"
                                ? "View failure →"
                                : "View incident →"}
                            </Link>
                          </div>
                        )}

                        {workflow.status !== "down" && (
                          <div style={{ marginTop: "4px" }}>
                            <SimulateFailureForm workflowId={workflow.id} />
                          </div>
                        )}
                      </li>
                    );
                  })}
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
