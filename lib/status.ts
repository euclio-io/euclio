/**
 * lib/status.ts — single source of truth for workflow status chips.
 *
 * Rules:
 *   - open incident → "Open · <age>"
 *   - resolved incident → "Resolved · <time>"
 *   - else → "Quiet · <days> days" from last incident (or workflow creation)
 *
 * Pure function, no DB. All chip strings are worded — never bare dots or glyphs.
 * Sentence case. Banned: severity words, reassurance words, uptime percentages.
 *
 * The Badge component renders the dot separately; this function returns only
 * the text label.
 */

export type StatusKind = "open" | "resolved" | "quiet";

export interface WorkflowStatus {
  kind: StatusKind;
  /** Worded chip label, e.g. "Open · 28 min" or "Quiet · 41 days" */
  chip: string;
}

interface StatusInput {
  hasOpenIncident: boolean;
  openedAt?: Date | null;
  lastResolvedAt?: Date | null;
  createdAt: Date;
  now?: Date;
  timezone?: string;
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function minutesSince(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / 60_000);
}

function daysSince(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function deriveStatus(input: StatusInput): WorkflowStatus {
  const now = input.now ?? new Date();
  const tz = input.timezone ?? "UTC";

  if (input.hasOpenIncident && input.openedAt) {
    const age = minutesSince(input.openedAt, now);
    return {
      kind: "open",
      chip: `Open · ${formatAge(age)}`,
    };
  }

  if (input.lastResolvedAt) {
    const time = formatTime(input.lastResolvedAt, tz);
    return {
      kind: "resolved",
      chip: `Resolved · ${time}`,
    };
  }

  const quietFrom = input.lastResolvedAt ?? input.createdAt;
  const days = daysSince(quietFrom, now);
  return {
    kind: "quiet",
    chip: days === 0 ? "Quiet · today" : `Quiet · ${days} days`,
  };
}
