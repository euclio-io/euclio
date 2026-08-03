import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { factsForIncident } from "@/lib/facts";
import { AddWorkflowForm } from "@/app/dashboard/add-workflow-form";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  }).format(date);
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

function formatMonthYear(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "long",
  }).format(date);
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

// ── page ─────────────────────────────────────────────────────────────────────

export default async function ClientLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id: clientId } = await params;
  const account = await getOrCreateAccountForCurrentUser();
  const tz = account.timezone ?? "UTC";

  // Ownership-scoped query — tenant boundary inside the where clause.
  const client = await prisma.client.findFirst({
    where: { id: clientId, accountId: account.id, archivedAt: null },
    select: {
      id: true,
      name: true,
      timezone: true,
      workflows: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          lastPingAt: true,
          expectedIntervalMinutes: true,
          incidents: {
            where: {
              openedAt: {
                gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
              },
            },
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
                select: { id: true, text: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  });

  if (!client) notFound();

  const clientTz = client.timezone ?? tz;

  // Flatten all incidents across workflows, newest first.
  type IncidentRow = {
    id: string;
    source: string;
    status: string;
    openedAt: Date;
    resolvedAt: Date | null;
    sendsDue: number | null;
    sendsArrived: number | null;
    workflowName: string;
    workflowId: string;
    notes: { id: string; text: string; createdAt: Date }[];
  };

  const allIncidents: IncidentRow[] = client.workflows
    .flatMap((w) =>
      w.incidents.map((inc) => ({
        ...inc,
        resolvedAt: inc.resolvedAt ?? null,
        workflowName: w.name,
        workflowId: w.id,
      })),
    )
    .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());

  // Summary figures
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const incidents30d = allIncidents.filter(
    (i) => i.openedAt >= thirtyDaysAgo,
  ).length;

  const pingCount = await prisma.ping.count({
    where: {
      workflow: { client: { id: clientId, accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  // Canary receipts 30d
  const receiptCount30d = await prisma.canaryReceipt.count({
    where: {
      workflow: { client: { id: clientId, accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  // Longest quiet run
  let longestQuietDays = 0;
  if (allIncidents.length > 0) {
    const sorted = [...allIncidents].sort(
      (a, b) => a.openedAt.getTime() - b.openedAt.getTime(),
    );
    const now = new Date();
    const lastGap = Math.floor(
      (now.getTime() - sorted[sorted.length - 1].openedAt.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    longestQuietDays = lastGap;
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.floor(
        (sorted[i].openedAt.getTime() - sorted[i - 1].openedAt.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      if (gap > longestQuietDays) longestQuietDays = gap;
    }
  }

  // Group incidents by month
  type MonthGroup = { label: string; incidents: IncidentRow[] };
  const monthGroups: MonthGroup[] = [];
  for (const inc of allIncidents) {
    const label = formatMonthYear(inc.openedAt, clientTz);
    const last = monthGroups[monthGroups.length - 1];
    if (!last || last.label !== label) {
      monthGroups.push({ label, incidents: [inc] });
    } else {
      last.incidents.push(inc);
    }
  }

  const isAllGreen = incidents30d === 0;

  return (
    <div style={{ padding: "30px 44px 0", minWidth: 0 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "18px" }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "25px",
            fontWeight: 500,
            letterSpacing: "-.005em",
          }}
        >
          {client.name}
        </h1>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9.5px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
          }}
        >
          Ledger · kept 12 months
        </span>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "baseline",
            gap: "20px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px",
              color: "var(--ink-2)",
            }}
          >
            All workflows
          </span>
          <Link
            href="/dashboard"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              textDecoration: "none",
            }}
          >
            ← Clients
          </Link>
        </div>
      </div>

      {/* ── Figures ── */}
      <div
        style={{
          display: "flex",
          gap: "34px",
          margin: "22px 0 0",
          paddingBottom: "18px",
          borderBottom: "1px solid var(--hair)",
        }}
      >
        {[
          { v: receiptCount30d.toLocaleString(), k: "receipts · 30d" },
          { v: pingCount.toLocaleString(), k: "check-ins · 30d" },
          { v: incidents30d, k: "incidents · 30d" },
          {
            v: longestQuietDays > 0 ? `${longestQuietDays} days` : "—",
            k: "longest quiet run",
          },
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

      {/* ── Workflows section (setup links) ── */}
      <div style={{ margin: "20px 0 0", paddingBottom: "18px", borderBottom: "1px solid var(--hair-2)" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
            marginBottom: "8px",
          }}
        >
          Workflows
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          {client.workflows.map((w) => (
            <Link
              key={w.id}
              href={`/dashboard/clients/${clientId}/workflows/${w.id}`}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: w.status === "down" ? "var(--amber-deep)" : "var(--ink-2)",
                textDecoration: "none",
                padding: "4px 10px",
                border: "1px solid var(--hair-2)",
                borderRadius: "999px",
                background: "var(--lift)",
              }}
            >
              {w.name}
              {w.status === "down" && (
                <span style={{ marginLeft: "6px", color: "var(--amber)" }}>●</span>
              )}
              {" "}setup →
            </Link>
          ))}
          <AddWorkflowForm clientId={clientId} compact />
        </div>
      </div>

      {/* ── All-green banner ── */}
      {isAllGreen && allIncidents.length === 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            margin: "20px 0",
            padding: "12px 16px",
            border: "1px solid rgba(47,107,74,.3)",
            borderRadius: "8px",
            background: "rgba(47,107,74,.04)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--green)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              color: "var(--ink-2)",
            }}
          >
            Quiet run · {longestQuietDays > 0 ? `${longestQuietDays} days · ` : ""}
            {pingCount.toLocaleString()} check-ins
          </span>
        </div>
      )}

      {/* ── Ledger ── */}
      {allIncidents.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ink-2)",
            padding: "24px 0 40px",
          }}
        >
          No incidents on record.
        </div>
      ) : (
        <div style={{ paddingBottom: "60px" }}>
          {monthGroups.map((group) => (
            <div key={group.label}>
              {/* Month label */}
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  letterSpacing: ".14em",
                  textTransform: "uppercase",
                  color: "var(--ink-2)",
                  padding: "26px 0 6px",
                }}
              >
                {group.label}
              </div>

              {group.incidents.map((inc) => {
                const facts = factsForIncident(
                  inc.workflowName,
                  inc.source as "heartbeat" | "explicit_fail",
                  inc.openedAt,
                  inc.resolvedAt,
                  clientTz,
                );
                const title = incidentTitle(
                  inc.source,
                  inc.openedAt,
                  inc.resolvedAt,
                );
                const isOpen = inc.status === "open";

                return (
                  <div
                    key={inc.id}
                    style={{
                      background: "var(--lift)",
                      borderRadius: "10px",
                      boxShadow: "0 10px 36px -20px rgba(30,54,43,.3)",
                      border: "1px solid var(--hair-2)",
                      margin: "4px 0 8px",
                      overflow: "hidden",
                    }}
                  >
                    {/* Entry header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "14px",
                        padding: "18px 26px 14px",
                        borderBottom: "1px solid var(--hair)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          color: "var(--ink-2)",
                        }}
                      >
                        {formatDate(inc.openedAt, clientTz)}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "17px",
                          fontWeight: 500,
                        }}
                      >
                        {title}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          letterSpacing: ".08em",
                          textTransform: "uppercase",
                          color: "var(--ink-2)",
                        }}
                      >
                        {inc.workflowName}
                      </span>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          letterSpacing: ".1em",
                          textTransform: "uppercase",
                          color: isOpen ? "var(--amber-deep)" : "var(--green)",
                        }}
                      >
                        {isOpen
                          ? `Open ${formatTime(inc.openedAt, clientTz)}`
                          : inc.resolvedAt
                            ? `Resolved ${formatTime(inc.resolvedAt, clientTz)}`
                            : "Resolved"}
                      </span>
                    </div>

                    {/* Two-column grid: events + receipts */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.25fr 1fr",
                        padding: "2px 0 16px",
                      }}
                    >
                      {/* Left: events / facts */}
                      <div style={{ padding: "0 32px 0 26px" }}>
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "8.5px",
                            letterSpacing: ".12em",
                            textTransform: "uppercase",
                            color: "var(--ink-2)",
                            padding: "14px 0 7px",
                            borderBottom: "1px solid var(--hair-2)",
                          }}
                        >
                          Events
                        </div>
                        {facts.map((line, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              gap: "12px",
                              padding: "8px 0",
                              borderTop: i === 0 ? "none" : "1px solid var(--hair-2)",
                              alignItems: "baseline",
                              fontSize: "12.5px",
                              lineHeight: "1.5",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "10px",
                                color: "var(--ink-2)",
                                flexShrink: 0,
                                width: "60px",
                              }}
                            >
                              {i === 0
                                ? formatTime(inc.openedAt, clientTz)
                                : inc.resolvedAt
                                  ? formatTime(inc.resolvedAt, clientTz)
                                  : ""}
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "8.5px",
                                letterSpacing: ".06em",
                                textTransform: "uppercase",
                                flexShrink: 0,
                                width: "64px",
                                color:
                                  i === 0
                                    ? "var(--amber-deep)"
                                    : "var(--green)",
                              }}
                            >
                              {i === 0
                                ? inc.source === "explicit_fail"
                                  ? "fail ping"
                                  : "gap"
                                : "recovered"}
                            </span>
                            <span>{line}</span>
                          </div>
                        ))}
                        {/* Notes */}
                        {inc.notes.map((n) => (
                          <div
                            key={n.id}
                            style={{
                              display: "flex",
                              gap: "12px",
                              padding: "8px 0",
                              borderTop: "1px solid var(--hair-2)",
                              alignItems: "baseline",
                              fontSize: "12.5px",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "10px",
                                color: "var(--ink-2)",
                                flexShrink: 0,
                                width: "60px",
                              }}
                            >
                              {formatTime(n.createdAt, clientTz)}
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "8.5px",
                                letterSpacing: ".06em",
                                textTransform: "uppercase",
                                flexShrink: 0,
                                width: "64px",
                                color: "var(--ink-2)",
                              }}
                            >
                              resolved
                            </span>
                            <span
                              style={{
                                color: "var(--ink-2)",
                                fontStyle: "italic",
                              }}
                            >
                              &ldquo;{n.text}&rdquo;
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Right: canary receipts */}
                      <div
                        style={{
                          borderLeft: "1px solid var(--hair-2)",
                          padding: "0 26px 0 32px",
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "8.5px",
                            letterSpacing: ".12em",
                            textTransform: "uppercase",
                            color: "var(--ink-2)",
                            padding: "14px 0 7px",
                            borderBottom: "1px solid var(--hair-2)",
                          }}
                        >
                          Receipts · during the gap
                        </div>

                        {inc.sendsDue !== null && inc.sendsDue > 0 ? (
                          <>
                            <div
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "8.5px",
                                color: "var(--ink-2)",
                                opacity: 0.75,
                                padding: "6px 0 2px",
                              }}
                            >
                              {inc.sendsArrived ?? 0} of {inc.sendsDue} expected received
                            </div>
                            <div
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "10px",
                                fontWeight: 500,
                                color:
                                  inc.sendsArrived === inc.sendsDue
                                    ? "var(--green)"
                                    : "var(--amber-deep)",
                                padding: "9px 0 0",
                                borderTop: "1px solid var(--hair)",
                                marginTop: "6px",
                              }}
                            >
                              {inc.sendsArrived === inc.sendsDue
                                ? `${inc.sendsDue} expected · ${inc.sendsArrived} received · 0 outstanding`
                                : `${inc.sendsDue} expected · ${inc.sendsArrived ?? 0} received · ${inc.sendsDue - (inc.sendsArrived ?? 0)} outstanding`}
                            </div>
                          </>
                        ) : (
                          <div
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "10px",
                              color: "var(--ink-2)",
                              padding: "10px 0",
                            }}
                          >
                            {inc.sendsDue === 0
                              ? "No sends due during gap"
                              : "No canary configured"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer: summary + compose */}
                    <div
                      style={{
                        margin: "0 -1px",
                        background: "var(--paper)",
                        borderTop: "1px solid var(--hair)",
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: "26px",
                        padding: "18px 26px 20px",
                        alignItems: "start",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "13.5px",
                            lineHeight: "1.7",
                            maxWidth: "58ch",
                          }}
                        >
                          {facts.join(" ")}
                          {inc.sendsDue !== null && inc.sendsDue > 0 && (
                            <span
                              style={{
                                color:
                                  inc.sendsArrived === inc.sendsDue
                                    ? "var(--green)"
                                    : "var(--amber-deep)",
                              }}
                            >
                              {" "}
                              {inc.sendsArrived ?? 0} of {inc.sendsDue} sends verified at canary.
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            marginTop: "10px",
                            fontSize: "12px",
                            fontStyle: "italic",
                            color: "var(--amber-deep)",
                            borderBottom: "1px dashed rgba(176,133,46,.5)",
                            display: "inline-block",
                            paddingBottom: "2px",
                          }}
                        >
                          Your read — required before any client note
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "9px",
                          alignItems: "flex-end",
                          paddingTop: "8px",
                        }}
                      >
                        <Link
                          href={`/dashboard/incidents/${inc.id}`}
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            letterSpacing: ".08em",
                            textTransform: "uppercase",
                            color: "var(--ink)",
                            background: "none",
                            border: "none",
                            textDecoration: "underline",
                            textUnderlineOffset: "3px",
                            textDecorationColor: "var(--hair)",
                          }}
                        >
                          Detail →
                        </Link>
                        <Link
                          href={`/dashboard/clients/${clientId}/compose/${inc.id}`}
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
                          Compose client note
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
