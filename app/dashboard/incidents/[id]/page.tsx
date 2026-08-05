import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { factsForIncident } from "@/lib/facts";
import { deriveStatus } from "@/lib/status";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { ImpactStrip } from "@/components/ui/ImpactStrip";
import { Timeline } from "@/components/ui/Timeline";
import { SimulateFailureForm } from "@/app/dashboard/simulate-failure-form";
import { ResolveForm } from "./resolve-form";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { formatDateTimeAbsolute, formatTimeOnly } from "@/lib/time";

/**
 * Incident detail page — matches euclio-incident-view.html (v6 design system).
 *
 * Focus order (the anxious landing):
 *   1. ImpactStrip card — outstanding count (green 0 / amber >0 crisis switch)
 *   2. Events timeline card (left column) + Receipts card (right column)
 *   3. Summary card full-width — facts text + "Your read" slot + Copy summary + Compose
 *   4. Diagnostics card (collapsed by default — ONLY place errorText renders)
 *
 * Ownership: incident → workflow → client → accountId (inside the query).
 * errorText is rendered ONLY in DiagnosticsPanel — nothing composable imports it.
 * Timestamps render in the effective timezone (client.timezone ?? account.timezone ?? "UTC").
 */

function formatDuration(from: Date, to: Date): string {
  const total = Math.round((to.getTime() - from.getTime()) / 60_000);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();

  const incident = await prisma.incident.findFirst({
    where: {
      id,
      workflow: { client: { accountId: account.id } },
    },
    select: {
      id: true,
      source: true,
      status: true,
      openedAt: true,
      resolvedAt: true,
      errorText: true,
      errorRedactedByServer: true,
      sendsDue: true,
      sendsArrived: true,
      workflow: {
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          client: {
            select: {
              id: true,
              name: true,
              account: { select: { timezone: true } },
            },
          },
        },
      },
      notes: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          text: true,
          createdAt: true,
          author: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!incident) notFound();

  const timezone = incident.workflow.client.account.timezone ?? "UTC";
  const workflowName = incident.workflow.name;
  const clientName = incident.workflow.client.name;
  const clientId = incident.workflow.client.id;

  const factLines = factsForIncident(
    workflowName,
    incident.source === "explicit_fail" ? "explicit_fail" : "heartbeat",
    incident.openedAt,
    incident.resolvedAt,
    timezone,
  );

  const statusResult = deriveStatus({
    hasOpenIncident: incident.status === "open",
    openedAt: incident.status === "open" ? incident.openedAt : undefined,
    lastResolvedAt: incident.resolvedAt,
    createdAt: incident.workflow.createdAt,
    timezone,
  });

  // ImpactStrip
  const outstanding = Math.max(
    0,
    (incident.sendsDue ?? 0) - (incident.sendsArrived ?? 0),
  );
  const heroColor = outstanding === 0 ? "green" : "amber";

  const impactStats = [];
  if (incident.sendsDue !== null && incident.sendsDue > 0) {
    impactStats.push({
      value: `${incident.sendsArrived ?? 0} / ${incident.sendsDue}`,
      label: "Receipts received",
    });
  }
  if (incident.resolvedAt) {
    impactStats.push({
      value: formatDuration(incident.openedAt, incident.resolvedAt),
      label: "Pause",
    });
    impactStats.push({
      value: formatDuration(incident.openedAt, incident.resolvedAt),
      label: "To resolution",
    });
  }

  // Timeline events
  type TLEvent = {
    kind: "amber" | "green" | "neutral";
    kindLabel: string;
    text: React.ReactNode;
    timestamp: string;
    time: Date;
  };

  const tlEvents: TLEvent[] = [];

  tlEvents.push({
    kind: "amber",
    kindLabel: incident.source === "explicit_fail" ? "Fail ping" : "Gap",
    text:
      incident.source === "explicit_fail"
        ? "Failure reported"
        : "Missed check-in · alert sent by email",
    timestamp: formatTimeOnly(incident.openedAt, timezone),
    time: incident.openedAt,
  });

  if (incident.resolvedAt) {
    tlEvents.push({
      kind: "green",
      kindLabel: "Recovered",
      text: "Check-ins resumed",
      timestamp: formatTimeOnly(incident.resolvedAt, timezone),
      time: incident.resolvedAt,
    });
  }

  if (incident.sendsDue !== null && incident.sendsDue > 0 && incident.resolvedAt) {
    tlEvents.push({
      kind: "green",
      kindLabel: "Receipts",
      text: `Reconciled · ${incident.sendsArrived ?? 0} of ${incident.sendsDue} expected received`,
      timestamp: formatTimeOnly(incident.resolvedAt, timezone),
      time: incident.resolvedAt,
    });
  }

  for (const note of incident.notes) {
    tlEvents.push({
      kind: "neutral",
      kindLabel: "Resolved",
      text: (
        <span>
          <span style={{ color: "var(--t2)", fontStyle: "italic" }}>
            &ldquo;{note.text}&rdquo;
          </span>
          {note.author.name && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--t3)",
                marginLeft: "6px",
              }}
            >
              · {note.author.name.toUpperCase()}
            </span>
          )}
        </span>
      ),
      timestamp: formatTimeOnly(note.createdAt, timezone),
      time: note.createdAt,
    });
  }

  tlEvents.sort((a, b) => a.time.getTime() - b.time.getTime());

  // Receipts
  const incidentEnd = incident.resolvedAt ?? new Date();
  const receipts = await prisma.canaryReceipt.findMany({
    where: {
      workflowId: incident.workflow.id,
      workflow: { client: { accountId: account.id } },
      receivedAt: { gte: incident.openedAt, lte: incidentEnd },
    },
    orderBy: { receivedAt: "asc" },
    select: { id: true, receivedAt: true, expectationId: true },
  });

  return (
    <div style={{ padding: "28px 32px 40px", minWidth: 0 }}>
      {/* ── Breadcrumb ── */}
      <div style={{ fontSize: "13px", color: "var(--t3)", display: "flex", gap: "6px", alignItems: "center" }}>
        ←{" "}
        <Link
          href={`/dashboard/clients/${clientId}`}
          style={{ color: "var(--t2)", fontWeight: 500, textDecoration: "none" }}
        >
          {clientName} ledger
        </Link>
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
          {workflowName}
        </span>
        <span style={{ position: "relative", top: "2px" }}>
          <Badge kind={statusResult.kind} label={statusResult.chip} />
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "13px",
            color: "var(--t3)",
          }}
        >
          {formatDateTimeAbsolute(incident.openedAt, timezone)}
          {incident.resolvedAt && (
            <> – {formatDateTimeAbsolute(incident.resolvedAt, timezone)}</>
          )}
        </span>
      </div>

      {/* ── 1. ImpactStrip card ── */}
      <Card style={{ marginTop: "16px" }}>
        <ImpactStrip
          heroValue={String(outstanding)}
          heroLabel="Outstanding"
          heroColor={heroColor}
          stats={impactStats}
        />
      </Card>

      {/* ── 2. Two-column grid: Events + Receipts ── */}
      <div className="grid-2col-incident" style={{ marginTop: "14px" }}>
        {/* Events timeline */}
        <Card>
          <CardHeader
            title="Events"
            count={tlEvents.length}
            collapse="open"
          />
          <Timeline events={tlEvents} />
        </Card>

        {/* Receipts card */}
        <Card>
          <CardHeader
            title="Receipts"
            count={
              incident.sendsDue !== null
                ? `${incident.sendsArrived ?? 0} of ${incident.sendsDue}`
                : undefined
            }
            right={
              incident.sendsDue !== null && incident.sendsDue > 0 ? (
                <Link
                  href={`/dashboard/clients/${clientId}/workflows/${incident.workflow.id}/canary`}
                  style={{
                    color: "var(--pine)",
                    fontWeight: 500,
                    fontSize: "13px",
                    textDecoration: "none",
                  }}
                >
                  Canary detail
                </Link>
              ) : undefined
            }
            collapse="open"
          />
          {receipts.length === 0 ? (
            <div
              style={{
                padding: "10px 16px",
                fontSize: "13px",
                color: "var(--t2)",
              }}
            >
              {incident.sendsDue === null
                ? "Canary not yet live for this workflow."
                : "No receipts recorded."}
            </div>
          ) : (
            <>
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 100px 1fr",
                  gap: "12px",
                  padding: "9px 16px",
                  background: "var(--subtle)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {["Expected", "Received", "Delta"].map((h, i) => (
                  <span
                    key={h}
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--t3)",
                      textAlign: i === 2 ? "right" : "left",
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
                    gridTemplateColumns: "80px 100px 1fr",
                    gap: "12px",
                    padding: "9px 16px",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "13.5px",
                    alignItems: "baseline",
                    fontFamily: "var(--mono)",
                  }}
                >
                  <span style={{ color: "var(--t2)" }}>
                    {r.expectationId ? "matched" : "—"}
                  </span>
                  <span>
                    {formatTimeOnly(r.receivedAt, timezone)}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      color: r.expectationId
                        ? "var(--green-tx)"
                        : "var(--amber-tx)",
                      fontWeight: 500,
                    }}
                  >
                    {r.expectationId ? "matched" : "unexpected"}
                  </span>
                </div>
              ))}
              <div
                style={{
                  padding: "11px 16px",
                  borderTop: "1px solid var(--border)",
                  fontSize: "13px",
                  fontWeight: 600,
                  background: "var(--subtle)",
                }}
              >
                {incident.sendsDue ?? 0} expected · {incident.sendsArrived ?? 0} received · {outstanding} outstanding
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── 3. Summary card — full-width ── */}
      <Card style={{ marginTop: "14px" }}>
        <CardHeader title="Summary" right="from the record" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "28px",
            alignItems: "start",
            padding: "15px 16px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "14px",
                lineHeight: "1.65",
                maxWidth: "64ch",
              }}
            >
              {factLines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < factLines.length - 1 && " "}
                </span>
              ))}
            </div>
            {/* "Your read" slot */}
            <div
              style={{
                marginTop: "11px",
                border: "1px dashed var(--amber-bd)",
                background: "var(--amber-bg)",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "13px",
                fontStyle: "italic",
                color: "var(--amber-tx)",
              }}
            >
              Your read — required before any client note
            </div>
            {/* Resolution note + Mark resolved (when open) */}
            {incident.status === "open" && (
              <div style={{ marginTop: "14px" }}>
                <ResolveForm incidentId={incident.id} />
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "9px",
              alignItems: "stretch",
              paddingTop: "2px",
            }}
          >
            {/* Copy summary (primary) */}
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "8px",
                padding: "9px 14px",
                border: "1px solid var(--pine)",
                background: "var(--pine)",
                color: "#fff",
                boxShadow: "var(--sh)",
                cursor: "pointer",
              }}
            >
              Copy summary
            </button>
            {/* Compose client note (secondary) */}
            <Link
              href={`/dashboard/clients/${clientId}/compose/${incident.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "8px",
                padding: "9px 14px",
                border: "1px solid var(--border-2)",
                background: "#fff",
                color: "var(--t2)",
                boxShadow: "var(--sh)",
                textDecoration: "none",
              }}
            >
              Compose client note
            </Link>
          </div>
        </div>
      </Card>

      {/* ── 4. Diagnostics card — collapsed by default, ONLY place errorText renders ── */}
      <Card style={{ marginTop: "14px" }}>
        <DiagnosticsPanel
          errorText={incident.errorText}
          errorRedactedByServer={incident.errorRedactedByServer}
          count={incident.errorText ? 1 : 0}
        />
      </Card>

      {/* Simulate failure */}
      {incident.workflow.status !== "down" && (
        <div style={{ marginTop: "14px", paddingBottom: "40px" }}>
          <SimulateFailureForm workflowId={incident.workflow.id} />
        </div>
      )}
    </div>
  );
}
