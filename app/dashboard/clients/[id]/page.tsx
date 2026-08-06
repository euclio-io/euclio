import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { deriveStatus } from "@/lib/status";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, ChevronRight } from "@/components/ui/Card";
import { AddWorkflowForm } from "@/app/dashboard/add-workflow-form";

// SVG icon for all-clear compose button
function AllClearIcon() {
  return (
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Client ledger — matches euclio-client-view.html (v6 design system).
 *
 * Layout:
 *   Header: client name + "Ledger · kept since <date>" + search/filter/Share receipt
 *   Stat cards grid (4 cards)
 *   Month bar: year + prev/next + month pills (amber tick on months with incidents)
 *   Two-column grid:
 *     Left: Register card (compact incident entries + quiet-run rows + canary event rows)
 *     Right: Workflows card (badge + canary on/off + chevron) + Record card
 *
 * Ownership: all queries scoped by accountId inside the where clause.
 */

function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function durationMinutes(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

function incidentTitle(
  source: string,
  openedAt: Date,
  resolvedAt: Date | null,
): string {
  if (source === "explicit_fail") return "Failure reported";
  if (!resolvedAt) return "Missed check-in";
  const mins = durationMinutes(openedAt, resolvedAt);
  return `${mins}-minute pause`;
}

function getMonthKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

function getMonthLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
  }).format(date);
}

export default async function ClientLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id: clientId } = await params;
  const sp = await searchParams;

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();
  const tz = account.timezone ?? "UTC";
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const client = await prisma.client.findFirst({
    where: { id: clientId, accountId: account.id, archivedAt: null },
    select: {
      id: true,
      name: true,
      createdAt: true,
      workflows: {
        where: { archivedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          lastPingAt: true,
          canaryAddress: true,
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

  if (!client) notFound();

  const allIncidents = await prisma.incident.findMany({
    where: { workflow: { clientId, client: { accountId: account.id } } },
    orderBy: { openedAt: "desc" },
    select: {
      id: true,
      source: true,
      status: true,
      openedAt: true,
      resolvedAt: true,
      sendsDue: true,
      sendsArrived: true,
      notes: {
        orderBy: { createdAt: "asc" },
        select: { id: true, text: true },
      },
      workflow: { select: { id: true, name: true } },
    },
  });

  const receipts30d = await prisma.canaryReceipt.count({
    where: {
      workflow: { clientId, client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  const checkins30d = await prisma.ping.count({
    where: {
      workflow: { clientId, client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  const incidents30d = allIncidents.filter(
    (i) => i.openedAt >= thirtyDaysAgo,
  ).length;

  // Longest quiet run
  let longestQuietDays = 0;
  if (allIncidents.length === 0) {
    longestQuietDays = Math.floor(
      (Date.now() - client.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    );
  } else {
    const sorted = [...allIncidents].sort(
      (a, b) => a.openedAt.getTime() - b.openedAt.getTime(),
    );
    const firstGap = Math.floor(
      (sorted[0].openedAt.getTime() - client.createdAt.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    longestQuietDays = Math.max(longestQuietDays, firstGap);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].resolvedAt ?? sorted[i - 1].openedAt;
      const gap = Math.floor(
        (sorted[i].openedAt.getTime() - prev.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      longestQuietDays = Math.max(longestQuietDays, gap);
    }
    const last = sorted[sorted.length - 1];
    const lastEnd = last.resolvedAt ?? last.openedAt;
    const tailGap = Math.floor(
      (Date.now() - lastEnd.getTime()) / (24 * 60 * 60 * 1000),
    );
    longestQuietDays = Math.max(longestQuietDays, tailGap);
  }

  // Month bar
  const now = new Date();
  const months: {
    key: string;
    label: string;
    year: number;
    hasIncident: boolean;
  }[] = [];
  const cursor = new Date(client.createdAt);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= now) {
    const key = getMonthKey(cursor, tz);
    const label = getMonthLabel(cursor, tz);
    const year = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" })
        .format(cursor)
        .trim(),
    );
    const hasIncident = allIncidents.some(
      (i) => getMonthKey(i.openedAt, tz) === key,
    );
    months.push({ key, label, year, hasIncident });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const currentMonthKey = getMonthKey(now, tz);
  const activeMonthKey = sp.month ?? currentMonthKey;

  const activeMonthIncidents = allIncidents.filter(
    (i) => getMonthKey(i.openedAt, tz) === activeMonthKey,
  );

  const [activeYear, activeMonth] = activeMonthKey.split("/").map(Number);
  const activeMonthStart = new Date(activeYear, activeMonth - 1, 1);
  const activeMonthEnd = new Date(activeYear, activeMonth, 1);

  const canaryEvents = await prisma.canaryReceipt.findMany({
    where: {
      workflow: { clientId, client: { accountId: account.id } },
      receivedAt: { gte: activeMonthStart, lt: activeMonthEnd },
      expectationId: null,
    },
    orderBy: { receivedAt: "desc" },
    take: 10,
    select: {
      id: true,
      receivedAt: true,
      workflow: { select: { id: true, name: true } },
    },
  });

  // All-clear updates for the active month
  const allClearUpdates = await prisma.clientUpdate.findMany({
    where: {
      clientId,
      accountId: account.id,
      kind: "all_clear",
      createdAt: { gte: activeMonthStart, lt: activeMonthEnd },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      publicSlug: true,
      createdAt: true,
      sentAt: true,
    },
  });

  // Check if there are any open incidents (to show/hide the all-clear button)
  const hasOpenIncidents = client.workflows.some((wf) =>
    wf.incidents.some((inc) => inc.status === "open"),
  );

  const workflowRows = client.workflows.map((wf) => {
    const inc = wf.incidents[0];
    const hasOpen = inc?.status === "open";
    const s = deriveStatus({
      hasOpenIncident: hasOpen,
      openedAt: hasOpen ? inc?.openedAt : undefined,
      lastResolvedAt: !hasOpen && inc?.resolvedAt ? inc.resolvedAt : undefined,
      createdAt: wf.createdAt,
      timezone: tz,
    });
    return {
      id: wf.id,
      name: wf.name,
      statusKind: s.kind,
      statusChip: s.chip,
      canaryOn: !!wf.canaryAddress,
    };
  });

  const keptSince = formatDate(client.createdAt, tz);
  const years = [...new Set(months.map((m) => m.year))];
  const activeYearNum =
    months.find((m) => m.key === activeMonthKey)?.year ??
    years[years.length - 1];

  const activeMonthLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "long",
  }).format(activeMonthStart);

  const totalEntries = activeMonthIncidents.length + canaryEvents.length + allClearUpdates.length;

  return (
    <div className="page-pad">
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <div>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 600,
              letterSpacing: "-.01em",
            }}
          >
            {client.name}
          </div>
          <div
            style={{ fontSize: "13px", color: "var(--t2)", marginTop: "3px" }}
          >
            Ledger · kept since {keptSince}
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
              width: "200px",
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
            Search the record…
          </span>
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
            All workflows
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
          <AddWorkflowForm clientId={client.id} />
          {!hasOpenIncidents && (
            <Link
              href={`/dashboard/clients/${clientId}/compose/all-clear`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--green-tx)",
                border: "1px solid var(--green-bd)",
                borderRadius: "8px",
                padding: "8px 12px",
                background: "var(--green-bg)",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              <AllClearIcon />
              Compose all-clear
            </Link>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="stat-grid">
        {[
          { k: "Receipts · 30d", v: receipts30d.toLocaleString() },
          { k: "Check-ins · 30d", v: checkins30d.toLocaleString() },
          { k: "Incidents · 30d", v: incidents30d },
          {
            k: "Longest quiet run",
            v: longestQuietDays,
            unit: "days",
          },
        ].map(({ k, v, unit }) => (
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
            <div
              style={{ fontSize: "13px", fontWeight: 500, color: "var(--t2)" }}
            >
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
              {unit && (
                <small
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--t2)",
                    marginLeft: "4px",
                  }}
                >
                  {unit}
                </small>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Month bar ── */}
      <div className="month-bar">
        <span
          style={{ fontSize: "13px", fontWeight: 600, marginRight: "6px" }}
        >
          {activeYearNum}
        </span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--t3)" }}
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        {months
          .filter((m) => m.year === activeYearNum)
          .map((m) => (
            <Link
              key={m.key}
              href={`/dashboard/clients/${clientId}?month=${m.key}`}
              style={{ textDecoration: "none" }}
            >
              <span
                style={{
                  position: "relative",
                  fontSize: "13px",
                  fontWeight: 500,
                  color:
                    m.key === activeMonthKey ? "#fff" : "var(--t2)",
                  background:
                    m.key === activeMonthKey ? "var(--pine)" : "transparent",
                  borderRadius: "8px",
                  padding: "7px 14px",
                  border: "1px solid transparent",
                  display: "inline-block",
                }}
              >
                {m.label}
                {m.hasIncident && (
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      transform: "translateX(-50%)",
                      bottom: "2px",
                      width: "4px",
                      height: "4px",
                      borderRadius: "50%",
                      background:
                        m.key === activeMonthKey
                          ? "rgba(255,255,255,.7)"
                          : "var(--amber)",
                      display: "block",
                    }}
                  />
                )}
              </span>
            </Link>
          ))}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--t3)" }}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid-2col-ledger">
        {/* ── Left: Register ── */}
        <Card>
          <CardHeader
            title={`Register · ${activeMonthLabel}`}
            count={totalEntries}
            right="Newest first"
          />

          {activeMonthIncidents.length === 0 && canaryEvents.length === 0 ? (
            <>
              {/* Quiet-run row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 1fr auto 24px",
                  gap: "14px",
                  alignItems: "center",
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  style={{ fontSize: "12px", color: "var(--t3)", lineHeight: 1.5 }}
                >
                  —
                </span>
                <div>
                  <span
                    style={{
                      fontSize: "14.5px",
                      fontWeight: 500,
                      color: "var(--t2)",
                    }}
                  >
                    Quiet run · {activeMonthLabel}
                  </span>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--t2)",
                      marginTop: "2px",
                    }}
                  >
                    {receipts30d} receipts · 0 outstanding
                  </div>
                </div>
                <Badge kind="quiet" label="Quiet" />
                <span />
              </div>
            </>
          ) : (
            <>
              {/* Incident entries */}
              {activeMonthIncidents.map((inc, i) => {
                const title = incidentTitle(
                  inc.source,
                  inc.openedAt,
                  inc.resolvedAt ?? null,
                );
                const isOpen = inc.status === "open";
                const s = isOpen
                  ? `Open · ${Math.floor((Date.now() - inc.openedAt.getTime()) / 60_000)} min`
                  : `Resolved · ${formatTime(inc.resolvedAt!, tz)}`;
                const kind = isOpen ? "open" : "resolved";

                return (
                  <Link
                    key={inc.id}
                    href={`/dashboard/incidents/${inc.id}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "70px 1fr auto 24px",
                        gap: "14px",
                        alignItems: "center",
                        padding: "14px 16px",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--t3)",
                          lineHeight: 1.5,
                        }}
                      >
                        {formatDate(inc.openedAt, tz)}
                        <br />
                        {formatTime(inc.openedAt, tz)}
                      </span>
                      <div>
                        <span
                          style={{ fontSize: "14.5px", fontWeight: 600 }}
                        >
                          {title}
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "11px",
                            fontWeight: 500,
                            color: "var(--t2)",
                            background: "var(--subtle)",
                            border: "1px solid var(--border)",
                            borderRadius: "5px",
                            padding: "1px 7px",
                            marginLeft: "8px",
                            verticalAlign: "1px",
                          }}
                        >
                          {inc.workflow.name}
                        </span>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--t2)",
                            marginTop: "2px",
                          }}
                        >
                          {inc.sendsDue !== null && inc.sendsDue > 0 ? (
                            <>
                              <strong
                                style={{
                                  color: "var(--t1)",
                                  fontWeight: 600,
                                }}
                              >
                                {inc.sendsArrived ?? 0} of {inc.sendsDue}{" "}
                                received
                              </strong>
                              {inc.resolvedAt && (
                                <>
                                  {" "}
                                  · caught in{" "}
                                  {Math.round(
                                    (inc.resolvedAt.getTime() -
                                      inc.openedAt.getTime()) /
                                      60_000,
                                  )}
                                  m
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              {inc.source === "explicit_fail"
                                ? "Failure reported"
                                : "Missed check-in"}
                            </>
                          )}
                          {inc.notes.length > 0 && (
                            <span style={{ fontStyle: "italic" }}>
                              {" "}
                              · &ldquo;{inc.notes[0].text}&rdquo;
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge kind={kind} label={s} />
                      <span style={{ color: "var(--t3)" }}>
                        <ChevronRight />
                      </span>
                    </div>
                  </Link>
                );
              })}

              {/* Canary event rows */}
              {canaryEvents.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px 1fr auto 24px",
                    gap: "14px",
                    alignItems: "center",
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--t3)",
                      lineHeight: 1.5,
                    }}
                  >
                    {formatDate(ev.receivedAt, tz)}
                    <br />
                    {formatTime(ev.receivedAt, tz)}
                  </span>
                  <div>
                    <span
                      style={{
                        fontSize: "14.5px",
                        fontWeight: 500,
                      }}
                    >
                      Unexpected send caught by the canary
                    </span>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "var(--t2)",
                        background: "var(--subtle)",
                        border: "1px solid var(--border)",
                        borderRadius: "5px",
                        padding: "1px 7px",
                        marginLeft: "8px",
                        verticalAlign: "1px",
                      }}
                    >
                      {ev.workflow.name}
                    </span>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--t2)",
                        marginTop: "2px",
                      }}
                    >
                      Outside the schedule
                    </div>
                  </div>
                  <Badge kind="unmatched" label="Unmatched" />
                  <span style={{ color: "var(--t3)" }}>
                    <ChevronRight />
                  </span>
                </div>
              ))}

              {/* All-clear update rows */}
              {allClearUpdates.map((ac) => (
                <Link
                  key={ac.id}
                  href={`/u/${ac.publicSlug}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "70px 1fr auto 24px",
                      gap: "14px",
                      alignItems: "center",
                      padding: "14px 16px",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--t3)",
                        lineHeight: 1.5,
                      }}
                    >
                      {formatDate(ac.createdAt, tz)}
                      <br />
                      {formatTime(ac.createdAt, tz)}
                    </span>
                    <div>
                      <span style={{ fontSize: "14.5px", fontWeight: 500 }}>
                        All-clear sent
                      </span>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--t3)",
                          marginTop: "2px",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        /u/{ac.publicSlug}
                      </div>
                    </div>
                    <Badge kind="quiet" label="All-clear" />
                    <span style={{ color: "var(--t3)" }}>
                      <ChevronRight />
                    </span>
                  </div>
                </Link>
              ))}

              {/* Quiet-run row if no incidents but canary events exist */}
              {activeMonthIncidents.length === 0 && canaryEvents.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px 1fr auto 24px",
                    gap: "14px",
                    alignItems: "center",
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--t3)",
                    }}
                  >
                    —
                  </span>
                  <div>
                    <span
                      style={{
                        fontSize: "14.5px",
                        fontWeight: 500,
                        color: "var(--t2)",
                      }}
                    >
                      Quiet run · {activeMonthLabel}
                    </span>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--t2)",
                        marginTop: "2px",
                      }}
                    >
                      {receipts30d} receipts · 0 outstanding
                    </div>
                  </div>
                  <Badge kind="quiet" label="Quiet" />
                  <span />
                </div>
              )}
            </>
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

        {/* ── Right: Workflows + Record ── */}
        <div>
          <Card>
            <CardHeader
              title="Workflows"
              count={client.workflows.length}
            />
            {client.workflows.length === 0 ? (
              <div
                style={{
                  padding: "14px 16px",
                  fontSize: "13px",
                  color: "var(--t2)",
                }}
              >
                No workflows yet.
              </div>
            ) : (
              workflowRows.map((wf, i) => (
                <Link
                  key={wf.id}
                  href={`/dashboard/clients/${clientId}/workflows/${wf.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto 20px",
                      gap: "12px",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom:
                        i < workflowRows.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{wf.name}</span>
                    <Badge kind={wf.statusKind} label={wf.statusChip} />
                    <span
                      style={{
                        fontSize: "12px",
                        color: wf.canaryOn
                          ? "var(--green-tx)"
                          : "var(--t3)",
                        fontWeight: wf.canaryOn ? 500 : 400,
                      }}
                    >
                      canary {wf.canaryOn ? "on" : "off"}
                    </span>
                    <span style={{ color: "var(--t3)" }}>
                      <ChevronRight />
                    </span>
                  </div>
                </Link>
              ))
            )}
          </Card>

          <Card style={{ marginTop: "14px" }}>
            <CardHeader title="The record" />
            <div
              style={{
                padding: "13px 16px",
                fontSize: "13px",
                color: "var(--t2)",
                lineHeight: 1.8,
              }}
            >
              Kept since {keptSince} · retained 12 months
              <br />
              Entries are appended, never edited.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
