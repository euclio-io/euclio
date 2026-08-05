import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { deriveStatus } from "@/lib/status";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, ChevronRight } from "@/components/ui/Card";
import { ImpactStrip } from "@/components/ui/ImpactStrip";

/**
 * Canary view — per-workflow canary sensor page.
 * Matches euclio-canary-view.html (v6 design system).
 *
 * Shows:
 *   - Breadcrumb + workflow name + status badge
 *   - Config kv rows: canary address + schedule rules
 *   - ImpactStrip card: streak (consecutive matched) as hero
 *   - Receipts log card (recent 30 receipts)
 *   - Daily register card (receipts grouped by day)
 *   - Incidents card (incidents for this workflow)
 *
 * Ownership: all queries scoped by accountId inside the where clause.
 */

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
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

  const inc = workflow.incidents[0];
  const hasOpen = inc?.status === "open";
  const statusResult = deriveStatus({
    hasOpenIncident: hasOpen,
    openedAt: hasOpen ? inc?.openedAt : undefined,
    lastResolvedAt: !hasOpen && inc?.resolvedAt ? inc.resolvedAt : undefined,
    createdAt: workflow.createdAt,
    timezone: tz,
  });

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

  let streak = 0;
  for (const r of receipts) {
    if (r.expectationId) streak++;
    else break;
  }

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

  const byDay = new Map<string, typeof receipts>();
  for (const r of receipts) {
    const key = formatDate(r.receivedAt, tz);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r);
  }
  const dailyEntries = [...byDay.entries()].slice(0, 7);

  return (
    <div className="page-pad">
      {/* ── Breadcrumb ── */}
      <div
        style={{
          fontSize: "13px",
          color: "var(--t3)",
          display: "flex",
          gap: "6px",
          alignItems: "center",
        }}
      >
        <Link
          href={`/dashboard/clients/${clientId}`}
          style={{ color: "var(--t2)", fontWeight: 500, textDecoration: "none" }}
        >
          {workflow.client.name}
        </Link>
        <span>/</span>
        <Link
          href={`/dashboard/clients/${clientId}/workflows/${wfId}`}
          style={{ color: "var(--t2)", fontWeight: 500, textDecoration: "none" }}
        >
          {workflow.name}
        </Link>
        <span>/</span>
        <span>Canary</span>
      </div>

      {/* ── Head ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
          marginTop: "6px",
        }}
      >
        <span
          style={{ fontSize: "20px", fontWeight: 600, letterSpacing: "-.01em" }}
        >
          {workflow.name}
        </span>
        <span style={{ position: "relative", top: "2px" }}>
          <Badge kind={statusResult.kind} label={statusResult.chip} />
        </span>
        <div style={{ marginLeft: "auto" }}>
          <Link
            href={`/dashboard/clients/${clientId}/workflows/${wfId}`}
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--pine)",
              textDecoration: "none",
            }}
          >
            Setup →
          </Link>
        </div>
      </div>

      {/* ── Config card ── */}
      <Card style={{ marginTop: "16px" }}>
        {[
          { k: "Silent recipient", v: workflow.canaryAddress!, mono: true },
          { k: "Stores", v: "Arrival times only", mono: false },
          ...workflow.expectations.map((e) => ({
            k: "Expected",
            v: `${e.rule} · window ${e.windowMins} min`,
            mono: false,
          })),
        ].map(({ k, v, mono }, i, arr) => (
          <div
            key={k + i}
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              gap: "12px",
              padding: "11px 16px",
              borderBottom:
                i < arr.length - 1 ? "1px solid var(--border)" : "none",
              fontSize: "13.5px",
              alignItems: "baseline",
            }}
          >
            <span
              style={{ color: "var(--t2)", fontWeight: 500, fontSize: "13px" }}
            >
              {k}
            </span>
            <span
              style={{
                fontFamily: mono ? "var(--mono)" : undefined,
                fontSize: mono ? "12px" : "13.5px",
                color: "var(--t1)",
                wordBreak: "break-all",
              }}
            >
              {v}
            </span>
          </div>
        ))}
      </Card>

      {/* ── ImpactStrip card ── */}
      <Card style={{ marginTop: "14px" }}>
        <ImpactStrip
          heroValue={String(streak)}
          heroLabel="Streak"
          heroColor="green"
          stats={[
            { value: String(totalReceipts30d), label: "Receipts · 30d" },
            { value: String(matchedReceipts30d), label: "Matched · 30d" },
            { value: String(unexpectedReceipts30d), label: "Unexpected · 30d" },
          ]}
        />
      </Card>

      {/* ── Two-column grid ── */}
      <div className="grid-2col-canary" style={{ marginTop: "14px" }}>
        {/* Receipts log */}
        <Card>
          <CardHeader
            title="Receipts"
            count={receipts.length}
            right="30d"
            collapse="open"
          />
          {receipts.length === 0 ? (
            <div
              style={{
                padding: "12px 16px",
                fontSize: "13px",
                color: "var(--t2)",
              }}
            >
              No receipts yet.
            </div>
          ) : (
            <>
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px 84px 56px 1fr 14px",
                  gap: "10px",
                  padding: "9px 16px",
                  background: "var(--subtle)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {["Date", "Time", "Match", "From", ""].map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--t3)",
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {receipts.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "64px 84px 56px 1fr 14px",
                    gap: "10px",
                    padding: "9px 16px",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "13px",
                    alignItems: "baseline",
                    fontFamily: "var(--mono)",
                  }}
                >
                  <span style={{ color: "var(--t3)" }}>
                    {formatDate(r.receivedAt, tz)}
                  </span>
                  <span>{formatTime(r.receivedAt, tz)}</span>
                  <span
                    style={{
                      color: r.expectationId
                        ? "var(--green-tx)"
                        : "var(--amber-tx)",
                      fontWeight: 600,
                    }}
                  >
                    {r.expectationId ? "✓" : "—"}
                  </span>
                  <span
                    style={{
                      color: "var(--t3)",
                      fontSize: "11px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.fromAddr ?? "—"}
                  </span>
                  <span style={{ color: "var(--t3)" }}>
                    <ChevronRight />
                  </span>
                </div>
              ))}
            </>
          )}
        </Card>

        <div>
          {/* Daily register */}
          <Card>
            <CardHeader title="Daily register" right="7 days" />
            {dailyEntries.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  fontSize: "13px",
                  color: "var(--t2)",
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
                      padding: "9px 16px",
                      borderBottom: "1px solid var(--border)",
                      fontSize: "13px",
                      alignItems: "baseline",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    <span style={{ color: "var(--t3)" }}>{day}</span>
                    <span>{total} received</span>
                    <span
                      style={{
                        color:
                          matched === total
                            ? "var(--green-tx)"
                            : "var(--amber-tx)",
                        fontWeight: 600,
                      }}
                    >
                      {matched}/{total}
                    </span>
                  </div>
                );
              })
            )}
          </Card>

          {/* Incidents */}
          <Card style={{ marginTop: "14px" }}>
            <CardHeader title="Incidents" count={incidents.length} />
            {incidents.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  fontSize: "13px",
                  color: "var(--t2)",
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
                          ? "1px solid var(--border)"
                          : "none",
                      fontSize: "13px",
                      alignItems: "baseline",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: "12px",
                        color: "var(--t3)",
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
                            fontFamily: "var(--mono)",
                            fontSize: "11px",
                            color: "var(--t3)",
                            marginLeft: "6px",
                          }}
                        >
                          · {inc.sendsArrived ?? 0}/{inc.sendsDue} received
                        </span>
                      )}
                    </span>
                    <Badge
                      kind={inc.status === "open" ? "open" : "resolved"}
                      label={inc.status === "open" ? "Open" : "Resolved"}
                    />
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
