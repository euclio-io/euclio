import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { computeGap } from "@/lib/canary-gap";

// POST /api/canary/inbound
//
// Receives inbound email webhooks from Resend (signed with Svix).
// Data principle (addendum §7 + §11):
//   - Headers + subject hash only. Body is read transiently and discarded.
//   - fromAddr stored for debugging; never shown client-facing.
//   - subjectHash is SHA-256 hex of the subject line — body never persisted.
//   - Canary content is firewalled from ClientUpdate exactly as errorText is.
//   - Unmatched receipts log with expectationId=null and surface nowhere client-facing.
//
// Security:
//   - Svix signature verification on every request.
//   - No 404 on unmatched canary address (don't leak address existence).
//   - Ownership is implicit: canaryAddress is globally unique and unguessable.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.RESEND_INBOUND_SECRET;
  if (!secret) {
    logger.info("canary.inbound.misconfigured", { reason: "missing_secret" });
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Verify Svix signature
  const wh = new Webhook(secret);
  try {
    wh.verify(rawBody, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    });
  } catch {
    logger.info("canary.inbound.signature_invalid", {});
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Parse payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const data = (payload as { data?: Record<string, unknown> }).data ?? {};
  const toAddresses: string[] = Array.isArray(data.to)
    ? (data.to as string[])
    : typeof data.to === "string"
      ? [data.to]
      : [];
  const fromAddr = typeof data.from === "string" ? data.from : null;
  const subject = typeof data.subject === "string" ? data.subject : null;

  // Hash the subject — body is discarded immediately (never stored)
  const subjectHash = subject
    ? createHash("sha256").update(subject).digest("hex")
    : null;

  // Find the workflow by canary address (try all To: addresses)
  // accountId lives on the Client, not the Workflow — join through client.
  let workflow: { id: string } | null = null;
  for (const addr of toAddresses) {
    const found = await prisma.workflow.findFirst({
      where: { canaryAddress: addr.toLowerCase().trim() },
      select: { id: true },
    });
    if (found) {
      workflow = found;
      break;
    }
  }

  if (!workflow) {
    // Unmatched — log routing metadata and return 200 (never 404; don't leak address existence).
    // Log domain parts only — never the local part, subject, or body (data principle §7).
    // This metadata distinguishes "probe traffic to a random domain" from "my own addresses
    // don't match" when debugging missing receipts in Railway web logs.
    const canaryDomain = process.env.CANARY_DOMAIN ?? "in.euclio.io";
    const toDomains = toAddresses.map((a) => {
      const at = a.lastIndexOf("@");
      return at >= 0 ? a.slice(at + 1).toLowerCase().trim() : "";
    });
    logger.info("canary.unmatched", {
      toCount: toAddresses.length,
      toDomainsDistinct: [...new Set(toDomains)],
      anyMatchesCanaryDomain: toDomains.some((d) => d === canaryDomain),
    });
    return NextResponse.json({ ok: true });
  }

  const now = new Date();

  // Find the nearest active expectation whose window covers now
  const expectations = await prisma.canaryExpectation.findMany({
    where: { workflowId: workflow.id, active: true },
    select: { id: true, rule: true, windowMins: true },
  });

  // Simple matching: find the expectation whose next occurrence is closest to now
  // within ±windowMins. For MVP we use a greedy first-match approach.
  let expectationId: string | null = null;
  for (const exp of expectations) {
    if (isWithinWindow(now, exp.rule, exp.windowMins)) {
      expectationId = exp.id;
      break;
    }
  }

  // Write the receipt
  await prisma.canaryReceipt.create({
    data: {
      workflowId: workflow.id,
      receivedAt: now,
      fromAddr,
      subjectHash,
      expectationId,
    },
  });

  logger.info("canary.receipt", {
    workflowId: workflow.id,
    matched: expectationId !== null,
  });

  // Gap accounting: if there's an open incident on this workflow, recompute
  const openIncident = await prisma.incident.findFirst({
    where: { workflowId: workflow.id, status: "open" },
    select: { id: true, openedAt: true },
  });

  if (openIncident) {
    // Recompute gap with all receipts for this workflow
    const allReceipts = await prisma.canaryReceipt.findMany({
      where: { workflowId: workflow.id },
      select: { receivedAt: true, expectationId: true },
    });

    // Use the first active expectation for gap accounting
    const primaryExp = expectations[0];
    if (primaryExp) {
      const { sendsDue, sendsArrived } = computeGap(
        primaryExp.rule,
        primaryExp.windowMins,
        openIncident.openedAt,
        now, // incident still open — use now as provisional resolvedAt
        allReceipts,
      );
      await prisma.incident.update({
        where: { id: openIncident.id },
        data: { sendsDue, sendsArrived },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Check if `now` falls within ±windowMins of the most recent expected occurrence
 * for the given rule. For MVP: parse "daily by HH:MM" or "weekdays by HH:MM"
 * and check if the current time is within the window of today's occurrence.
 */
function isWithinWindow(now: Date, rule: string, windowMins: number): boolean {
  const normalized = rule.trim().toLowerCase();
  const match = normalized.match(/^(daily|weekdays)\s+by\s+(\d{1,2}):(\d{2})$/);
  if (!match) return false;

  const weekdaysOnly = match[1] === "weekdays";
  const hour = parseInt(match[2], 10);
  const minute = parseInt(match[3], 10);

  // Check weekday constraint
  if (weekdaysOnly) {
    const dow = now.getUTCDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) return false;
  }

  // Build today's occurrence time in UTC
  const todayOccurrence = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0),
  );

  const diffMs = Math.abs(now.getTime() - todayOccurrence.getTime());
  return diffMs <= windowMins * 60 * 1000;
}
