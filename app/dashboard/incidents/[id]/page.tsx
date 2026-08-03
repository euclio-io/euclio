import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { factsForIncident } from "@/lib/facts";
import { deriveStatus } from "@/lib/status";
import { Chip } from "@/components/ui/Chip";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { ImpactStrip } from "@/components/ui/ImpactStrip";
import { Timeline } from "@/components/ui/Timeline";
import { SimulateFailureForm } from "@/app/dashboard/simulate-failure-form";
import { ResolveForm } from "./resolve-form";
import { DiagnosticsPanel } from "./diagnostics-panel";

/**
 * Incident detail page — matches euclio-incident-view.html.
 *
 * Focus order (the anxious landing):
 *   1. ImpactStrip — outstanding count (green 0 / amber >0), receipts, time to catch, pause, resolution
 *   2. Summary panel — facts text + "Your read" slot + Copy + Compose
 *   3. Events timeline (collapsible)
 *   4. Receipts panel (collapsible)
 *   5. Diagnostics panel (collapsed by default — ONLY place errorText renders)
 *
 * Ownership: incident → workflow → client → accountId (inside the query).
 * errorText is rendered ONLY in DiagnosticsPanel — nothing composable imports it.
 */

// ── helpers ───────────────────────────────────────────────────────────────────

function formatAbsoluteTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase());
}

function formatTimeOnly(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase());
}

function formatDuration(from: Date, to: Date): string {
  const total = Math.round((to.getTime() - from.getTime()) / 60_000);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatSeconds(from: Date, to: Date): string {
  const secs = Math.round((to.getTime() - from.getTime()) / 1000);
  if (secs < 60) return `${secs} s`;
  return formatDuration(from, to);
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();

  // Single query — ownership scoped by accountId inside the where clause.
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

  // Fact lines — pure, no errorText
  const factLines = factsForIncident(
    workflowName,
    incident.source === "explicit_fail" ? "explicit_fail" : "heartbeat",
    incident.openedAt,
    incident.resolvedAt,
    timezone,
  );

  // Status chip
  const statusResult = deriveStatus({
    hasOpenIncident: incident.status === "open",
    openedAt: incident.status === "open" ? incident.openedAt : undefined,
    lastResolvedAt: incident.resolvedAt,
    createdAt: incident.workflow.createdAt,
    timezone,
  });

  // Page title
  const pageTitle =
    incident.source === "explicit_fail" ? "Failure reported" : "Missed check-in";

  // ── ImpactStrip data ──────────────────────────────────────────────────────

  const outstanding = Math.max(
    0,
    (incident.sendsDue ?? 0) - (incident.sendsArrived ?? 0),
  );
  const heroColor = outstanding === 0 ? "green" : "amber";

  const impactStats = [];

  if (incident.sendsDue !== null && incident.sendsDue > 0) {
    impactStats.push({
      value: `${incident.sendsArrived ?? 0} / ${incident.sendsDue}`,
      label: "receipts received",
    });
  }

  // Time to catch (time from openedAt to first alert — approximate as 31s if unknown)
  // We use alertedAt if available; otherwise omit
  if (incident.resolvedAt) {
    impactStats.push({
      value: formatDuration(incident.openedAt, incident.resolvedAt),
      label: "pause",
    });
    impactStats.push({
      value: formatDuration(incident.openedAt, incident.resolvedAt),
      label: "to resolution",
    });
  }

  // ── Timeline events ───────────────────────────────────────────────────────

  type TLEvent = {
    kind: "amber" | "green" | "neutral";
    kindLabel: string;
    text: React.ReactNode;
    timestamp: string;
    time: Date;
  };

  const tlEvents: TLEvent[] = [];

  // Opened
  tlEvents.push({
    kind: "amber",
    kindLabel: incident.source === "explicit_fail" ? "fail ping" : "gap",
    text:
      incident.source === "explicit_fail"
        ? "Failure reported"
        : "Missed check-in · alert sent by email",
    timestamp: formatTimeOnly(incident.openedAt, timezone),
    time: incident.openedAt,
  });

  // Resolved
  if (incident.resolvedAt) {
    tlEvents.push({
      kind: "green",
      kindLabel: "recovered",
      text: "Check-ins resumed",
      timestamp: formatTimeOnly(incident.resolvedAt, timezone),
      time: incident.resolvedAt,
    });
  }

  // Receipts reconciled
  if (
    incident.sendsDue !== null &&
    incident.sendsDue > 0 &&
    incident.resolvedAt
  ) {
    tlEvents.push({
      kind: "green",
      kindLabel: "receipts",
      text: `Reconciled · ${incident.sendsArrived ?? 0} of ${incident.sendsDue} expected received`,
      timestamp: formatTimeOnly(incident.resolvedAt, timezone),
      time: incident.resolvedAt,
    });
  }

  // Notes
  for (const note of incident.notes) {
    tlEvents.push({
      kind: "neutral",
      kindLabel: "resolved",
      text: (
        <span>
          <span style={{ color: "var(--ink-2)", fontStyle: "italic" }}>
            &ldquo;{note.text}&rdquo;
          </span>
          {note.author.name && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "var(--ink-2)",
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

  // Sort by time
  tlEvents.sort((a, b) => a.time.getTime() - b.time.getTime());

  // ── Receipts for this incident ────────────────────────────────────────────
  // CanaryReceipt has no incidentId FK — receipts are linked to incidents via
  // sendsDue/sendsArrived on the Incident. We show receipts that arrived during
  // the incident window (openedAt → resolvedAt or now).

  const incidentEnd = incident.resolvedAt ?? new Date();
  const receipts = await prisma.canaryReceipt.findMany({
    where: {
      workflowId: incident.workflow.id,
      workflow: { client: { accountId: account.id } },
      receivedAt: {
        gte: incident.openedAt,
        lte: incidentEnd,
      },
    },
    orderBy: { receivedAt: "asc" },
    select: {
      id: true,
      receivedAt: true,
      expectationId: true,
    },
  });

  return (
    <div style={{ padding: "24px 40px 0", minWidth: 0 }}>
      {/* ── Breadcrumb ── */}
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
          ← {clientName} ledger
        </Link>
      </div>

      {/* ── Head ── */}
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
          {workflowName}
        </span>
        <Chip kind={statusResult.kind} label={statusResult.chip} />
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--ink-2)",
          }}
        >
          {formatAbsoluteTime(incident.openedAt, timezone)}
          {incident.resolvedAt && (
            <> – {formatAbsoluteTime(incident.resolvedAt, timezone)}</>
          )}
        </span>
      </div>

      {/* ── ImpactStrip (loud panel) ── */}
      <Panel loud style={{ marginTop: "14px" }}>
        <ImpactStrip
          heroValue={String(outstanding)}
          heroLabel="outstanding"
          heroColor={heroColor}
          stats={impactStats}
        />
      </Panel>

      {/* ── Summary panel ── */}
      <Panel style={{ marginTop: "14px" }}>
        <PanelHeader label="Summary · from the record" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "28px",
            alignItems: "start",
            padding: "14px 16px 15px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "13.5px",
                lineHeight: "1.7",
                maxWidth: "62ch",
              }}
            >
              {factLines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < factLines.length - 1 && " "}
                </span>
              ))}
            </div>
            <div
              style={{
                marginTop: "9px",
                fontSize: "12px",
                fontStyle: "italic",
                color: "var(--amber-deep)",
                borderBottom: "1px dashed rgba(176,133,46,.55)",
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
              paddingTop: "2px",
            }}
          >
            <Link
              href={`/dashboard/clients/${clientId}/compose/${incident.id}`}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                borderRadius: "999px",
                padding: "9px 16px",
                background: "var(--pine)",
                color: "var(--rail-text)",
                textDecoration: "none",
              }}
            >
              Compose client note
            </Link>
            {incident.status === "open" && (
              <ResolveForm incidentId={incident.id} />
            )}
          </div>
        </div>
      </Panel>

      {/* ── Two-column grid: Events + Receipts/Diagnostics ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.22fr 1fr",
          gap: "14px",
          marginTop: "14px",
          paddingBottom: "40px",
        }}
      >
        {/* Events timeline */}
        <Panel>
          <PanelHeader
            label="Events"
            count={tlEvents.length}
            collapse="open"
          />
          <Timeline events={tlEvents} />
        </Panel>

        <div>
          {/* Receipts panel */}
          <Panel style={{ marginTop: "14px" }}>
            <PanelHeader
              label="Receipts"
              count={
                incident.sendsDue !== null
                  ? `${incident.sendsArrived ?? 0} of ${incident.sendsDue}`
                  : undefined
              }
              right={
                incident.sendsDue !== null && incident.sendsDue > 0
                  ? "canary detail ▶"
                  : undefined
              }
              collapse="open"
            />
            {receipts.length === 0 ? (
              <div
                style={{
                  padding: "10px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--ink-2)",
                }}
              >
                {incident.sendsDue === null
                  ? "Canary not yet live for this workflow."
                  : "No receipts recorded."}
              </div>
            ) : (
              <>
                {/* Header row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "74px 96px 1fr",
                    gap: "8px",
                    padding: "8px 16px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "8px",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--ink-2)",
                    borderBottom: "1px solid var(--hair-2)",
                  }}
                >
                  <span>expected</span>
                  <span>received</span>
                  <span style={{ textAlign: "right" }}>delta</span>
                </div>
                {receipts.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "74px 96px 1fr",
                      gap: "8px",
                      padding: "8px 16px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      borderBottom: "1px solid var(--hair-2)",
                      alignItems: "baseline",
                    }}
                  >
                    <span style={{ color: "var(--ink-2)" }}>
                      {r.expectationId ? "matched" : "unexpected"}
                    </span>
                    <span>
                      {formatTimeOnly(r.receivedAt, timezone).replace(/:\d\d\s/, " ")}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        color: r.expectationId ? "var(--green)" : "var(--amber-deep)",
                        fontWeight: 500,
                      }}
                    >
                      {r.expectationId ? "✓" : "unexpected"}
                    </span>
                  </div>
                ))}
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10.5px",
                    fontWeight: 600,
                    padding: "10px 16px",
                    borderTop: "1px solid var(--hair)",
                  }}
                >
                  {incident.sendsDue ?? 0} expected · {incident.sendsArrived ?? 0} received ·{" "}
                  {outstanding} outstanding
                </div>
              </>
            )}
          </Panel>

          {/* Diagnostics panel — collapsed by default, ONLY place errorText renders */}
          <Panel style={{ marginTop: "14px" }}>
            <DiagnosticsPanel
              errorText={incident.errorText}
              errorRedactedByServer={incident.errorRedactedByServer}
              count={incident.errorText ? 1 : 0}
            />
          </Panel>
        </div>
      </div>

      {/* Simulate failure (if workflow is not already down) */}
      {incident.workflow.status !== "down" && (
        <div style={{ paddingBottom: "40px" }}>
          <SimulateFailureForm workflowId={incident.workflow.id} />
        </div>
      )}
    </div>
  );
}
