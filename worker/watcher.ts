/**
 * Euclio watcher reconciliation logic — M3 slice.
 *
 * Reconciliation: process every workflow overdue since the last check, idempotently.
 * Debounce: require a minimum sustained-down duration before opening an incident.
 *
 * Invariants:
 * - This is the ONLY writer of status=healthy and status=down for heartbeat incidents.
 * - NEVER opens or resolves explicit_fail incidents — those are owned by the ingest path.
 * - reconcile() is idempotent: running twice for the same `now` produces the same DB state.
 */

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const DEBOUNCE_MINUTES = Number(process.env.WATCHER_DEBOUNCE_MINUTES ?? "2");
const DEBOUNCE_MS = DEBOUNCE_MINUTES * 60 * 1000;

type WatcherWorkflow = Prisma.WorkflowGetPayload<{
  include: {
    incidents: {
      where: { status: "open" };
      orderBy: { openedAt: "desc" };
      take: 1;
    };
  };
}>;

export async function reconcile(now: Date = new Date()): Promise<void> {
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
    try {
      await processWorkflow(workflow, now);
    } catch (err) {
      // One bad workflow must never stall the loop.
      logger.error("watcher.workflow.error", { workflowId: workflow.id, err });
    }
  }

  logger.info("watcher.reconcile.end", { workflowCount: workflows.length });
}

async function processWorkflow(workflow: WatcherWorkflow, now: Date): Promise<void> {
  const expectedIntervalMs = workflow.expectedIntervalMinutes * 60 * 1000;
  const graceMs = workflow.graceMinutes * 60 * 1000;
  const windowMs = expectedIntervalMs + graceMs;

  // Use createdAt as reference for never-pinged workflows (plan requirement).
  const reference = workflow.lastPingAt ?? workflow.createdAt;
  const overdueAt = new Date(reference.getTime() + windowMs);
  const isOverdue = now >= overdueAt;
  // Time since the workflow became overdue (negative = not yet overdue).
  const overdueForMs = now.getTime() - overdueAt.getTime();

  const openIncident = workflow.incidents[0] ?? null;

  if (isOverdue) {
    if (openIncident) {
      // Already has an open incident (heartbeat or explicit_fail) — stamp and move on.
      // Never re-open or re-alert.
      await prisma.workflow.update({
        where: { id: workflow.id },
        data: { lastCheckedAt: now },
      });
    } else {
      // No open incident. Apply debounce before opening one.
      if (overdueForMs >= DEBOUNCE_MS) {
        // Debounce satisfied — open a heartbeat incident.
        await prisma.$transaction([
          prisma.incident.create({
            data: {
              workflowId: workflow.id,
              source: "heartbeat",
              status: "open",
              openedAt: now,
            },
          }),
          prisma.workflow.update({
            where: { id: workflow.id },
            data: { status: "down", lastCheckedAt: now },
          }),
        ]);
        logger.info("watcher.incident.opened", { workflowId: workflow.id });
      } else {
        // Within debounce window — stamp lastCheckedAt but don't open yet.
        await prisma.workflow.update({
          where: { id: workflow.id },
          data: { lastCheckedAt: now },
        });
      }
    }
  } else {
    // Workflow is not overdue — a ping arrived within the window.
    if (openIncident && openIncident.source === "heartbeat") {
      // Resolve the open heartbeat incident.
      // Only resolve if lastPingAt arrived after the incident opened.
      if (workflow.lastPingAt && workflow.lastPingAt > openIncident.openedAt) {
        await prisma.$transaction([
          prisma.incident.update({
            where: { id: openIncident.id },
            data: { status: "resolved", resolvedAt: now },
          }),
          prisma.workflow.update({
            where: { id: workflow.id },
            data: { status: "healthy", lastCheckedAt: now },
          }),
        ]);
        logger.info("watcher.incident.resolved", {
          workflowId: workflow.id,
          incidentId: openIncident.id,
        });
      } else {
        await prisma.workflow.update({
          where: { id: workflow.id },
          data: { lastCheckedAt: now },
        });
      }
    } else {
      // No open heartbeat incident. Ensure status is correct.
      // Handles: first ping (pending→healthy), stuck-down with no open incident,
      // and the steady-state healthy stamp.
      const newStatus =
        workflow.status === "pending" || workflow.status === "down"
          ? "healthy"
          : workflow.status;
      await prisma.workflow.update({
        where: { id: workflow.id },
        data: { status: newStatus, lastCheckedAt: now },
      });
      if (workflow.status !== newStatus) {
        logger.info("watcher.workflow.status_corrected", {
          workflowId: workflow.id,
          from: workflow.status,
          to: newStatus,
        });
      }
    }
  }
}
