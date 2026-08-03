import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { deriveStatus } from "@/lib/status";
import { Chip } from "@/components/ui/Chip";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { AddWorkflowForm } from "@/app/dashboard/add-workflow-form";

/**
 * Client ledger — matches euclio-client-view.html.
 *
 * Layout:
 *   - Header: client name + "Ledger · kept since <date>" + search/filter/Share receipt
 *   - Figures row: receipts 30d / check-ins 30d / incidents 30d / longest quiet run
 *   - Month bar: year + prev/next + month pills (amber tick on months with incidents)
 *   - Two-column grid:
 *       Left: Register panel (compact incident entries + quiet-run rows + canary event rows)
 *       Right: Workflows panel (chip + canary on/off + ▶) + Record panel
 *
 * Ownership: all queries scoped by accountId inside the where clause.
 */

// ── helpers ───────────────────────────────────────────────────────────────────

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
  })
    .format(date)
    .replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase());
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase());
}

function durationMinutes(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

function formatDuration(from: Date, to: Date): string {
  const total = durationMinutes(from, to);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function incidentTitle(source: string, openedAt: Date, resolvedAt: Date | null): string {
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
  }).format(date); // e.g. "06/2026"
}

function getMonthLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
  }).format(date); // e.g. "Jun"
}

// ── page ──────────────────────────────────────────────────────────────────────

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

  // Ownership-scoped client fetch
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

  // All incidents for this client (for register + month bar)
  const allIncidents = await prisma.incident.findMany({
    where: { workflow: { clientId, client: { accountId: account.id } } },
    orderBy: { openedAt: "desc" },
    select: {
      id: true,
      source: true,
      status: true,
      openedAt: true,
      resolvedAt: true,
      errorText: true,
      sendsDue: true,
      sendsArrived: true,
      notes: {
        orderBy: { createdAt: "asc" },
        select: { id: true, text: true },
      },
      workflow: {
        select: { id: true, name: true },
      },
    },
  });

  // Canary receipts for this client (30d)
  const receipts30d = await prisma.canaryReceipt.count({
    where: {
      workflow: { clientId, client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  // Check-ins (pings) 30d
  const checkins30d = await prisma.ping.count({
    where: {
      workflow: { clientId, client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  // Incidents 30d
  const incidents30d = allIncidents.filter(
    (i) => i.openedAt >= thirtyDaysAgo,
  ).length;

  // Longest quiet run (days between incidents, or since creation)
  let longestQuietDays = 0;
  if (allIncidents.length === 0) {
    longestQuietDays = Math.floor(
      (Date.now() - client.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    );
  } else {
    const sorted = [...allIncidents].sort(
      (a, b) => a.openedAt.getTime() - b.openedAt.getTime(),
    );
    // Gap from creation to first incident
    const firstGap = Math.floor(
      (sorted[0].openedAt.getTime() - client.createdAt.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    longestQuietDays = Math.max(longestQuietDays, firstGap);
    // Gaps between incidents
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].resolvedAt ?? sorted[i - 1].openedAt;
      const gap = Math.floor(
        (sorted[i].openedAt.getTime() - prev.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      longestQuietDays = Math.max(longestQuietDays, gap);
    }
    // Gap from last incident to now
    const last = sorted[sorted.length - 1];
    const lastEnd = last.resolvedAt ?? last.openedAt;
    const tailGap = Math.floor(
      (Date.now() - lastEnd.getTime()) / (24 * 60 * 60 * 1000),
    );
    longestQuietDays = Math.max(longestQuietDays, tailGap);
  }

  // ── Month bar ─────────────────────────────────────────────────────────────

  // Build list of months from client creation to now
  const now = new Date();
  const months: { key: string; label: string; year: number; hasIncident: boolean }[] = [];
  const cursor = new Date(client.createdAt);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= now) {
    const key = getMonthKey(cursor, tz);
    const label = getMonthLabel(cursor, tz);
    const year = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
    })
      .format(cursor)
      .trim();
    const hasIncident = allIncidents.some(
      (i) => getMonthKey(i.openedAt, tz) === key,
    );
    months.push({ key, label, year: parseInt(year), hasIncident });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Active month: from searchParams or default to current month
  const currentMonthKey = getMonthKey(now, tz);
  const activeMonthKey = sp.month ?? currentMonthKey;

  // Incidents in active month
  const activeMonthIncidents = allIncidents.filter(
    (i) => getMonthKey(i.openedAt, tz) === activeMonthKey,
  );

  // Canary events in active month (unexpected receipts)
  const activeMonthStart = new Date(
    parseInt(activeMonthKey.split("/")[1]),
    parseInt(activeMonthKey.split("/")[0]) - 1,
    1,
  );
  const activeMonthEnd = new Date(activeMonthStart);
  activeMonthEnd.setMonth(activeMonthEnd.getMonth() + 1);

  const canaryEvents = await prisma.canaryReceipt.findMany({
    where: {
      workflow: { clientId, client: { accountId: account.id } },
      receivedAt: { gte: activeMonthStart, lt: activeMonthEnd },
      expectationId: null, // unmatched = unexpected
    },
    orderBy: { receivedAt: "desc" },
    take: 10,
    select: {
      id: true,
      receivedAt: true,
      workflow: { select: { id: true, name: true } },
    },
  });

  // ── Workflow status chips ─────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  const keptSince = formatDate(client.createdAt, tz);

  // Unique years in month bar
  const years = [...new Set(months.map((m) => m.year))];
  const activeYear = months.find((m) => m.key === activeMonthKey)?.year ?? years[years.length - 1];

  return (
    <div style={{ padding: "28px 44px 0", minWidth: 0 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "24px",
              fontWeight: 500,
            }}
          >
            {client.name}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9.5px",
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              marginTop: "4px",
            }}
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
          <AddWorkflowForm clientId={client.id} />
        </div>
      </div>

      {/* ── Figures ── */}
      <div
        style={{
          display: "flex",
          gap: "34px",
          margin: "18px 0 0",
          paddingBottom: "14px",
          borderBottom: "1px solid var(--hair)",
        }}
      >
        {[
          { v: receipts30d.toLocaleString(), k: "receipts · 30d" },
          { v: checkins30d.toLocaleString(), k: "check-ins · 30d" },
          { v: incidents30d, k: `incident${incidents30d !== 1 ? "s" : ""} · 30d` },
          {
            v: longestQuietDays > 0 ? `${longestQuietDays} days` : "—",
            k: "longest quiet run",
          },
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

      {/* ── Month bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "16px 0 4px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: 600,
            marginRight: "8px",
          }}
        >
          {activeYear}
        </span>
        {months
          .filter((m) => m.year === activeYear)
          .map((m) => (
            <Link
              key={m.key}
              href={`/dashboard/clients/${clientId}?month=${m.key}`}
              style={{ textDecoration: "none" }}
            >
              <span
                style={{
                  position: "relative",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color:
                    m.key === activeMonthKey
                      ? "var(--rail-text)"
                      : "var(--ink-2)",
                  background:
                    m.key === activeMonthKey ? "var(--pine)" : "transparent",
                  borderRadius: "999px",
                  padding: "6px 13px",
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
                      bottom: m.key === activeMonthKey ? "3px" : "-1px",
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: "var(--amber)",
                      display: "block",
                    }}
                  />
                )}
              </span>
            </Link>
          ))}
      </div>

      {/* ── Two-column grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.58fr 1fr",
          gap: "14px",
          marginTop: "14px",
          paddingBottom: "40px",
        }}
      >
        {/* ── Left: Register ── */}
        <Panel>
          <PanelHeader
            label="Register"
            count={`${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long" }).format(activeMonthStart)}`}
            right={`${activeMonthIncidents.length + canaryEvents.length} entries · newest first`}
          />

          <div style={{ padding: "4px 12px 6px" }}>
            {activeMonthIncidents.length === 0 && canaryEvents.length === 0 ? (
              <div
                style={{
                  padding: "16px 4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--ink-2)",
                }}
              >
                Quiet run — no incidents this month.
              </div>
            ) : (
              <>
                {/* Incident entries */}
                {activeMonthIncidents.map((inc) => {
                  const title = incidentTitle(inc.source, inc.openedAt, inc.resolvedAt ?? null);
                  const isOpen = inc.status === "open";
                  const statusKind = isOpen ? "open" : "resolved";
                  const statusChip = isOpen
                    ? `OPEN · ${Math.floor((Date.now() - inc.openedAt.getTime()) / 60_000)} MIN`
                    : `RESOLVED · ${formatTime(inc.resolvedAt!, tz)}`;

                  return (
                    <Link
                      key={inc.id}
                      href={`/dashboard/incidents/${inc.id}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "66px 1fr auto 20px",
                          gap: "16px",
                          alignItems: "center",
                          cursor: "pointer",
                          background: "var(--lift)",
                          border: "1px solid var(--hair-2)",
                          borderLeft: "3px solid var(--amber)",
                          borderRadius: "0 10px 10px 0",
                          boxShadow: "0 10px 32px -20px rgba(30,54,43,.28)",
                          padding: "15px 16px 15px 14px",
                          margin: "8px 0",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            color: "var(--ink-2)",
                          }}
                        >
                          {formatDate(inc.openedAt, tz)}
                          <br />
                          {formatTime(inc.openedAt, tz)}
                        </span>
                        <div>
                          <span
                            style={{
                              fontFamily: "var(--font-serif)",
                              fontSize: "16px",
                              fontWeight: 500,
                            }}
                          >
                            {title}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "8.5px",
                              letterSpacing: ".06em",
                              textTransform: "uppercase",
                              color: "var(--ink-2)",
                              border: "1px solid var(--hair)",
                              borderRadius: "4px",
                              padding: "2px 6px",
                              marginLeft: "8px",
                              position: "relative",
                              top: "-2px",
                            }}
                          >
                            {inc.workflow.name}
                          </span>
                          <div
                            style={{
                              fontSize: "12.5px",
                              color: "var(--ink-2)",
                              marginTop: "3px",
                            }}
                          >
                            {inc.sendsDue !== null && inc.sendsDue > 0 ? (
                              <>
                                <strong style={{ color: "var(--ink)", fontWeight: 500 }}>
                                  {inc.sendsArrived ?? 0} of {inc.sendsDue} received
                                </strong>
                                {inc.resolvedAt && (
                                  <> · caught in {formatDuration(inc.openedAt, inc.resolvedAt)}</>
                                )}
                              </>
                            ) : (
                              <>
                                {inc.source === "explicit_fail"
                                  ? "Failure reported"
                                  : "Missed check-in"}
                                {inc.resolvedAt && (
                                  <> · {formatDuration(inc.openedAt, inc.resolvedAt)} pause</>
                                )}
                              </>
                            )}
                            {inc.notes.length > 0 && (
                              <span style={{ fontStyle: "italic" }}>
                                {" "}· &ldquo;{inc.notes[0].text}&rdquo;
                              </span>
                            )}
                          </div>
                        </div>
                        <span>
                          <Chip kind={statusKind} label={statusChip} />
                        </span>
                        <span
                          style={{
                            color: "var(--ink-2)",
                            fontSize: "11px",
                            textAlign: "right",
                          }}
                        >
                          ▶
                        </span>
                      </div>
                    </Link>
                  );
                })}

                {/* Canary event rows (unexpected sends) */}
                {canaryEvents.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "66px 1fr auto",
                      gap: "16px",
                      alignItems: "baseline",
                      padding: "13px 16px 13px 17px",
                      borderBottom: "1px solid var(--hair-2)",
                      fontSize: "13px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--ink-2)",
                      }}
                    >
                      {formatDate(ev.receivedAt, tz)}
                    </span>
                    <span style={{ color: "var(--ink-2)" }}>
                      Unexpected send caught by the canary · outside schedule
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--ink-2)",
                      }}
                    >
                      {ev.workflow.name} · ▶
                    </span>
                  </div>
                ))}

                {/* Quiet-run row if no incidents but there are canary events */}
                {activeMonthIncidents.length === 0 && canaryEvents.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "66px 1fr auto",
                      gap: "16px",
                      alignItems: "baseline",
                      padding: "13px 16px 13px 17px",
                      fontSize: "13px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--ink-2)",
                      }}
                    >
                      —
                    </span>
                    <span style={{ color: "var(--ink-2)" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontStyle: "italic",
                          color: "var(--ink)",
                        }}
                      >
                        Quiet run
                      </span>{" "}
                      · no incidents this month
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--ink-2)",
                      }}
                    >
                      {receipts30d} receipts · 0 outstanding
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div
            style={{
              padding: "16px 2px",
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--ink-2)",
              paddingLeft: "16px",
            }}
          >
            Entries are appended, never edited.
          </div>
        </Panel>

        {/* ── Right: Workflows + Record ── */}
        <div>
          <Panel>
            <PanelHeader label="Workflows" count={client.workflows.length} />
            {client.workflows.length === 0 ? (
              <div
                style={{
                  padding: "14px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--ink-2)",
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
                      gridTemplateColumns: "1fr auto auto 14px",
                      gap: "12px",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom:
                        i < workflowRows.length - 1
                          ? "1px solid var(--hair-2)"
                          : "none",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{wf.name}</span>
                    <Chip kind={wf.statusKind} label={wf.statusChip} />
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        color: wf.canaryOn ? "var(--green)" : "var(--ink-2)",
                      }}
                    >
                      canary {wf.canaryOn ? "on" : "off"}
                    </span>
                    <span
                      style={{
                        color: "var(--ink-2)",
                        fontSize: "10px",
                      }}
                    >
                      ▶
                    </span>
                  </div>
                </Link>
              ))
            )}
          </Panel>

          <Panel style={{ marginTop: "14px" }}>
            <PanelHeader label="The record" />
            <div
              style={{
                padding: "12px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "9.5px",
                color: "var(--ink-2)",
                lineHeight: 2,
              }}
            >
              Kept since {keptSince} · retained 12 months
              <br />
              Entries are appended, never edited.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
