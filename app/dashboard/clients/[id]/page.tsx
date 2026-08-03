import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { factsForIncident } from "@/lib/facts";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
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
    year: "numeric",
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

  // Count pings in last 30d across all workflows
  const pingCount = await prisma.ping.count({
    where: {
      workflow: { client: { id: clientId, accountId: account.id } },
      receivedAt: { gte: thirtyDaysAgo },
    },
  });

  // Longest quiet run (days between consecutive incidents, or since last incident)
  let longestQuietDays = 0;
  if (allIncidents.length > 0) {
    const sorted = [...allIncidents].sort(
      (a, b) => a.openedAt.getTime() - b.openedAt.getTime(),
    );
    const now = new Date();
    // Gap from last incident to now
    const lastGap = Math.floor(
      (now.getTime() - sorted[sorted.length - 1].openedAt.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    longestQuietDays = lastGap;
    // Gaps between consecutive incidents
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.floor(
        (sorted[i].openedAt.getTime() - sorted[i - 1].openedAt.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      if (gap > longestQuietDays) longestQuietDays = gap;
    }
  }

  // Group incidents by month for separators
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
    <main className="min-h-screen bg-paper px-6 py-10 max-w-3xl mx-auto">
      {/* Back */}
      <Link
        href="/dashboard"
        className="text-sm font-mono text-ink/50 hover:text-ink mb-8 inline-block"
      >
        ← dashboard
      </Link>

      {/* Header */}
      <h1 className="font-serif text-3xl text-ink mb-1">{client.name}</h1>
      <p className="font-mono text-xs text-ink/40 mb-8 uppercase tracking-widest">
        Ledger · kept 12 months
      </p>

      {/* Summary figures */}
      <div className="flex gap-8 mb-10 border-b border-hair pb-6">
        <div>
          <p className="font-mono text-2xl text-ink">{incidents30d}</p>
          <p className="font-mono text-xs text-ink/50 mt-0.5">incidents · 30d</p>
        </div>
        <div>
          <p className="font-mono text-2xl text-ink">{pingCount.toLocaleString()}</p>
          <p className="font-mono text-xs text-ink/50 mt-0.5">check-ins · 30d</p>
        </div>
        <div>
          <p className="font-mono text-2xl text-ink">{longestQuietDays}</p>
          <p className="font-mono text-xs text-ink/50 mt-0.5">longest quiet run · days</p>
        </div>
      </div>

      {/* All-green banner */}
      {isAllGreen && (
        <div className="flex items-center gap-3 mb-8 px-4 py-3 rounded border border-green/30 bg-green/5">
          <span className="w-2 h-2 rounded-full bg-green flex-shrink-0" />
          <p className="font-mono text-sm text-ink/70">
            Quiet run · {longestQuietDays} days ·{" "}
            {pingCount.toLocaleString()} check-ins
          </p>
        </div>
      )}

      {/* Ledger */}
      {allIncidents.length === 0 ? (
        <p className="font-mono text-sm text-ink/40">No incidents on record.</p>
      ) : (
        <div className="space-y-10">
          {monthGroups.map((group) => (
            <div key={group.label}>
              {/* Month separator */}
              <p className="font-mono text-xs text-ink/40 uppercase tracking-widest mb-4">
                {group.label}
              </p>

              <div className="space-y-4">
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
                      className="border border-hair rounded bg-lift"
                    >
                      {/* Entry header */}
                      <div className="flex items-start justify-between px-5 py-4 border-b border-hair">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isOpen ? "bg-amber" : "bg-green"
                              }`}
                            />
                            <h2 className="font-serif text-base text-ink">
                              {title}
                            </h2>
                          </div>
                          <p className="font-mono text-xs text-ink/50">
                            {inc.workflowName} ·{" "}
                            {formatDate(inc.openedAt, clientTz)}{" "}
                            {formatTime(inc.openedAt, clientTz)}
                            {inc.resolvedAt && (
                              <>
                                {" "}
                                · Resolved{" "}
                                {formatTime(inc.resolvedAt, clientTz)} ·{" "}
                                {formatDuration(inc.openedAt, inc.resolvedAt)}
                              </>
                            )}
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/incidents/${inc.id}`}
                          className="font-mono text-xs text-ink/40 hover:text-ink ml-4 flex-shrink-0"
                        >
                          detail →
                        </Link>
                      </div>

                      {/* Facts */}
                      <div className="px-5 py-4 border-b border-hair">
                        {facts.map((line, i) => (
                          <p
                            key={i}
                            className="font-mono text-sm text-ink/80 leading-relaxed"
                          >
                            {line}
                          </p>
                        ))}
                        {inc.notes.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {inc.notes.map((n) => (
                              <p
                                key={n.id}
                                className="font-mono text-xs text-ink/50 italic"
                              >
                                Note: {n.text}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Footer: your read + compose */}
                      <div className="px-5 py-4 flex items-center justify-between gap-4">
                        <p className="font-mono text-xs text-amber/70 border-b border-dashed border-amber/40 pb-0.5">
                          your read — required before composing
                        </p>
                        <Link
                          href={`/dashboard/clients/${clientId}/compose/${inc.id}`}
                          className="font-mono text-xs text-ink/50 border border-hair rounded px-3 py-1.5 hover:border-ink/30 hover:text-ink transition-colors flex-shrink-0"
                        >
                          Compose client note →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
