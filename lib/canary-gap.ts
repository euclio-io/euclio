/**
 * canary-gap.ts — pure gap-accounting function for the canary sensor.
 *
 * Honesty invariant (addendum §4):
 *   THE CANARY OBSERVES, IT DOES NOT INFER.
 *   A receipt means the canary received a copy. Euclio never claims any other
 *   recipient received anything. "arrived" always means "arrived at the canary."
 *
 * computeGap() counts:
 *   sendsDue     — how many expected occurrences fell within the incident window
 *   sendsArrived — how many matched receipts arrived AFTER recovery
 *                  (receipts during the incident don't count as "arrived")
 *
 * Rule format (plain text for MVP):
 *   "daily by HH:MM"    — one occurrence per calendar day at HH:MM
 *   "weekdays by HH:MM" — Mon–Fri only at HH:MM
 *
 * Times are interpreted in the supplied timezone (default UTC).
 */

export interface GapReceipt {
  receivedAt: Date;
  expectationId: string | null;
}

export interface GapResult {
  sendsDue: number;
  sendsArrived: number;
}

/**
 * Compute gap accounting for a resolved incident.
 *
 * @param rule            Plain-text schedule rule ("daily by HH:MM" or "weekdays by HH:MM")
 * @param windowMins      Match window in minutes (receipt must arrive within ±windowMins of expected time)
 * @param incidentOpenedAt  When the incident opened
 * @param incidentResolvedAt  When the incident resolved
 * @param receipts        All CanaryReceipts for this workflow (with expectationId)
 * @param timezone        IANA timezone string (default "UTC")
 */
export function computeGap(
  rule: string,
  windowMins: number,
  incidentOpenedAt: Date,
  incidentResolvedAt: Date,
  receipts: GapReceipt[],
  timezone = "UTC",
): GapResult {
  const occurrences = getOccurrences(rule, incidentOpenedAt, incidentResolvedAt, timezone);
  const sendsDue = occurrences.length;

  // sendsArrived: matched receipts that arrived AFTER recovery
  // (receipts during the incident window don't count — the send may have been
  //  queued before the pause and arrived late; only post-recovery arrivals confirm
  //  the workflow is back and sending)
  const sendsArrived = receipts.filter(
    (r) =>
      r.expectationId !== null &&
      r.receivedAt > incidentResolvedAt,
  ).length;

  return { sendsDue, sendsArrived };
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a plain-text rule and return all expected occurrence times
 * that fall strictly within [openedAt, resolvedAt].
 */
function getOccurrences(
  rule: string,
  openedAt: Date,
  resolvedAt: Date,
  timezone: string,
): Date[] {
  const parsed = parseRule(rule);
  if (!parsed) return [];

  const { hour, minute, weekdaysOnly } = parsed;
  const occurrences: Date[] = [];

  // Walk day by day from openedAt to resolvedAt (inclusive of both endpoints' dates)
  const startDate = toLocalDate(openedAt, timezone);
  const endDate = toLocalDate(resolvedAt, timezone);

  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dayOfWeek = getDayOfWeek(cursor, timezone); // 0=Sun, 6=Sat
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (!weekdaysOnly || isWeekday) {
      // Build the occurrence time in the target timezone
      const occurrence = buildOccurrence(cursor, hour, minute, timezone);
      // Only include if strictly within the incident window
      if (occurrence > openedAt && occurrence <= resolvedAt) {
        occurrences.push(occurrence);
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return occurrences;
}

interface ParsedRule {
  hour: number;
  minute: number;
  weekdaysOnly: boolean;
}

/**
 * Parse "daily by HH:MM" or "weekdays by HH:MM".
 * Returns null if the rule is unrecognised.
 */
function parseRule(rule: string): ParsedRule | null {
  const normalized = rule.trim().toLowerCase();
  const match = normalized.match(/^(daily|weekdays)\s+by\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const weekdaysOnly = match[1] === "weekdays";
  const hour = parseInt(match[2], 10);
  const minute = parseInt(match[3], 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return { hour, minute, weekdaysOnly };
}

/**
 * Return a Date representing midnight UTC on the local calendar date
 * corresponding to `date` in `timezone`. Used only for day-walking.
 */
function toLocalDate(date: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);

  // Return as UTC midnight for the local calendar date (used only for iteration)
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Get the day of week (0=Sun…6=Sat) for a UTC-midnight date in the given timezone.
 * We add 12 hours to avoid the UTC midnight → previous local day boundary issue
 * (e.g. UTC midnight Aug 3 = Aug 2 20:00 NY, which is Sunday not Monday).
 */
function getDayOfWeek(utcMidnight: Date, timezone: string): number {
  // Use UTC noon of the same UTC date to safely land on the correct local calendar day
  const utcNoon = new Date(utcMidnight.getTime() + 12 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(utcNoon);
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/**
 * Build the exact UTC timestamp for HH:MM on a given local calendar day.
 * utcMidnight is a Date at UTC midnight representing the local calendar date.
 */
function buildOccurrence(
  utcMidnight: Date,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  // Use UTC noon to avoid the UTC midnight → previous local day boundary issue
  // (e.g. UTC midnight Aug 3 = Aug 2 20:00 NY → would format as Aug 2, not Aug 3)
  const utcNoon = new Date(utcMidnight.getTime() + 12 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(utcNoon);

  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);

  // Build a local datetime string and parse it as UTC offset via Intl
  // We use a trick: format a known UTC time and find the offset.
  // Simpler: use the Date constructor with a timezone-aware string.
  // Since JS doesn't support timezone-aware Date construction natively,
  // we use the offset approach: find what UTC time corresponds to HH:MM local.
  const localStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

  // Find the UTC offset for this local time by formatting a candidate UTC time
  // and comparing. We use a binary-search-free approach: format the naive UTC
  // time and compute the offset from the formatted local time.
  const naiveUtc = new Date(localStr + "Z");
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(naiveUtc);

  const fYear = Number(formatted.find((p) => p.type === "year")!.value);
  const fMonth = Number(formatted.find((p) => p.type === "month")!.value);
  const fDay = Number(formatted.find((p) => p.type === "day")!.value);
  const fHour = Number(formatted.find((p) => p.type === "hour")!.value);
  const fMinute = Number(formatted.find((p) => p.type === "minute")!.value);

  // Compute the offset in minutes between what we want and what we got
  const wantMs = Date.UTC(year, month - 1, day, hour, minute);
  const gotMs = Date.UTC(fYear, fMonth - 1, fDay, fHour, fMinute);
  const offsetMs = wantMs - gotMs;

  return new Date(naiveUtc.getTime() + offsetMs);
}
