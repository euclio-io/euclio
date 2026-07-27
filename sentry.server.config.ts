import * as Sentry from "@sentry/nextjs";

// Server-runtime Sentry init. Loaded by instrumentation.ts when the Node runtime
// boots. A monitoring tool blind to its own errors is unacceptable (CLAUDE.md),
// so this runs from M0.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Structured logging — enables Sentry.logger.* used by lib/logger.ts.
  enableLogs: true,

  // Euclio must never become a PII sink. Don't attach request bodies, cookies,
  // headers, or user identifiers by default. This is the choke point for the
  // "no customer PII/PHI in telemetry" rule once Ping.payload metrics exist.
  sendDefaultPii: false,
});
