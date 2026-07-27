import * as Sentry from "@sentry/nextjs";

// Structured attributes: string keys → arbitrary values. This is the object form
// Sentry.logger.{info,warn,error} accept (info also has a template-literal
// overload we don't use). Keep it to IDs/counts/durations — never PII.
type LogAttributes = Record<string, unknown>;

/**
 * Thin, consistent wrapper over Sentry's structured logger.
 *
 * Responsibility: give the whole app one call shape — logger.info("event.name",
 * { attr }) — and act as the single choke point for the "no PII in telemetry"
 * rule (CLAUDE.md). Attributes must be IDs, counts, durations, and statuses —
 * NEVER emails, names, note/update bodies, or Ping payloads.
 *
 * Requires `enableLogs: true` in the Sentry init (set in the sentry.*.config
 * files); without it these calls are no-ops.
 */
export const logger = {
  info: (message: string, attributes?: LogAttributes) =>
    Sentry.logger.info(message, attributes),
  warn: (message: string, attributes?: LogAttributes) =>
    Sentry.logger.warn(message, attributes),
  error: (message: string, attributes?: LogAttributes) =>
    Sentry.logger.error(message, attributes),
};
