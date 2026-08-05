/**
 * lib/time.ts — shared timezone-aware date/time formatting helpers.
 *
 * All formatters accept an IANA timezone string (e.g. "America/Toronto", "UTC").
 * The effective timezone for a given page is:
 *   client.timezone ?? account.timezone ?? "UTC"
 *
 * These helpers are the single source of display formatting for dashboard
 * timestamps. Dashboard pages import from here instead of defining inline
 * Intl.DateTimeFormat calls.
 *
 * Pure functions, no DB, no side effects.
 */

/**
 * "9:02 AM" — time only, 12-hour clock.
 * Used in: incident timeline events, receipt rows.
 */
export function formatTimeOnly(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * "9:02:14 AM" — time with seconds, 12-hour clock.
 * Used in: incident timeline events where second-level precision matters.
 */
export function formatTimeWithSeconds(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * "Aug 5" — short month + day, no year.
 * Used in: receipt log date column, incident date column.
 */
export function formatDateShort(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * "Aug 5, 9:02 AM" — short date + time, no year.
 * Used in: incident head timestamp, ledger entries.
 */
export function formatDateTimeShort(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * "Aug 5, 9:02:14 AM" — short date + time with seconds.
 * Used in: incident detail page head (open/resolved range).
 */
export function formatDateTimeAbsolute(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Resolve the effective display timezone for a workflow/client/account chain.
 * Priority: client.timezone → account.timezone → "UTC".
 *
 * Pass undefined for clientTimezone when the client row wasn't fetched.
 */
export function effectiveTimezone(
  accountTimezone: string | null | undefined,
  clientTimezone?: string | null,
): string {
  return clientTimezone ?? accountTimezone ?? "UTC";
}
