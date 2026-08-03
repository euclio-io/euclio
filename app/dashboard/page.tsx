import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { deriveStatus } from "@/lib/status";
import { Chip } from "@/components/ui/Chip";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { formatRelativeTime } from "@/lib/format-relative-time";

/**
 * Home — "Clients" view.
 * Matches euclio-home-view.html:
 *   - Figures row
 *   - Two-column grid: "The book" panel (left) + "Needs attention" + "Latest entries" (right)
 */
export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();
  const tz = account.timezone ?? "UTC";
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Full client + workflow + incident data
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
          status: true,
          createdAt: true,
          lastPingAt: true,
          expectedIntervalMinutes: true,
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

  // Aggregate figures
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

  function clientReceiptCount(clientId: string): number {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return 0;
    return c.workflows.reduce(
      (s, w) => s + (receiptByWorkflow.get(w.id) ?? 0),
      0,
    );
  }

  // Derive status for each client (worst workflow wins)
  type ClientRow = {
    id: string;
    name: string;
    statusKind: "open" | "resolved" | "quiet";
    statusChip: string;
    statusSub: string;
    workflows: number;
    receipts30d: number;
    openIncidentId?: string;
    openedAt?: Date;
  };

  const clientRows: ClientRow[] = clients.map((client) => {
    const receipts30d = clientReceiptCount(client.id);

    // Find worst workflow
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
    let openedAt: Date | undefined;

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
      openedAt = inc.openedAt;
    } else if (resolvedWf) {
      const inc = resolvedWf.incidents[0];
      const s = deriveStatus({
        hasOpenIncident: false,
        lastResolvedAt: inc.resolvedAt,
        createdAt: resolvedWf.createdAt,
        timezone: tz,
      });
      statusKind = "resolved";
      statusChip = s.chip;
      statusSub = `${resolvedWf.name} · resolved`;
    } else {
      // All quiet — use the workflow with the most recent ping
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
        statusChip = "QUIET";
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
      openedAt,
    };
  });

  // Sort: open first, then resolved, then quiet; alpha within each group
  clientRows.sort((a, b) => {
    const order = { open: 0, resolved: 1, quiet: 2 };
    const diff = order[a.statusKind] - order[b.statusKind];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  // Open incidents for "Needs attention" panel
  const openRows = clientRows.filter((r) => r.statusKind === "open");

  // Latest entries feed (recent incidents across all clients)
  const latestIncidents = await prisma.incident.findMany({
    where: { workflow: { client: { accountId: account.id } } },
    orderBy: { openedAt: "desc" },
    take: 6,
    select: {
      id: true,
      source: true,
      status: true,
      openedAt: true,
      resolvedAt: true,
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
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays === 0) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
        .format(date)
        .replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase());
    }
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
    }).format(date);
  }

  return (
    <div style={{ padding: "26px 40px 0", minWidth: 0 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "24px",
            fontWeight: 500,
          }}
        >
          Clients
        </span>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Link
            href="/dashboard/clients/new"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              borderRadius: "999px",
              padding: "8px 16px",
              border: "none",
              background: "var(--pine)",
              color: "var(--rail-text)",
              textDecoration: "none",
            }}
          >
            + Add client
          </Link>
        </div>
      </div>

      {/* ── Figures ── */}
      <div style={{ display: "flex", gap: "34px", margin: "18px 0 16px" }}>
        {[
          { v: clients.length, k: "clients" },
          { v: totalWorkflows, k: "workflows" },
          { v: receiptCount30d.toLocaleString(), k: "receipts · 30d" },
          { v: incidentCount30d, k: "incidents · 30d" },
        ].map(({ v, k }) => (
          <div key={k}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "15px",
                fontWeight: 600,
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

      {/* ── Two-column grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.62fr 1fr",
          gap: "14px",
          paddingBottom: "40px",
        }}
      >
        {/* ── Left: The book ── */}
        <div>
          <Panel>
            <PanelHeader
              label="The book"
              count={`${clients.length} clients`}
              right="sorted: status ▾"
            />

            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 168px 74px 92px 16px",
                gap: "14px",
                alignItems: "center",
                padding: "10px 16px 7px",
                borderBottom: "1px solid var(--hair)",
              }}
            >
              {["Client", "Status", "Workflows", "Receipts · 30d", ""].map(
                (h, i) => (
                  <span
                    key={i}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      color: "var(--ink-2)",
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
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--ink-2)",
                }}
              >
                No clients yet.{" "}
                <Link
                  href="/dashboard/clients/new"
                  style={{ color: "var(--pine)" }}
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
                      gridTemplateColumns: "1fr 168px 74px 92px 16px",
                      gap: "14px",
                      alignItems: "center",
                      padding: "13px 16px",
                      borderBottom:
                        i < clientRows.length - 1
                          ? "1px solid var(--hair-2)"
                          : "none",
                      cursor: "pointer",
                      background:
                        row.statusKind === "open"
                          ? "rgba(176,133,46,.08)"
                          : "transparent",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "15px",
                          fontWeight: 500,
                        }}
                      >
                        {row.name}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--ink-2)",
                          marginTop: "2px",
                        }}
                      >
                        {row.statusSub}
                      </div>
                    </div>
                    <span>
                      <Chip kind={row.statusKind} label={row.statusChip} />
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        textAlign: "right",
                      }}
                    >
                      {row.workflows}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        textAlign: "right",
                      }}
                    >
                      {row.receipts30d}
                    </span>
                    <span
                      style={{
                        color: "var(--ink-2)",
                        fontSize: "10px",
                        textAlign: "right",
                      }}
                    >
                      ▶
                    </span>
                  </div>
                </Link>
              ))
            )}

            <div
              style={{
                padding: "10px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "8.5px",
                color: "var(--ink-2)",
                borderTop: "1px solid var(--hair-2)",
              }}
            >
              Entries are appended, never edited.
            </div>
          </Panel>
        </div>

        {/* ── Right: Needs attention + Latest entries ── */}
        <div>
          {openRows.length > 0 ? (
            <Panel loud style={{ marginBottom: "14px" }}>
              <PanelHeader
                label="Needs attention"
                count={openRows.length}
                right={new Intl.DateTimeFormat("en-US", {
                  timeZone: tz,
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
                  .format(new Date())
                  .replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase())}
              />
              {openRows.slice(0, 3).map((row) => (
                <div
                  key={row.id}
                  style={{ padding: "14px 16px 15px", cursor: "pointer" }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: "17px",
                      fontWeight: 500,
                    }}
                  >
                    {row.name}
                  </div>
                  <div
                    style={{
                      color: "var(--amber-deep)",
                      fontWeight: 500,
                      fontSize: "12.5px",
                      marginTop: "4px",
                    }}
                  >
                    {row.statusSub}
                  </div>
                  {row.openIncidentId && (
                    <Link
                      href={`/dashboard/incidents/${row.openIncidentId}`}
                      style={{
                        display: "inline-block",
                        marginTop: "12px",
                        fontFamily: "var(--font-mono)",
                        fontSize: "9.5px",
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: "var(--rail-text)",
                        background: "var(--pine)",
                        borderRadius: "999px",
                        padding: "7px 14px",
                        textDecoration: "none",
                      }}
                    >
                      Open incident ▶
                    </Link>
                  )}
                </div>
              ))}
            </Panel>
          ) : (
            <Panel style={{ marginBottom: "14px" }}>
              <PanelHeader label="All clear" />
              <div
                style={{
                  padding: "14px 16px 15px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--ink-2)",
                }}
              >
                {clients.length === 0
                  ? "No clients yet."
                  : "No open incidents."}
              </div>
            </Panel>
          )}

          {/* Latest entries */}
          <Panel>
            <PanelHeader label="Latest entries" />
            {latestIncidents.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--ink-2)",
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
                      gridTemplateColumns: "64px 1fr",
                      gap: "12px",
                      padding: "10px 16px",
                      borderBottom:
                        i < latestIncidents.length - 1
                          ? "1px solid var(--hair-2)"
                          : "none",
                      fontSize: "12px",
                      alignItems: "baseline",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9.5px",
                        color: "var(--ink-2)",
                      }}
                    >
                      {formatEntryTime(inc.openedAt)}
                    </span>
                    <span>
                      <strong
                        style={{
                          fontWeight: 500,
                          color:
                            inc.status === "open"
                              ? "var(--amber-deep)"
                              : "var(--ink)",
                        }}
                      >
                        {inc.workflow.client.name}
                      </strong>{" "}
                      ·{" "}
                      {inc.status === "open"
                        ? inc.source === "explicit_fail"
                          ? "reported a failure · open"
                          : "missed check-in · open"
                        : inc.sendsDue !== null && inc.sendsDue > 0
                          ? `resolved · ${inc.sendsArrived ?? 0} of ${inc.sendsDue} received`
                          : "resolved"}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
