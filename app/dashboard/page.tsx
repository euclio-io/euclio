import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/format-relative-time";

/**
 * Home — "Clients" view.
 * Matches euclio-home-view.html:
 *   - Pulse line: open incident summary (amber) or quiet state (green)
 *   - Figures row: clients / workflows / receipts 30d / incidents 30d
 *   - Client list rows: tick / name+status / workflow count + receipts
 */
export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Full client + workflow + incident data for the home view
  const clients = await prisma.client.findMany({
    where: { accountId: account.id, archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      workflows: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          lastPingAt: true,
          expectedIntervalMinutes: true,
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

  // Aggregate figures
  const totalWorkflows = clients.reduce((s, c) => s + c.workflows.length, 0);

  const incidentCount30d = await prisma.incident.count({
    where: {
      workflow: { client: { accountId: account.id } },
      openedAt: { gte: thirtyDaysAgo },
    },
  });

  const pingCount30d = await prisma.ping.count({
    where: {
      workflow: { client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  // Open incidents across all clients (for pulse line)
  const openIncidents = clients.flatMap((c) =>
    c.workflows.flatMap((w) =>
      w.incidents.map((i) => ({
        ...i,
        workflowName: w.name,
        clientName: c.name,
        openedAt: i.openedAt,
      })),
    ),
  );

  // Per-client receipt counts (30d) for the row meta column
  const receiptCounts = await prisma.canaryReceipt.groupBy({
    by: ["workflowId"],
    where: {
      workflow: { client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
    _count: { id: true },
  });
  const receiptByWorkflow = new Map(
    receiptCounts.map((r) => [r.workflowId, r._count.id]),
  );

  // Per-client receipt total
  function clientReceiptCount(clientId: string): number {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return 0;
    return c.workflows.reduce(
      (s, w) => s + (receiptByWorkflow.get(w.id) ?? 0),
      0,
    );
  }

  // Longest quiet run across all clients (days since last incident)
  const lastIncident = await prisma.incident.findFirst({
    where: { workflow: { client: { accountId: account.id } } },
    orderBy: { openedAt: "desc" },
    select: { openedAt: true },
  });
  const quietDays = lastIncident
    ? Math.floor(
        (Date.now() - lastIncident.openedAt.getTime()) / (24 * 60 * 60 * 1000),
      )
    : null;

  return (
    <div style={{ padding: "30px 44px 0", minWidth: 0 }}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "18px",
          marginBottom: "0",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "25px",
            fontWeight: 500,
            letterSpacing: "-.005em",
          }}
        >
          Clients
        </h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: "20px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px",
              color: "var(--ink-2)",
            }}
          >
            Last 30 days
          </span>
          <Link
            href="/dashboard/clients/new"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--pine)",
              textDecoration: "none",
            }}
          >
            + add client
          </Link>
        </div>
      </div>

      {/* ── Pulse line ── */}
      <div
        style={{
          margin: "30px 0 0",
          paddingBottom: "22px",
          borderBottom: "1px solid var(--hair)",
        }}
      >
        {openIncidents.length > 0 ? (
          <>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "23px",
                fontWeight: 500,
                color: "var(--amber-deep)",
                display: "flex",
                alignItems: "center",
                gap: "11px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "var(--amber)",
                  flexShrink: 0,
                }}
              />
              {openIncidents.length === 1
                ? "One open incident."
                : `${openIncidents.length} open incidents.`}
            </div>
            {openIncidents.slice(0, 2).map((i) => (
              <div
                key={i.id}
                style={{
                  fontSize: "13px",
                  color: "var(--ink-2)",
                  marginTop: "7px",
                  paddingLeft: "19px",
                }}
              >
                <Link
                  href={`/dashboard/incidents/${i.id}`}
                  style={{ color: "var(--amber-deep)", textDecoration: "none" }}
                >
                  {i.clientName} · {i.workflowName} ·{" "}
                  {i.source === "explicit_fail" ? "reported a failure" : "missed check-in"}{" "}
                  {formatRelativeTime(i.openedAt)}
                </Link>
              </div>
            ))}
          </>
        ) : (
          <>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "23px",
                fontWeight: 500,
                color: "var(--ink)",
                display: "flex",
                alignItems: "center",
                gap: "11px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "var(--green)",
                  flexShrink: 0,
                }}
              />
              {clients.length === 0 ? "No clients yet." : "All clear."}
            </div>
            {quietDays !== null && (
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--ink-2)",
                  marginTop: "7px",
                  paddingLeft: "19px",
                }}
              >
                Quiet{quietDays > 0 ? ` · ${quietDays} days` : " · no incidents on record"}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Figures ── */}
      <div
        style={{
          display: "flex",
          gap: "34px",
          margin: "20px 0 0",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--hair-2)",
        }}
      >
        {[
          { v: clients.length, k: "clients" },
          { v: totalWorkflows, k: "workflows watched" },
          { v: pingCount30d.toLocaleString(), k: "check-ins · 30d" },
          { v: incidentCount30d, k: "incidents · 30d" },
        ].map(({ v, k }) => (
          <div key={k}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "16px",
                fontWeight: 500,
              }}
            >
              {v}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8.5px",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
                marginTop: "3px",
              }}
            >
              {k}
            </div>
          </div>
        ))}
      </div>

      {/* ── Client list ── */}
      {clients.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "20px 0 4px",
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
            }}
          >
            <span>The book</span>
            <span>attention first</span>
          </div>

          {clients
            .slice()
            .sort((a, b) => {
              // Open incidents first
              const aDown = a.workflows.some((w) => w.status === "down");
              const bDown = b.workflows.some((w) => w.status === "down");
              if (aDown && !bDown) return -1;
              if (!aDown && bDown) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((client) => {
              const hasOpen = client.workflows.some((w) => w.status === "down");
              const openWf = client.workflows.find((w) => w.status === "down");
              const openInc = openWf?.incidents[0] ?? null;
              const receipts30d = clientReceiptCount(client.id);

              // Status line text
              let statusText: string;
              if (hasOpen && openInc) {
                statusText = `${openWf!.name} · ${openInc.source === "explicit_fail" ? "reported a failure" : "missed check-in"} ${formatRelativeTime(openInc.openedAt)}`;
              } else {
                // Find last resolved incident for quiet run
                statusText = "Quiet run";
              }

              return (
                <Link
                  key={client.id}
                  href={`/dashboard/clients/${client.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      padding: "15px 2px",
                      borderBottom: "1px solid var(--hair-2)",
                      cursor: "pointer",
                    }}
                  >
                    {/* Tick */}
                    <span
                      style={{
                        width: "3px",
                        height: "30px",
                        borderRadius: "2px",
                        flexShrink: 0,
                        background: hasOpen ? "var(--amber)" : "transparent",
                      }}
                    />

                    {/* Name + status */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "15.5px",
                          fontWeight: 500,
                        }}
                      >
                        {client.name}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "8px",
                          fontSize: "12.5px",
                          color: "var(--ink-2)",
                          marginTop: "3px",
                        }}
                      >
                        <span
                          style={{
                            width: "5px",
                            height: "5px",
                            borderRadius: "50%",
                            flexShrink: 0,
                            background: hasOpen ? "var(--amber)" : "var(--green)",
                            position: "relative",
                            top: "-2px",
                          }}
                        />
                        <span style={{ color: hasOpen ? "var(--amber-deep)" : undefined }}>
                          {statusText}
                        </span>
                      </div>
                    </div>

                    {/* Meta */}
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--ink-2)",
                        textAlign: "right",
                        lineHeight: "1.8",
                        flexShrink: 0,
                      }}
                    >
                      {client.workflows.length} workflow{client.workflows.length !== 1 ? "s" : ""}
                      {receipts30d > 0 && (
                        <>
                          <br />
                          {receipts30d} receipts · 30d
                        </>
                      )}
                    </div>

                    {/* Chevron */}
                    <span
                      style={{
                        color: "var(--ink-2)",
                        fontSize: "10px",
                        paddingLeft: "6px",
                      }}
                    >
                      ▶
                    </span>
                  </div>
                </Link>
              );
            })}
        </>
      )}

      {/* ── Add client (bottom, subtle) ── */}
      <div style={{ padding: "24px 0 40px" }}>
        <Link
          href="/dashboard/clients/new"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
            textDecoration: "none",
          }}
        >
          + add client →
        </Link>
      </div>

    </div>
  );
}
