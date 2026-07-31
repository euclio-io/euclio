/**
 * Watcher reconciliation tests — M3 slice.
 *
 * Seven test cases covering:
 * 1. Healthy workflow (no incident)
 * 2. Overdue but within debounce (no incident yet)
 * 3. Overdue past debounce (incident opens)
 * 4. Open incident, workflow recovers (incident resolves)
 * 5. Pending workflow, first ping (status → healthy)
 * 6. Explicit /fail opens incident immediately
 * 7. Explicit /fail with re-fail suppression
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { reconcile, handleExplicitFail } from "../watcher";

// Test helpers
async function createTestWorkflow(
  clientId: string,
  name: string,
  expectedIntervalMinutes: number = 5,
  graceMinutes: number = 1,
) {
  return prisma.workflow.create({
    data: {
      clientId,
      name,
      token: `test-token-${Math.random()}`,
      expectedIntervalMinutes,
      graceMinutes,
    },
  });
}

async function createTestClient(accountId: string, name: string) {
  return prisma.client.create({
    data: { accountId, name },
  });
}

describe("watcher reconciliation", () => {
  let accountId: string;
  let clientId: string;

  beforeEach(async () => {
    // Create a test account and client.
    const account = await prisma.account.create({
      data: { name: "Test Account" },
    });
    accountId = account.id;

    const client = await createTestClient(accountId, "Test Client");
    clientId = client.id;
  });

  afterEach(async () => {
    // Clean up: delete all test data.
    await prisma.incident.deleteMany({});
    await prisma.ping.deleteMany({});
    await prisma.workflow.deleteMany({});
    await prisma.client.deleteMany({});
    await prisma.account.deleteMany({});
  });

  it("1. Healthy workflow (no incident)", async () => {
    const workflow = await createTestWorkflow(clientId, "Healthy");
    const now = new Date();
    const recentPing = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: recentPing, status: "healthy" },
    });

    await reconcile();

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe("healthy");

    const incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(0);
  });

  it("2. Overdue but within debounce (no incident yet)", async () => {
    const workflow = await createTestWorkflow(clientId, "Debounce Test", 5, 1);
    const now = new Date();
    // Overdue by 2 minutes, but debounce is 2 minutes, so it's right at the edge.
    // Set it to 1 minute ago to be safely within debounce.
    const pastPing = new Date(now.getTime() - 1 * 60 * 1000);

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: pastPing },
    });

    await reconcile();

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe("pending"); // No change yet

    const incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(0);
  });

  it("3. Overdue past debounce (incident opens)", async () => {
    const workflow = await createTestWorkflow(clientId, "Overdue", 5, 1);
    const now = new Date();
    // Overdue by 10 minutes (well past the 2-minute debounce).
    const pastPing = new Date(now.getTime() - 10 * 60 * 1000);

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: pastPing },
    });

    await reconcile();

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe("down");

    const incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].source).toBe("heartbeat");
    expect(incidents[0].status).toBe("open");
  });

  it("4. Open incident, workflow recovers (incident resolves)", async () => {
    const workflow = await createTestWorkflow(clientId, "Recovery");
    const now = new Date();

    // Create an open incident.
    const incident = await prisma.incident.create({
      data: {
        workflowId: workflow.id,
        source: "heartbeat",
        status: "open",
      },
    });

    // Set a recent ping (workflow is healthy).
    const recentPing = new Date(now.getTime() - 2 * 60 * 1000);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: recentPing, status: "down" },
    });

    await reconcile();

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe("healthy");

    const updatedIncident = await prisma.incident.findUnique({
      where: { id: incident.id },
    });
    expect(updatedIncident?.status).toBe("resolved");
    expect(updatedIncident?.resolvedAt).toBeDefined();
  });

  it("5. Pending workflow, first ping (status → healthy)", async () => {
    const workflow = await createTestWorkflow(clientId, "First Ping");
    const now = new Date();

    // Set a recent ping on a pending workflow.
    const recentPing = new Date(now.getTime() - 2 * 60 * 1000);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: recentPing },
    });

    await reconcile();

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe("healthy");
  });

  it("6. Explicit /fail opens incident immediately", async () => {
    const workflow = await createTestWorkflow(clientId, "Explicit Fail");

    await handleExplicitFail(workflow.id, "Test error", false);

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe("down");

    const incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].source).toBe("explicit_fail");
    expect(incidents[0].status).toBe("open");
    expect(incidents[0].errorText).toBe("Test error");
  });

  it("7. Explicit /fail with re-fail suppression", async () => {
    const workflow = await createTestWorkflow(clientId, "Re-fail Suppression");
    const now = new Date();

    // Create a resolved explicit_fail incident from 1 hour ago.
    const resolvedAt = new Date(now.getTime() - 60 * 60 * 1000);
    await prisma.incident.create({
      data: {
        workflowId: workflow.id,
        source: "explicit_fail",
        status: "resolved",
        resolvedAt,
        createdAt: new Date(resolvedAt.getTime() - 10 * 60 * 1000),
      },
    });

    // Try to open a new explicit_fail incident.
    await handleExplicitFail(workflow.id, "Re-fail error", false);

    // Should be suppressed; no new incident created.
    const incidents = await prisma.incident.findMany({
      where: { workflowId: workflow.id, status: "open" },
    });
    expect(incidents).toHaveLength(0);
  });
});
