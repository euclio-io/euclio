import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { factsForIncident } from "@/lib/facts";
import { SimulateFailureForm } from "@/app/dashboard/simulate-failure-form";
import { ResolveForm } from "./resolve-form";

/**
 * Incident detail page — M5 slice.
 *
 * Shows:
 *   - Fact lines from factsForIncident() (heartbeat or explicit_fail shape)
 *   - Event timeline (opened, fail ping, recovered, notes)
 *   - Diagnostic panel (errorText) — freelancer-only, clearly labelled
 *   - Mark-resolved form with optional note
 *   - Simulate failure (if workflow is not already down)
 *
 * Ownership: incident → workflow → client → accountId (inside the query).
 * errorText is rendered here and ONLY here — it never enters facts output
 * or anything composable into a ClientUpdate (structural firewall in facts.ts).
 */

// ── helpers ───────────────────────────────────────────────────────────────────

function formatAbsoluteTime(date: Date, timezone: string): string {
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
      workflow: {
        select: {
          id: true,
          name: true,
          status: true,
          client: {
            select: {
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

  // Fact lines — pure, no errorText, no DB
  const factLines = factsForIncident(
    workflowName,
    incident.source === "explicit_fail" ? "explicit_fail" : "heartbeat",
    incident.openedAt,
    incident.resolvedAt,
    timezone,
  );

  // Page title derived from facts (not from errorText)
  const pageTitle =
    incident.source === "explicit_fail" ? "Failure reported" : "Missed check-in";

  // ── styles (inline — design tokens, no Tailwind classes needed here) ──────

  const s = {
    page: {
      padding: "30px 44px 64px",
      minWidth: 0,
      fontFamily: "var(--font-sans)",
      color: "var(--ink)",
    } as React.CSSProperties,

    crumb: {
      fontFamily: "var(--font-mono)",
      fontSize: "9.5px",
      letterSpacing: ".1em",
      textTransform: "uppercase" as const,
      color: "var(--ink-2)",
      marginBottom: "8px",
    } as React.CSSProperties,

    crumbLink: {
      color: "var(--ink-2)",
      textDecoration: "none",
    } as React.CSSProperties,

    h1: {
      fontFamily: "var(--font-serif)",
      fontSize: "25px",
      fontWeight: 500,
      letterSpacing: "-.005em",
      marginBottom: "4px",
    } as React.CSSProperties,

    statusBadge: (isOpen: boolean) =>
      ({
        display: "inline-block",
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        letterSpacing: ".1em",
        textTransform: "uppercase" as const,
        color: isOpen ? "var(--amber-deep)" : "var(--green)",
        marginLeft: "12px",
        verticalAlign: "middle",
      }) as React.CSSProperties,

    section: {
      marginTop: "28px",
      paddingTop: "20px",
      borderTop: "1px solid var(--hair)",
    } as React.CSSProperties,

    sectionLabel: {
      fontFamily: "var(--font-mono)",
      fontSize: "8.5px",
      letterSpacing: ".12em",
      textTransform: "uppercase" as const,
      color: "var(--ink-2)",
      marginBottom: "12px",
    } as React.CSSProperties,

    factLine: {
      fontSize: "14px",
      lineHeight: "1.6",
      marginBottom: "4px",
    } as React.CSSProperties,

    // Event timeline row
    evRow: {
      display: "flex",
      gap: "12px",
      padding: "8px 0",
      borderTop: "1px solid var(--hair-2)",
      alignItems: "baseline",
      fontSize: "12.5px",
      lineHeight: "1.5",
    } as React.CSSProperties,

    evTime: {
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      color: "var(--ink-2)",
      flexShrink: 0,
      width: "80px",
    } as React.CSSProperties,

    evKindAmber: {
      fontFamily: "var(--font-mono)",
      fontSize: "8.5px",
      letterSpacing: ".06em",
      textTransform: "uppercase" as const,
      color: "var(--amber-deep)",
      flexShrink: 0,
      width: "72px",
    } as React.CSSProperties,

    evKindGreen: {
      fontFamily: "var(--font-mono)",
      fontSize: "8.5px",
      letterSpacing: ".06em",
      textTransform: "uppercase" as const,
      color: "var(--green)",
      flexShrink: 0,
      width: "72px",
    } as React.CSSProperties,

    evKindNeutral: {
      fontFamily: "var(--font-mono)",
      fontSize: "8.5px",
      letterSpacing: ".06em",
      textTransform: "uppercase" as const,
      color: "var(--ink-2)",
      flexShrink: 0,
      width: "72px",
    } as React.CSSProperties,

    evNote: {
      color: "var(--ink-2)",
      fontStyle: "italic",
    } as React.CSSProperties,

    // Diagnostic panel — freelancer-only
    diagnosticPanel: {
      background: "rgba(176, 133, 46, 0.06)",
      border: "1px solid rgba(176, 133, 46, 0.25)",
      borderLeft: "3px solid var(--amber)",
      borderRadius: "6px",
      padding: "14px 16px",
      marginTop: "4px",
    } as React.CSSProperties,

    diagnosticLabel: {
      fontFamily: "var(--font-mono)",
      fontSize: "8px",
      letterSpacing: ".12em",
      textTransform: "uppercase" as const,
      color: "var(--amber-deep)",
      marginBottom: "8px",
    } as React.CSSProperties,

    diagnosticCode: {
      fontFamily: "var(--font-mono)",
      fontSize: "11.5px",
      color: "var(--pine)",
      lineHeight: "1.6",
      whiteSpace: "pre-wrap" as const,
      wordBreak: "break-word" as const,
    } as React.CSSProperties,

    diagnosticRedactedNote: {
      fontFamily: "var(--font-mono)",
      fontSize: "9px",
      color: "var(--ink-2)",
      marginTop: "8px",
    } as React.CSSProperties,
  };

  // ── build timeline events ─────────────────────────────────────────────────

  type TimelineEvent = {
    time: Date;
    kind: "amber" | "green" | "neutral";
    label: string;
    detail: React.ReactNode;
  };

  const events: TimelineEvent[] = [];

  // Opened event
  events.push({
    time: incident.openedAt,
    kind: "amber",
    label: incident.source === "explicit_fail" ? "fail ping" : "gap",
    detail:
      incident.source === "explicit_fail"
        ? "Failure reported"
        : "Missed check-in · alert sent",
  });

  // errorText event (if present) — shown in timeline as a separate row
  // pointing to the diagnostic panel below, not rendering the text inline
  if (incident.errorText) {
    events.push({
      time: incident.openedAt,
      kind: "amber",
      label: "diagnostic",
      detail: (
        <span>
          Error detail captured{" "}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "8px",
              color: "var(--ink-2)",
              marginLeft: "4px",
            }}
          >
            redacted · ttl 30d
          </span>
        </span>
      ),
    });
  }

  // Resolved event
  if (incident.resolvedAt) {
    events.push({
      time: incident.resolvedAt,
      kind: "green",
      label: "recovered",
      detail: "Check-ins resumed",
    });
  }

  // Note events
  for (const note of incident.notes) {
    events.push({
      time: note.createdAt,
      kind: "neutral",
      label: "resolved",
      detail: (
        <span style={s.evNote}>
          &ldquo;{note.text}&rdquo;
          {note.author.name ? ` · ${note.author.name}` : ""}
        </span>
      ),
    });
  }

  // Sort by time
  events.sort((a, b) => a.time.getTime() - b.time.getTime());

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <main style={s.page}>
      {/* Breadcrumb */}
      <div style={s.crumb}>
        <Link href="/dashboard" style={s.crumbLink}>
          Dashboard
        </Link>
        {" / "}
        {clientName}
        {" / "}
        {workflowName}
      </div>

      {/* Title */}
      <h1 style={s.h1}>
        {pageTitle}
        <span style={s.statusBadge(incident.status === "open")}>
          {incident.status === "open" ? "Open" : "Resolved"}
        </span>
      </h1>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--ink-2)",
          marginBottom: "4px",
        }}
      >
        {formatAbsoluteTime(incident.openedAt, timezone)}
        {incident.resolvedAt && (
          <> · Resolved {formatAbsoluteTime(incident.resolvedAt, timezone)}</>
        )}
      </div>

      {/* ── Facts ── */}
      <section style={s.section}>
        <div style={s.sectionLabel}>What happened</div>
        {factLines.map((line, i) => (
          <p key={i} style={s.factLine}>
            {line}
          </p>
        ))}
      </section>

      {/* ── Event timeline ── */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Events</div>
        <div>
          {events.map((ev, i) => (
            <div key={i} style={{ ...s.evRow, borderTop: i === 0 ? "none" : "1px solid var(--hair-2)" }}>
              <span style={s.evTime}>{formatTimeOnly(ev.time, timezone)}</span>
              <span
                style={
                  ev.kind === "amber"
                    ? s.evKindAmber
                    : ev.kind === "green"
                      ? s.evKindGreen
                      : s.evKindNeutral
                }
              >
                {ev.label}
              </span>
              <span>{ev.detail}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Diagnostic panel — freelancer-only ── */}
      {incident.errorText && (
        <section style={s.section}>
          <div style={s.sectionLabel}>Diagnostic · freelancer only</div>
          <div style={s.diagnosticPanel}>
            <div style={s.diagnosticLabel}>
              Error detail · redacted · ttl 30d
            </div>
            <code style={s.diagnosticCode}>{incident.errorText}</code>
            {incident.errorRedactedByServer && (
              <div style={s.diagnosticRedactedNote}>
                Server-side redaction applied to this text.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Resolution ── */}
      <section style={s.section}>
        <div style={s.sectionLabel}>
          {incident.status === "open" ? "Resolve" : "Resolution"}
        </div>

        {incident.status === "open" ? (
          <ResolveForm incidentId={incident.id} />
        ) : (
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--green)",
                marginBottom: incident.notes.length > 0 ? "12px" : "0",
              }}
            >
              Resolved {incident.resolvedAt ? formatAbsoluteTime(incident.resolvedAt, timezone) : ""}
            </p>
            {incident.notes.map((note) => (
              <p
                key={note.id}
                style={{
                  fontSize: "13px",
                  color: "var(--ink-2)",
                  fontStyle: "italic",
                  lineHeight: "1.6",
                }}
              >
                &ldquo;{note.text}&rdquo;
                {note.author.name ? (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      fontStyle: "normal",
                      marginLeft: "8px",
                    }}
                  >
                    — {note.author.name}
                  </span>
                ) : null}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* ── Simulate failure (if workflow is not already down) ── */}
      {incident.workflow.status !== "down" && (
        <section style={s.section}>
          <div style={s.sectionLabel}>Simulate</div>
          <SimulateFailureForm workflowId={incident.workflow.id} />
        </section>
      )}
    </main>
  );
}
