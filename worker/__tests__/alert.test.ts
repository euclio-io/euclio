/**
 * M4 alert tests.
 *
 * Tests the alert-email integration in the watcher reconcile loop.
 * sendIncidentAlert is mocked — we test the watcher's orchestration logic,
 * not Resend's API.
 *
 * Covered:
 * 1. Heartbeat incident: exactly one alert sent across repeated ticks.
 * 2. Explicit_fail incident already open: watcher retries alert on next tick.
 * 3. Suppressed re-fail (resolved within window): no new incident, no new alert.
 * 4. Throwing mailer: reconcile loop continues, other workflows are processed.
 * 5. alertedAt is stamped after a successful send.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { IncidentSource, IncidentStatus, WorkflowStatus } from "@/generated/prisma/enums";
import { reconcile } from "../watcher";

// Mock sendIncidentAlert so tests don't hit Resend.
vi.mock("@/lib/mailer", () => ({
  sendIncidentAlert: vi.fn(),
}));

// Import the mock AFTER vi.mock so we get the mocked version.
import { sendIncidentAlert } from "@/lib/mailer";
const mockSendAlert = vi.mocked(sendIncidentAlert);

async function createTestWorkflow(
  clientId: string,
  name: string,
  expectedIntervalMinutes = 5,
  graceMinutes = 1,
) {
  return prisma.workflow.create({
    data: {
      clientId,
      name,
      token: `alert-test-token-${Math.random().toString(36).slice(2)}`,
      expectedIntervalMinutes,
      graceMinutes,
    },
  });
}

describe("M4 alert email", () => {
  let accountId: string;
  let clientId: string;

  beforeAll(async () => {
    const account = await prisma.account.create({
      data: { name: "Alert Test Account" },
    });
    accountId = account.id;
    const client = await prisma.client.create({
      data: { accountId, name: "Alert Test Client" },
    });
    clientId = client.id;
  });

  afterEach(async () => {
    // Clean up workflows (and their incidents) belonging to this test client.
    const workflows = await prisma.workflow.findMany({ where: { clientId } });
    const ids = workflows.map((w) => w.id);
    if (ids.length > 0) {
      await prisma.incident.deleteMany({ where: { workflowId: { in: ids } } });
      await prisma.ping.deleteMany({ where: { workflowId: { in: ids } } });
      await prisma.workflow.deleteMany({ where: { id: { in: ids } } });
    }
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
  });

  it("1. Heartbeat: exactly one alert sent across repeated ticks", async () => {
    mockSendAlert.mockResolvedValue({ sent: true });

    const workflow = await createTestWorkflow(clientId, "Alert Heartbeat", 5, 1);
    const now = new Date();
    // Overdue past debounce: interval=5, grace=1, debounce=2 → need >2min overdue → lastPingAt = now-9min
    const pastPing = new Date(now.getTime() - 9 * 60 * 1000);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: pastPing },
    });

    // First tick: incident opens, alert sent.
    await reconcile(now);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);

    const incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].alertedAt).not.toBeNull();

    // Second tick: incident already open and alerted — no new alert.
    await reconcile(new Date(now.getTime() + 60_000));
    expect(mockSendAlert).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it("2. Explicit_fail incident already open: watcher retries alert on next tick", async () => {
    // Simulate: /fail route opened an incident but alert failed (alertedAt = null).
    mockSendAlert.mockResolvedValueOnce({ sent: false, error: "network error" });
    mockSendAlert.mockResolvedValueOnce({ sent: true });

    const workflow = await createTestWorkflow(clientId, "Alert Retry", 5, 1);
    const now = new Date();

    // Create an explicit_fail incident with alertedAt = null (alert not yet sent).
    const incident = await prisma.incident.create({
      data: {
        workflowId: workflow.id,
        source: IncidentSource.explicit_fail,
        status: IncidentStatus.open,
        openedAt: new Date(now.getTime() - 5 * 60 * 1000),
        alertedAt: null,
      },
    });

    // Workflow is overdue (so watcher sees the open incident and retries alert).
    const pastPing = new Date(now.getTime() - 9 * 60 * 1000);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: pastPing, status: WorkflowStatus.down },
    });

    // First tick: alert fails.
    await reconcile(now);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
    const afterFirst = await prisma.incident.findUnique({ where: { id: incident.id } });
    expect(afterFirst?.alertedAt).toBeNull(); // still null — send failed

    // Second tick: alert succeeds.
    await reconcile(new Date(now.getTime() + 60_000));
    expect(mockSendAlert).toHaveBeenCalledTimes(2);
    const afterSecond = await prisma.incident.findUnique({ where: { id: incident.id } });
    expect(afterSecond?.alertedAt).not.toBeNull(); // stamped now
  });

  it("3. Suppressed re-fail: no new incident, no new alert", async () => {
    mockSendAlert.mockResolvedValue({ sent: true });

    const workflow = await createTestWorkflow(clientId, "Alert Suppressed", 5, 1);
    const now = new Date();

    // Create a recently resolved incident (within suppression window).
    await prisma.incident.create({
      data: {
        workflowId: workflow.id,
        source: IncidentSource.explicit_fail,
        status: IncidentStatus.resolved,
        openedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        resolvedAt: new Date(now.getTime() - 30 * 60 * 1000), // resolved 30min ago
        alertedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
    });

    // Workflow is healthy (not overdue) — watcher won't open a new incident.
    const recentPing = new Date(now.getTime() - 2 * 60 * 1000);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: recentPing, status: WorkflowStatus.healthy },
    });

    await reconcile(now);

    // No new incident opened, no alert sent.
    const incidents = await prisma.incident.findMany({
      where: { workflowId: workflow.id, status: IncidentStatus.open },
    });
    expect(incidents).toHaveLength(0);
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it("4. Throwing mailer: reconcile loop continues, other workflows processed", async () => {
    // First workflow's alert throws.
    mockSendAlert.mockRejectedValueOnce(new Error("Resend exploded"));
    // Second workflow's alert succeeds.
    mockSendAlert.mockResolvedValueOnce({ sent: true });

    const now = new Date();
    const pastPing = new Date(now.getTime() - 9 * 60 * 1000);

    const workflow1 = await createTestWorkflow(clientId, "Alert Throw W1", 5, 1);
    const workflow2 = await createTestWorkflow(clientId, "Alert Throw W2", 5, 1);

    await prisma.workflow.update({
      where: { id: workflow1.id },
      data: { lastPingAt: pastPing },
    });
    await prisma.workflow.update({
      where: { id: workflow2.id },
      data: { lastPingAt: pastPing },
    });

    // Should not throw even though the first alert throws.
    await expect(reconcile(now)).resolves.not.toThrow();

    // Both workflows should have incidents opened.
    const incidents1 = await prisma.incident.findMany({ where: { workflowId: workflow1.id } });
    const incidents2 = await prisma.incident.findMany({ where: { workflowId: workflow2.id } });
    expect(incidents1).toHaveLength(1);
    expect(incidents2).toHaveLength(1);

    // sendIncidentAlert was called for both.
    expect(mockSendAlert).toHaveBeenCalledTimes(2);
  });

  it("5. alertedAt is stamped after successful send", async () => {
    mockSendAlert.mockResolvedValue({ sent: true });

    const workflow = await createTestWorkflow(clientId, "Alert Stamp", 5, 1);
    const now = new Date();
    const pastPing = new Date(now.getTime() - 9 * 60 * 1000);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: pastPing },
    });

    await reconcile(now);

    const incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].alertedAt).not.toBeNull();
    // alertedAt should be close to `now`.
    const diff = Math.abs(incidents[0].alertedAt!.getTime() - now.getTime());
    expect(diff).toBeLessThan(5000); // within 5 seconds
  });
});
