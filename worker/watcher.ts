/**
 * Euclio watcher reconciliation logic — M3 slice.
 *
 * Reconciliation: process every workflow overdue since the last check, idempotently.
 * Debounce: require a minimum sustained-down duration before opening an incident.
 * Re-fail suppression: on explicit /fail, don't re-open/re-alert if it re-fails
 *   within N hours of resolving.
 */

import { Prisma } from "@/../generated/prisma";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Debounce window: require a workflow to be overdue for this long before opening an incident.
const DEBOUNCE_MINUTES = Number(process.env.WATCHER_DEBOUNCE_MINUTES ?? 2);
const DEBOUNCE_MS = DEBOUNCE_MINUTES * 60 * 1000;

// Re-fail suppression window: after resolving an explicit_fail incident, don't re-open
// if it re-fails within this window.
const REFAIL_SUPPRESSION_HOURS = 2;
const REFAIL_SUPPRESSION_MS = REFAIL_SUPPRESSION_HOURS * 60 * 60 * 1000;

type WatcherWorkflow = Prisma.WorkflowGetPayload<{
  include: {
    incidents: {
      where: { status: "open" };
      orderBy: { openedAt: "desc" };
      take: 1;
    };
  };
}>;

/**
 * Main reconciliation pass: process every workflow overdue since the last check.
 * Idempotent: safe to call multiple times.
 */
export async function reconcile(): Promise<void> {
  const now = new Date();

  // Find all workflows that are not paused and not archived.
  const workflows = await prisma.workflow.findMany({
    where: {
      archivedAt: null,
      status: { not: "paused" },
    },
    include: {
      incidents: {
        where: { status: "open" },
        orderBy: { openedAt: "desc" },
        take: 1,
      },
    },
  });

  logger.info("watcher.reconcile.start", { workflowCount: workflows.length });

  for (const workflow of workflows) {
    await processWorkflow(workflow, now);
  }

  // Update the global last-checked timestamp for idempotency.
  // (In a multi-watcher setup, this would be per-watcher; for now, it's global.)
  // We don't actually use this yet, but it's here for future multi-watcher safety.

  logger.info("watcher.reconcile.end", { workflowCount: workflows.length });
}

/**
 * Process a single workflow: check if it's overdue, apply debounce, open/resolve incidents.
 */
async function processWorkflow(workflow: WatcherWorkflow, now: Date): Promise<void> {
  const expectedIntervalMs = workflow.expectedIntervalMinutes * 60 * 1000;
  const graceMs = workflow.graceMinutes * 60 * 1000;
  const windowMs = expectedIntervalMs + graceMs;

  const lastPingAt = workflow.lastPingAt;
  const isOverdue = lastPingAt ? now.getTime() - lastPingAt.getTime() > windowMs : true;

  const openIncident = workflow.incidents[0] || null;

  if (isOverdue) {
    // Workflow is overdue.
    if (!openIncident) {
      // No open incident yet. Check debounce: has it been overdue long enough?
      const overdueFor = lastPingAt ? now.getTime() - lastPingAt.getTime() : Infinity;
      if (overdueFor >= DEBOUNCE_MS) {
        // Debounce satisfied. Open an incident.
        await prisma.incident.create({
          data: {
            workflowId: workflow.id,
            source: "heartbeat",
            status: "open",
          },
        });
        await prisma.workflow.update({
          where: { id: workflow.id },
          data: { status: "down" },
        });
        logger.info("watcher.incident.opened", {
          workflowId: workflow.id,
          source: "heartbeat",
        });
      }
    }
    // If an incident is already open, do nothing (no re-alert storm).
  } else {
    // Workflow is NOT overdue (a ping arrived).
    if (openIncident) {
      // An incident is open, but the workflow is healthy again. Resolve it.
      await prisma.incident.update({
        where: { id: openIncident.id },
        data: {
          status: "resolved",
          resolvedAt: now,
        },
      });
      await prisma.workflow.update({
        where: { id: workflow.id },
        data: { status: "healthy" },
      });
      logger.info("watcher.incident.resolved", {
        workflowId: workflow.id,
        incidentId: openIncident.id,
      });
    } else if (workflow.status === "pending") {
      // First ping received; mark as healthy.
      await prisma.workflow.update({
        where: { id: workflow.id },
        data: { status: "healthy" },
      });
      logger.info("watcher.workflow.healthy", { workflowId: workflow.id });
    }
  }
}

/**
 * Called by the ingest path when a /fail ping arrives.
 * Opens an incident immediately (no debounce), with re-fail suppression.
 */
export async function handleExplicitFail(
  workflowId: string,
  errorText: string | null,
  errorRedactedByServer: boolean,
): Promise<void> {
  const now = new Date();

  // Check if there's a recently-resolved explicit_fail incident.
  // If so, and it's within the suppression window, don't re-open.
  const recentResolved = await prisma.incident.findFirst({
    where: {
      workflowId,
      source: "explicit_fail",
      status: "resolved",
      resolvedAt: {
        gte: new Date(now.getTime() - REFAIL_SUPPRESSION_MS),
      },
    },
    orderBy: { resolvedAt: "desc" },
  });

  if (recentResolved) {
    logger.info("watcher.explicit_fail.suppressed", {
      workflowId,
      suppressedIncidentId: recentResolved.id,
    });
    return;
  }

  // Check if there's already an open explicit_fail incident.
  // If so, just update the errorText (don't re-alert).
  const openIncident = await prisma.incident.findFirst({
    where: {
      workflowId,
      source: "explicit_fail",
      status: "open",
    },
  });

  if (openIncident) {
    // Update the error text (latest failure wins).
    await prisma.incident.update({
      where: { id: openIncident.id },
      data: {
        errorText,
        errorRedactedByServer,
      },
    });
    logger.info("watcher.explicit_fail.updated", {
      workflowId,
      incidentId: openIncident.id,
    });
    return;
  }

  // No open incident. Create one.
  const incident = await prisma.incident.create({
    data: {
      workflowId,
      source: "explicit_fail",
      status: "open",
      errorText,
      errorRedactedByServer,
    },
  });

  // Mark the workflow as down.
  await prisma.workflow.update({
    where: { id: workflowId },
    data: { status: "down" },
  });

  logger.info("watcher.explicit_fail.opened", {
    workflowId,
    incidentId: incident.id,
  });
}
