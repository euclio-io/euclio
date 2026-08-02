/**
 * Euclio alert mailer — M4 slice.
 *
 * Sends exactly one alert email to the freelancer when an incident opens,
 * regardless of source (heartbeat or explicit_fail).
 *
 * Design invariants:
 * - Idempotent per incident: callers must check Incident.alertedAt before calling.
 *   This module does NOT re-check — the caller owns the guard.
 * - Never throws: wraps the Resend call; on failure logs + returns { sent: false }.
 * - Missing RESEND_API_KEY degrades to a logged warning, never a crash.
 * - Email content obeys the honesty principle: facts only — client name, workflow
 *   name, "missed check-in at <time>" or "reported a failure at <time>", link to
 *   the incident. No errorText, no severity words, no reassurance.
 * - RESEND_FROM_ADDRESS must be a verified sender in the Resend account.
 *   Defaults to "Euclio <alerts@euclio.io>" if not set.
 */

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

export interface AlertResult {
  sent: boolean;
  error?: string;
}

/**
 * Sends an alert email for the given incident.
 *
 * Looks up the workflow, client, account, and owner email from the DB.
 * Returns { sent: true } on success, { sent: false, error } on failure.
 * Never throws.
 */
export async function sendIncidentAlert(incidentId: string): Promise<AlertResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("mailer.resend_key_missing", { incidentId });
    return { sent: false, error: "RESEND_API_KEY not set" };
  }

  // Fetch everything we need in one query.
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: {
      id: true,
      source: true,
      openedAt: true,
      workflow: {
        select: {
          id: true,
          name: true,
          client: {
            select: {
              name: true,
              account: {
                select: {
                  id: true,
                  users: {
                    select: { email: true },
                    take: 1,
                    orderBy: { createdAt: "asc" },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!incident) {
    logger.warn("mailer.incident_not_found", { incidentId });
    return { sent: false, error: "Incident not found" };
  }

  const ownerEmail = incident.workflow.client.account.users[0]?.email;
  if (!ownerEmail) {
    logger.warn("mailer.no_owner_email", {
      incidentId,
      accountId: incident.workflow.client.account.id,
    });
    return { sent: false, error: "No owner email found for account" };
  }

  const workflowName = incident.workflow.name;
  const clientName = incident.workflow.client.name;
  const openedAt = incident.openedAt;

  // Format the time honestly — ISO 8601 is unambiguous.
  const timeStr = openedAt.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");

  // Honesty principle: state only what was observed. No severity, no reassurance.
  const eventPhrase =
    incident.source === "explicit_fail"
      ? `reported a failure at ${timeStr}`
      : `missed a check-in at ${timeStr}`;

  const subject = `${workflowName} (${clientName}) ${eventPhrase}`;

  // Link to the incident — uses APP_URL env var (set on Railway), falls back to
  // a relative path note if not available (worker has no request context).
  const appUrl = process.env.APP_URL ?? "https://euclio-production.up.railway.app";
  const incidentUrl = `${appUrl}/dashboard`;

  const bodyText = [
    `Workflow: ${workflowName}`,
    `Client: ${clientName}`,
    `Event: ${eventPhrase}`,
    ``,
    `View your dashboard: ${incidentUrl}`,
    ``,
    `—`,
    `Euclio`,
  ].join("\n");

  const bodyHtml = `
<p><strong>Workflow:</strong> ${escHtml(workflowName)}</p>
<p><strong>Client:</strong> ${escHtml(clientName)}</p>
<p><strong>Event:</strong> ${escHtml(eventPhrase)}</p>
<p><a href="${escHtml(incidentUrl)}">View your dashboard</a></p>
`.trim();

  const from =
    process.env.RESEND_FROM_ADDRESS ?? "Euclio <alerts@euclio.io>";

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: ownerEmail,
      subject,
      text: bodyText,
      html: bodyHtml,
    });

    if (error) {
      logger.error("mailer.send_failed", { incidentId, resendError: error.message });
      Sentry.captureException(new Error(`Resend error: ${error.message}`), {
        extra: { incidentId },
      });
      return { sent: false, error: error.message };
    }

    logger.info("mailer.sent", { incidentId });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("mailer.send_threw", { incidentId, error: msg });
    Sentry.captureException(err, { extra: { incidentId } });
    return { sent: false, error: msg };
  }
}

/** Minimal HTML escaping for values interpolated into the email body. */
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
