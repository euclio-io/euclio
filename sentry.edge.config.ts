import * as Sentry from "@sentry/nextjs";

// Edge-runtime Sentry init (middleware / edge routes). Loaded by
// instrumentation.ts when NEXT_RUNTIME === "edge". Kept identical to the server
// config on purpose — same DSN, same no-PII stance.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enableLogs: true,
  sendDefaultPii: false,
});
