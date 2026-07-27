import { headers } from "next/headers";

/**
 * Derives the app's own public origin from the incoming request, rather than
 * a hardcoded env var — correct in local dev (localhost:3000) and on Railway
 * (whatever domain is actually being hit) with nothing to keep in sync.
 */
export async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}
