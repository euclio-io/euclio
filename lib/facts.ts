/**
 * facts.ts — the ONLY place client-facing observation strings are generated.
 *
 * Honesty invariants (CLAUDE.md principle 1):
 *   - States only what was observed: stopped checking in / reported a failure /
 *     resumed / duration. Never characterises severity or impact.
 *   - Never includes Incident.errorText — the diagnostic is freelancer-only,
 *     structurally absent from this function's signature.
 *   - Never emits banned words (see unit tests for the full list).
 *
 * Two fact shapes:
 *   heartbeat:     "Booking sync stopped checking in at 9:02am"
 *   explicit_fail: "Booking sync reported a failure at 9:02am"
 *
 * Resumed line (when resolvedAt is provided):
 *   "Back at 9:14am · 12 min"
 *
 * Quiet-period shape (factsForQuietPeriod):
 *   "N check-ins since <date>" (+ optional canary line)
 *
 * Time format: h:mma in the supplied timezone (default UTC).
 * Duration: "N min" for < 60 min, "Nh Nm" or "Nh" for ≥ 60 min.
 */

export type IncidentSource = "heartbeat" | "explicit_fail";

/**
 * Generate observation strings for an incident.
 *
 * @param workflowName  The workflow's display name.
 * @param source        "heartbeat" (missed check-in) or "explicit_fail" (/fail ping).
 * @param openedAt      When the incident opened.
 * @param resolvedAt    When the incident resolved (null/undefined = still open).
 * @param timezone      IANA timezone string (default "UTC").
 * @returns             Array of 1–2 observation strings.
 */
export function factsForIncident(
  workflowName: string,
  source: IncidentSource,
  openedAt: Date,
  resolvedAt?: Date | null,
  timezone = "UTC",
): string[] {
  const openTime = formatTime(openedAt, timezone);

  const firstLine =
    source === "explicit_fail"
      ? `${workflowName} reported a failure at ${openTime}`
      : `${workflowName} stopped checking in at ${openTime}`;

  const lines: string[] = [firstLine];

  if (resolvedAt) {
    const resolvedTime = formatTime(resolvedAt, timezone);
    const duration = formatDuration(openedAt, resolvedAt);
    lines.push(`Back at ${resolvedTime} · ${duration}`);
  }

  return lines;
}

/**
 * Input for factsForQuietPeriod.
 *
 * @param sinceDate       Start of the quiet period (last resolved incident, or first ping).
 * @param checkinCount    Number of check-ins (pings) during the period.
 * @param receiptsVerified  Number of canary receipts verified (omit or 0 = canary not enabled).
 * @param timezone        IANA timezone string (default "UTC").
 */
export interface QuietPeriodInput {
  sinceDate: Date;
  checkinCount: number;
  receiptsVerified?: number;
  timezone?: string;
}

/**
 * Generate observation strings for a quiet period (all-clear).
 *
 * Observational language only — no severity, no inference, no reassurance.
 * Returns 1–2 lines:
 *   Line 1: "N check-ins since <date>"
 *   Line 2 (canary enabled): "N sends verified at the canary"
 *
 * @param input  QuietPeriodInput
 * @returns      Array of 1–2 observation strings.
 */
export function factsForQuietPeriod(input: QuietPeriodInput): string[] {
  const { sinceDate, checkinCount, receiptsVerified, timezone = "UTC" } = input;

  const sinceDateStr = formatDate(sinceDate, timezone);
  const lines: string[] = [
    `${checkinCount} check-in${checkinCount === 1 ? "" : "s"} since ${sinceDateStr}`,
  ];

  if (receiptsVerified !== undefined && receiptsVerified > 0) {
    lines.push(
      `${receiptsVerified} send${receiptsVerified === 1 ? "" : "s"} verified at the canary`,
    );
  }

  return lines;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a Date as "Mon D, YYYY" in the given IANA timezone.
 * Examples: "Jun 14, 2026"
 */
function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Format a Date as "h:mma" in the given IANA timezone.
 * Examples: "9:02am", "2:14pm", "12:00pm"
 */
function formatTime(date: Date, timezone: string): string {
  // Use Intl.DateTimeFormat — zero dependencies.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  // Output from en-US with hour12: "9:02 AM" → normalise to "9:02am"
  return formatter.format(date).replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase());
}

/**
 * Format the duration between two dates.
 * < 60 min  → "N min"
 * ≥ 60 min  → "Nh Nm" or "Nh" (if minutes = 0)
 */
function formatDuration(from: Date, to: Date): string {
  const totalMinutes = Math.round((to.getTime() - from.getTime()) / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
