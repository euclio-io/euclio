import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { deriveStatus } from "@/lib/status";
import { Chip } from "@/components/ui/Chip";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { ImpactStrip } from "@/components/ui/ImpactStrip";

/**
 * Canary view — per-workflow canary sensor page.
 * Matches euclio-canary-view.html.
 *
 * Shows:
 *   - Breadcrumb + workflow name + status chip
 *   - Config row: canary address + schedule rules
 *   - ImpactStrip: streak (consecutive matched expectations) as hero
 *   - Receipts log (recent 30 receipts)
 *   - Daily register (receipts grouped by day)
 *   - Incidents list (incidents for this workflow)
 *
 * Ownership: all queries scoped by accountId inside the where clause.
 */

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

function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  }).format(date);
}

export default async function CanaryPage({
  params,
}: {
  params: Promise<{ id: string; wfId: string }>;
}) {
  const { id: clientId, wfId } = await params;

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();
  const tz = account.timezone ?? "UTC";
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Ownership-scoped workflow fetch
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: wfId,
      client: { id: clientId, accountId: account.id },
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      canaryAddress: true,
      client: { select: { id: true, name: true } },
      expectations: {
        where: { active: true },
        select: { id: true, rule: true, windowMins: true },
      },
      incidents: {
        orderBy: { openedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          openedAt: true,
          resolvedAt: true,
        },
      },
    },
  });

  if (!workflow || !workflow.canaryAddress) notFound();

  // Status chip
  const inc = workflow.incidents[0];
  const hasOpen = inc?.status === "open";
  const statusResult = deriveStatus({
    hasOpenIncident: hasOpen,
    openedAt: hasOpen ? inc?.openedAt : undefined,
    lastResolvedAt: !hasOpen && inc?.resolvedAt ? inc.resolvedAt : undefined,
    createdAt: workflow.createdAt,
    timezone: tz,
  });

  // Recent receipts (30d)
  const receipts = await prisma.canaryReceipt.findMany({
    where: {
      workflowId: wfId,
      workflow: { client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { receivedAt: "desc" },
    take: 30,
    select: {
      id: true,
      receivedAt: true,
      fromAddr: true,
      expectationId: true,
    },
  });

  // Streak: consecutive matched receipts from most recent
  let streak = 0;
  for (const r of receipts) {
    if (r.expectationId) streak++;
    else break;
  }

  // Total receipts 30d
  const totalReceipts30d = await prisma.canaryReceipt.count({
    where: {
      workflowId: wfId,
      workflow: { client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  const matchedReceipts30d = await prisma.canaryReceipt.count({
    where: {
      workflowId: wfId,
      workflow: { client: { accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
      expectationId: { not: null },
    },
  });

  const unexpectedReceipts30d = totalReceipts30d - matchedReceipts30d;

  // Incidents for this workflow
  const incidents = await prisma.incident.findMany({
    where: {
      workflowId: wfId,
      workflow: { client: { accountId: account.id } },
    },
    orderBy: { openedAt: "desc" },
    take: 10,
    select: {
      id: true,
      source: true,
      status: true,
      openedAt: true,
      resolvedAt: true,
      sendsDue: true,
      sendsArrived: true,
    },
  });

  // Group receipts by day for daily register
  const byDay = new Map<string, typeof receipts>();
  for (const r of receipts) {
    const key = formatDate(r.receivedAt, tz);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r);
  }
  const dailyEntries = [...byDay.entries()].slice(0, 7);

  return (
    <div style={{ padding: "24px 40px 0", minWidth: 0 }}>
      {/* Breadcrumb */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9.5px",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--ink-2)",
        }}
      >
        <Link
          href={`/dashboard/clients/${clientId}`}
          style={{ color: "var(--ink-2)", textDecoration: "none" }}
        >
          {workflow.client.name}
        </Link>
        {" / "}
        <Link
          href={`/dashboard/clients/${clientId}/workflows/${wfId}`}
          style={{ color: "var(--ink-2)", textDecoration: "none" }}
        >
          {workflow.name}
        </Link>
        {" / "}
        Canary
      </div>

      {/* Head */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "14px",
          marginTop: "7px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "23px",
            fontWeight: 500,
          }}
        >
          {workflow.name}
        </span>
        <Chip kind={statusResult.kind} label={statusResult.chip} />
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: "16px",
            alignItems: "baseline",
          }}
        >
          <Link
            href={`/dashboard/clients/${clientId}/workflows/${wfId}`}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9.5px",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--ink)",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
              textDecorationColor: "var(--hair)",
            }}
          >
            Setup
          </Link>
        </div>
      </div>

      {/* Config row */}
      <Panel style={{ marginTop: "14px" }}>
        <div
          style={{
            display: "flex",
            gap: "30px",
            padding: "11px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            alignItems: "baseline",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "8.5px",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
                marginRight: "8px",
              }}
            >
              Address
            </span>
            {workflow.canaryAddress}
          </div>
          {workflow.expectations.map((exp) => (
            <div key={exp.id}>
              <span
                style={{
                  fontSize: "8.5px",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--ink-2)",
                  marginRight: "8px",
                }}
              >
                Schedule
              </span>
              {exp.rule}
              <span
                style={{
                  fontSize: "9px",
                  color: "var(--ink-2)",
                  marginLeft: "8px",
                }}
              >
                ±{exp.windowMins}m window
              </span>
            </div>
          ))}
        </div>
      </Panel>

      {/* ImpactStrip — streak as hero */}
      <Panel loud style={{ marginTop: "14px" }}>
        <ImpactStrip
          heroValue={String(streak)}
          heroLabel="streak"
          heroColor="green"
          stats={[
            { value: String(totalReceipts30d), label: "receipts · 30d" },
            { value: String(matchedReceipts30d), label: "matched · 30d" },
            {
              value: String(unexpectedReceipts30d),
              label: "unexpected · 30d",
            },
          ]}
        />
      </Panel>

      {/* Two-column grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.22fr 1fr",
          gap: "14px",
          marginTop: "14px",
          paddingBottom: "40px",
        }}
      >
        {/* Receipts log */}
        <Panel>
          <PanelHeader
            label="Receipts"
            count={receipts.length}
            right="30d"
            collapse="open"
          />
          {receipts.length === 0 ? (
            <div
              style={{
                padding: "12px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--ink-2)",
              }}
            >
              No receipts yet.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px 84px 56px 1fr 14px",
                  gap: "10px",
                  padding: "8px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--ink-2)",
                  borderBottom: "1px solid var(--hair-2)",
                }}
              >
                <span>date</span>
                <span>time</span>
                <span>match</span>
                <span>from</span>
                <span />
              </div>
              {receipts.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "64px 84px 56px 1fr 14px",
                    gap: "10px",
                    padding: "8px 16px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10.5px",
                    borderBottom: "1px solid var(--hair-2)",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ color: "var(--ink-2)" }}>
                    {formatDate(r.receivedAt, tz)}
                  </span>
                  <span>{formatTime(r.receivedAt, tz)}</span>
                  <span
                    style={{
                      color: r.expectationId
                        ? "var(--green)"
                        : "var(--amber-deep)",
                      fontWeight: 600,
                    }}
                  >
                    {r.expectationId ? "✓" : "—"}
                  </span>
                  <span
                    style={{
                      color: "var(--ink-2)",
                      fontSize: "9.5px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.fromAddr ?? "—"}
                  </span>
                  <span style={{ color: "var(--ink-2)", fontSize: "9px" }}>
                    ▶
                  </span>
                </div>
              ))}
            </>
          )}
        </Panel>

        <div>
          {/* Daily register */}
          <Panel>
            <PanelHeader label="Daily register" right="7 days" />
            {dailyEntries.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--ink-2)",
                }}
              >
                No data yet.
              </div>
            ) : (
              dailyEntries.map(([day, dayReceipts]) => {
                const matched = dayReceipts.filter((r) => r.expectationId).length;
                const total = dayReceipts.length;
                return (
                  <div
                    key={day}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "78px 1fr auto",
                      gap: "12px",
                      padding: "8px 16px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "10.5px",
                      borderBottom: "1px solid var(--hair-2)",
                      alignItems: "baseline",
                    }}
                  >
                    <span style={{ color: "var(--ink-2)" }}>{day}</span>
                    <span>{total} received</span>
                    <span
                      style={{
                        color:
                          matched === total
                            ? "var(--green)"
                            : "var(--amber-deep)",
                        fontWeight: 600,
                      }}
                    >
                      {matched}/{total}
                    </span>
                  </div>
                );
              })
            )}
          </Panel>

          {/* Incidents */}
          <Panel style={{ marginTop: "14px" }}>
            <PanelHeader label="Incidents" count={incidents.length} />
            {incidents.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--ink-2)",
                }}
              >
                No incidents.
              </div>
            ) : (
              incidents.map((inc, i) => (
                <Link
                  key={inc.id}
                  href={`/dashboard/incidents/${inc.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "58px 1fr auto",
                      gap: "12px",
                      padding: "9px 16px",
                      borderBottom:
                        i < incidents.length - 1
                          ? "1px solid var(--hair-2)"
                          : "none",
                      fontSize: "12.5px",
                      alignItems: "baseline",
                      cursor: "pointer",
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
                    </span>
                    <span>
                      {inc.source === "explicit_fail"
                        ? "Failure reported"
                        : "Missed check-in"}
                      {inc.sendsDue !== null && inc.sendsDue > 0 && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "9.5px",
                            color: "var(--ink-2)",
                            marginLeft: "6px",
                          }}
                        >
                          · {inc.sendsArrived ?? 0}/{inc.sendsDue} received
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9.5px",
                        color: "var(--ink-2)",
                      }}
                    >
                      {inc.status === "open" ? "open" : "resolved"}
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
