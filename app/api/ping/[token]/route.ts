// Ingest: simple, fast, idempotent (safe-under-retry, not request-deduped),
// rate-limited, payload size-capped. Never writes Workflow.status — the
// watcher is the only writer of "healthy" (same rule already applied in
// app/dashboard/actions.ts). This route only records that a ping happened.
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "./rate-limit";
import { readCappedBody, PayloadTooLargeError } from "./read-capped-body";

// Explicit: the rate limiter's correctness depends on running as a single
// long-lived Node process, not per-request isolates.
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const workflow = await prisma.workflow.findUnique({
    where: { token, archivedAt: null },
    select: { id: true },
  });
  if (!workflow) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (!checkRateLimit(workflow.id)) {
    logger.warn("ping.rate_limited", { workflowId: workflow.id });
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  let payload: unknown = null;
  try {
    const raw = await readCappedBody(request);
    if (raw.trim().length > 0) {
      try {
        payload = JSON.parse(raw);
      } catch {
        return Response.json({ error: "Malformed JSON body." }, { status: 400 });
      }
    }
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      return Response.json({ error: "Payload too large." }, { status: 413 });
    }
    throw e;
  }

  const receivedAt = new Date();
  const [ping] = await prisma.$transaction([
    prisma.ping.create({
      data: {
        workflowId: workflow.id,
        receivedAt,
        ...(payload !== null ? { payload } : {}),
      },
      select: { id: true, receivedAt: true },
    }),
    prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: receivedAt },
    }),
  ]);

  // workflowId + pingId only — never the token, never the payload
  // (lib/logger.ts: "NEVER ... Ping payloads").
  logger.info("ping.received", { workflowId: workflow.id, pingId: ping.id });

  return Response.json({ ok: true, receivedAt: ping.receivedAt.toISOString() });
}
