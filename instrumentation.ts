import * as Sentry from "@sentry/nextjs";

// Next's server bootstrap hook. Loads the runtime-appropriate Sentry init once,
// before the app handles requests. Split by runtime so the edge bundle never
// pulls in Node-only Sentry code.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports errors thrown inside Server Components, route handlers, and other
// server code to Sentry (Next's nested React error handling would otherwise
// swallow some of them).
export const onRequestError = Sentry.captureRequestError;
