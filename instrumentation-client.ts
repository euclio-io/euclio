import * as Sentry from "@sentry/nextjs";

// Client-runtime Sentry init (replaces the old sentry.client.config.ts name).
// Runs in the browser bundle — hence the DSN must be NEXT_PUBLIC_.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enableLogs: true,
  sendDefaultPii: false,
});

// Instruments App Router client-side navigations so errors/logs carry the
// correct route context. (Client-only export — not present in the server SDK.)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
