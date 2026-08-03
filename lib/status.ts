/**
 * lib/status.ts — single source of truth for workflow status chips.
 *
 * Rules:
 *   - open incident → OPEN · <age>
 *   - resolved incident today → RESOLVED · <time>
 *   - else → QUIET · <days> from last incident (or workflow creation)
 *
 * Pure function, no DB. All chip strings are worded — never bare dots or glyphs.
 * Banned: severity words, reassurance words, uptime percentages.
 */

export type StatusKind = "open" | "resolved" | "quiet";

export interface WorkflowStatus {
  kind: StatusKind;
  /** Worded chip string, e.g. "OPEN · 28 MIN" or "QUIET · 41 DAYS" */
  chip: string;
}

interface StatusInput {
  /** Whether there is currently an open incident */
  hasOpenIncident: boolean;
  /** When the open incident was opened (if any) */
  openedAt?: Date | null;
  /** When the most recent incident was resolved (if any) */
  lastResolvedAt?: Date | null;
  /** When the workflow was created (fallback for quiet run start) */
  createdAt: Date;
  /** Reference time (defaults to now) */
  now?: Date;
  /** Timezone for time formatting (IANA, e.g. "America/New_York") */
  timezone?: string;
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

function minutesSince(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / 60_000);
}

function daysSince(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} MIN`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}H` : `${h}H ${m}M`;
}

export function deriveStatus(input: StatusInput): WorkflowStatus {
  const now = input.now ?? new Date();
  const tz = input.timezone ?? "UTC";

  if (input.hasOpenIncident && input.openedAt) {
    const age = minutesSince(input.openedAt, now);
    return {
      kind: "open",
      chip: `OPEN · ${formatAge(age)}`,
    };
  }

  if (input.lastResolvedAt) {
    const time = formatTime(input.lastResolvedAt, tz);
    return {
      kind: "resolved",
      chip: `RESOLVED · ${time}`,
    };
  }

  // Quiet — days since last incident or workflow creation
  const quietFrom = input.lastResolvedAt ?? input.createdAt;
  const days = daysSince(quietFrom, now);
  return {
    kind: "quiet",
    chip: days === 0 ? "QUIET · TODAY" : `QUIET · ${days} DAYS`,
  };
}
