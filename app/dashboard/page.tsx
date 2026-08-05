import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { deriveStatus } from "@/lib/status";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, ChevronRight } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/format-relative-time";

/**
 * Home — "Clients" view.
 * Matches euclio-home-view.html (v6 design system).
 *
 * Layout:
 *   Header: "Clients" title + subtitle + search/filter/Add client
 *   Stat cards grid (4 cards)
 *   Two-column grid:
 *     Left: "The book" card (client table with badges)
 *     Right: "Needs attention" card (amber, when open incidents exist) + "Latest entries" card
 */
export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();
  const tz = account.timezone ?? "UTC";
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const clients = await prisma.client.findMany({
    where: { accountId: account.id, archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      workflows: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          createdAt: true,
          lastPingAt: true,
          incidents: {
            orderBy: { openedAt: "desc" },
            take: 1,
            select: {
              id: true,
              source: true,
              status: true,
              openedAt: true,
              resolvedAt: true,
            },
          },
        },
      },
    },
  });

  const totalWorkflows = clients.reduce((s, c) => s + c.workflows.length, 0);

  const incidentCount30d = await prisma.incident.count({
    where: {
      workflow: { client: { accountId: account.id } },
      openedAt: { gte: thirtyDaysAgo },
    },
  });

  const receiptCount30d = await prisma.canaryReceipt.count({
    where: {
      workflow: { client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  // Per-client receipt counts (30d)
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

  type ClientRow = {
    id: string;
    name: string;
    statusKind: "open" | "resolved" | "quiet";
    statusChip: string;
    statusSub: string;
    workflows: number;
    receipts30d: number;
    openIncidentId?: string;
  };

  const clientRows: ClientRow[] = clients.map((client) => {
    const receipts30d = client.workflows.reduce(
      (s, w) => s + (receiptByWorkflow.get(w.id) ?? 0),
      0,
    );

    const openWf = client.workflows.find(
      (w) => w.incidents[0]?.status === "open",
    );
    const resolvedWf = client.workflows.find(
      (w) => w.incidents[0]?.status === "resolved",
    );

    let statusKind: "open" | "resolved" | "quiet" = "quiet";
    let statusChip = "";
    let statusSub = "";
    let openIncidentId: string | undefined;

    if (openWf) {
      const inc = openWf.incidents[0];
      const s = deriveStatus({
        hasOpenIncident: true,
        openedAt: inc.openedAt,
        createdAt: openWf.createdAt,
        timezone: tz,
      });
      statusKind = "open";
      statusChip = s.chip;
      statusSub = `${openWf.name} · ${inc.source === "explicit_fail" ? "reported a failure" : "missed check-in"} ${formatRelativeTime(inc.openedAt)}`;
      openIncidentId = inc.id;
    } else if (resolvedWf) {
      const inc = resolvedWf.incidents[0];
      const s = deriveStatus({
        hasOpenIncident: false,
        lastResolvedAt: inc.resolvedAt,
        createdAt: resolvedWf.createdAt,
        timezone: tz,
      });
      const pause = inc.resolvedAt
        ? Math.round(
            (inc.resolvedAt.getTime() - inc.openedAt.getTime()) / 60_000,
          )
        : 0;
      statusKind = "resolved";
      statusChip = s.chip;
      statusSub = `${pause}-min pause this morning · resolved`;
    } else {
      const anyWf = client.workflows[0];
      if (anyWf) {
        const s = deriveStatus({
          hasOpenIncident: false,
          createdAt: anyWf.createdAt,
          timezone: tz,
        });
        statusKind = "quiet";
        statusChip = s.chip;
        statusSub = anyWf.lastPingAt
          ? `Last check-in ${formatRelativeTime(anyWf.lastPingAt)}`
          : "No check-ins yet";
      } else {
        statusChip = "Quiet · today";
        statusSub = "No workflows";
      }
    }

    return {
      id: client.id,
      name: client.name,
      statusKind,
      statusChip,
      statusSub,
      workflows: client.workflows.length,
      receipts30d,
      openIncidentId,
    };
  });

  // Sort: open first, then resolved, then quiet; alpha within each group
  clientRows.sort((a, b) => {
    const order = { open: 0, resolved: 1, quiet: 2 };
    const diff = order[a.statusKind] - order[b.statusKind];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  const openRows = clientRows.filter((r) => r.statusKind === "open");

  // Latest entries feed
  const latestIncidents = await prisma.incident.findMany({
    where: { workflow: { client: { accountId: account.id } } },
    orderBy: { openedAt: "desc" },
    take: 6,
    select: {
      id: true,
      source: true,
      status: true,
      openedAt: true,
      sendsDue: true,
      sendsArrived: true,
      workflow: {
        select: {
          name: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
  });

  function formatEntryTime(date: Date): string {
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays === 0) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    }
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
    }).format(date);
  }

  const nowFormatted = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());

  return (
    <div className="page-pad">
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div
            style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-.01em" }}
          >
            Clients
          </div>
          <div style={{ fontSize: "13px", color: "var(--t2)", marginTop: "3px" }}>
            Your book across {clients.length} client{clients.length !== 1 ? "s" : ""} · {nowFormatted}
          </div>
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {/* Search (static UI) */}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "var(--t3)",
              border: "1px solid var(--border-2)",
              borderRadius: "8px",
              padding: "8px 12px",
              background: "#fff",
              boxShadow: "var(--sh)",
              width: "220px",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            Search clients…
          </span>
          {/* Status filter */}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--t2)",
              border: "1px solid var(--border-2)",
              borderRadius: "8px",
              padding: "8px 12px",
              background: "#fff",
              boxShadow: "var(--sh)",
            }}
          >
            Status: All
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          {/* Add client */}
          <Link
            href="/dashboard/clients/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "8px",
              padding: "9px 14px",
              border: "1px solid var(--pine)",
              background: "var(--pine)",
              color: "#fff",
              boxShadow: "var(--sh)",
              textDecoration: "none",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add client
          </Link>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="stat-grid">
        {[
          { k: "Clients", v: clients.length },
          { k: "Workflows watched", v: totalWorkflows },
          { k: "Receipts · 30d", v: receiptCount30d.toLocaleString() },
          { k: "Incidents · 30d", v: incidentCount30d },
        ].map(({ k, v }) => (
          <div
            key={k}
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "14px 16px",
              boxShadow: "var(--sh)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--t2)" }}>
              {k}
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                letterSpacing: "-.01em",
                marginTop: "6px",
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid-2col-home">
        {/* ── Left: The book ── */}
        <Card>
          <CardHeader
            title="The book"
            count={clients.length}
            right={
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Sort: Status
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            }
          />

          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 170px 84px 110px 28px",
              gap: "14px",
              alignItems: "center",
              padding: "9px 16px",
              background: "var(--subtle)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {["Client", "Status", "Workflows", "Receipts · 30d", ""].map(
              (h, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--t3)",
                    textAlign: i >= 2 && i < 4 ? "right" : "left",
                  }}
                >
                  {h}
                </span>
              ),
            )}
          </div>

          {/* Rows */}
          {clients.length === 0 ? (
            <div
              style={{
                padding: "20px 16px",
                fontSize: "13px",
                color: "var(--t2)",
              }}
            >
              No clients yet.{" "}
              <Link
                href="/dashboard/clients/new"
                style={{ color: "var(--pine)", fontWeight: 500 }}
              >
                Add one →
              </Link>
            </div>
          ) : (
            clientRows.map((row, i) => (
              <Link
                key={row.id}
                href={`/dashboard/clients/${row.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 170px 84px 110px 28px",
                    gap: "14px",
                    alignItems: "center",
                    padding: "13px 16px",
                    borderBottom:
                      i < clientRows.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500 }}>
                      {row.name}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--t2)",
                        marginTop: "2px",
                      }}
                    >
                      {row.statusSub}
                    </div>
                  </div>
                  <span>
                    <Badge kind={row.statusKind} label={row.statusChip} />
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    {row.workflows}
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    {row.receipts30d}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      color: "var(--t3)",
                    }}
                  >
                    <ChevronRight />
                  </span>
                </div>
              </Link>
            ))
          )}

          <div
            style={{
              padding: "11px 16px",
              fontSize: "12px",
              color: "var(--t3)",
              borderTop: "1px solid var(--border)",
              background: "var(--subtle)",
            }}
          >
            Entries are appended, never edited.
          </div>
        </Card>

        {/* ── Right: Needs attention + Latest entries ── */}
        <div>
          {openRows.length > 0 ? (
            <Card attention style={{ marginBottom: "14px" }}>
              <CardHeader
                title="Needs attention"
                count={openRows.length}
                right={formatEntryTime(new Date())}
                attention
                icon={
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--amber-tx)", flexShrink: 0 }}
                  >
                    <path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
                  </svg>
                }
              />
              {openRows.slice(0, 3).map((row) => (
                <div key={row.id} style={{ padding: "16px" }}>
                  <div style={{ fontSize: "16px", fontWeight: 600 }}>
                    {row.name}
                  </div>
                  <div
                    style={{
                      fontSize: "13.5px",
                      color: "var(--amber-tx)",
                      fontWeight: 500,
                      marginTop: "4px",
                    }}
                  >
                    {row.statusSub}
                  </div>
                  {row.openIncidentId && (
                    <Link
                      href={`/dashboard/incidents/${row.openIncidentId}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "14px",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#fff",
                        background: "var(--pine)",
                        borderRadius: "8px",
                        padding: "8px 13px",
                        boxShadow: "var(--sh)",
                        textDecoration: "none",
                      }}
                    >
                      Open incident
                      <ChevronRight />
                    </Link>
                  )}
                </div>
              ))}
            </Card>
          ) : (
            <Card style={{ marginBottom: "14px" }}>
              <CardHeader title="All clear" />
              <div
                style={{
                  padding: "14px 16px",
                  fontSize: "13px",
                  color: "var(--t2)",
                }}
              >
                {clients.length === 0
                  ? "No clients yet."
                  : "No open incidents."}
              </div>
            </Card>
          )}

          {/* Latest entries */}
          <Card>
            <CardHeader title="Latest entries" />
            {latestIncidents.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  fontSize: "13px",
                  color: "var(--t2)",
                }}
              >
                No entries yet.
              </div>
            ) : (
              latestIncidents.map((inc, i) => (
                <Link
                  key={inc.id}
                  href={`/dashboard/incidents/${inc.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "66px 1fr",
                      gap: "12px",
                      padding: "11px 16px",
                      borderBottom:
                        i < latestIncidents.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                      fontSize: "13px",
                      alignItems: "baseline",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: "12px", color: "var(--t3)" }}>
                      {formatEntryTime(inc.openedAt)}
                    </span>
                    <span>
                      <strong
                        style={{
                          fontWeight: 600,
                          color:
                            inc.status === "open"
                              ? "var(--amber-tx)"
                              : "var(--t1)",
                        }}
                      >
                        {inc.workflow.client.name}
                      </strong>{" "}
                      <span style={{ color: "var(--t2)" }}>
                        ·{" "}
                        {inc.status === "open"
                          ? inc.source === "explicit_fail"
                            ? "reported a failure · open"
                            : "missed check-in · open"
                          : inc.sendsDue !== null && inc.sendsDue > 0
                            ? `resolved · ${inc.sendsArrived ?? 0} of ${inc.sendsDue} received`
                            : "resolved"}
                      </span>
                    </span>
                  </div>
                </Link>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
