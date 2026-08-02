/**
 * Explicit failure endpoint: /api/ping/[token]/fail
 *
 * Opens an incident IMMEDIATELY (no debounce), with optional scrubbed error text.
 * Includes re-fail suppression: no re-open/re-alert if it re-fails within N hours
 * of resolving (prevents alert storms on intermittently failing scripts).
 *
 * Accepts GET and POST for consistency with the main ping endpoint.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { scrub } from "@/lib/scrub";
import { checkRateLimit } from "../rate-limit";
import { readCappedBody, PayloadTooLargeError } from "../read-capped-body";

export const runtime = "nodejs";

// Re-fail suppression window: don't re-open an incident if it re-fails within
// this many hours of resolving. Prevents alert storms.
const REFAIL_SUPPRESSION_HOURS = 6;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return POST(request, { params });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const workflow = await prisma.workflow.findUnique({
    where: { token, archivedAt: null },
    select: { id: true, expectedIntervalMinutes: true },
  });
  if (!workflow) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (!checkRateLimit(workflow.id)) {
    logger.warn("ping.fail_rate_limited", { workflowId: workflow.id });
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  // Read and scrub the error text from the request body.
  let errorText: string | null = null;
  try {
    const raw = await readCappedBody(request);
    if (raw.trim().length > 0) {
      const scrubbed = scrub(raw);
      errorText = scrubbed.text || null;
      if (scrubbed.redacted) {
        logger.info("ping.fail_error_redacted", { workflowId: workflow.id });
      }
    }
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      return Response.json({ error: "Payload too large." }, { status: 413 });
    }
    throw e;
  }

  const now = new Date();

  // Check for re-fail suppression: if there's a recently resolved incident,
  // don't re-open within the suppression window.
  const recentlyResolved = await prisma.incident.findFirst({
    where: {
      workflowId: workflow.id,
      status: "resolved",
      resolvedAt: {
        gte: new Date(now.getTime() - REFAIL_SUPPRESSION_HOURS * 60 * 60 * 1000),
      },
    },
    orderBy: { resolvedAt: "desc" },
    select: { id: true },
  });

  if (recentlyResolved) {
    // Suppression active: log the re-fail but don't open a new incident.
    logger.info("ping.fail_suppressed", {
      workflowId: workflow.id,
      suppressionHours: REFAIL_SUPPRESSION_HOURS,
    });
    return Response.json({
      ok: true,
      suppressed: true,
      message: `Re-fail suppressed for ${REFAIL_SUPPRESSION_HOURS} hours after resolution.`,
    });
  }

  // Check if there's already an open incident for this workflow.
  const openIncident = await prisma.incident.findFirst({
    where: { workflowId: workflow.id, status: "open" },
    select: { id: true },
  });

  let incident;
  if (openIncident) {
    // Incident already open: update errorText if provided.
    incident = await prisma.incident.update({
      where: { id: openIncident.id },
      data: {
        ...(errorText ? { errorText } : {}),
        updatedAt: now,
      },
      select: { id: true },
    });
    logger.info("ping.fail_incident_updated", {
      workflowId: workflow.id,
      incidentId: incident.id,
    });
  } else {
    // No open incident: create one immediately.
    incident = await prisma.incident.create({
      data: {
        workflowId: workflow.id,
        source: "explicit_fail",
        status: "open",
        openedAt: now,
        ...(errorText ? { errorText } : {}),
      },
      select: { id: true },
    });
    logger.info("ping.fail_incident_opened", {
      workflowId: workflow.id,
      incidentId: incident.id,
    });
  }

  return Response.json({
    ok: true,
    incidentId: incident.id,
    receivedAt: now.toISOString(),
  });
}
