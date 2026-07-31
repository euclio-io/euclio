import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { IncidentSource, IncidentStatus, WorkflowStatus } from "@/generated/prisma/enums";
import { reconcile } from "../watcher";

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
      token: `test-token-${Math.random().toString(36).slice(2)}`,
      expectedIntervalMinutes,
      graceMinutes,
    },
  });
}

describe("watcher reconciliation", () => {
  let accountId: string;
  let clientId: string;

  beforeAll(async () => {
    const account = await prisma.account.create({
      data: { name: "Watcher Test Account" },
    });
    accountId = account.id;
    const client = await prisma.client.create({
      data: { accountId, name: "Watcher Test Client" },
    });
    clientId = client.id;
  });

  afterEach(async () => {
    // Clean up only workflows (and their incidents) belonging to this test client.
    const workflows = await prisma.workflow.findMany({ where: { clientId } });
    const ids = workflows.map((w) => w.id);
    if (ids.length > 0) {
      await prisma.incident.deleteMany({ where: { workflowId: { in: ids } } });
      await prisma.ping.deleteMany({ where: { workflowId: { in: ids } } });
      await prisma.workflow.deleteMany({ where: { id: { in: ids } } });
    }
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
  });

  it("1. Healthy workflow (no incident)", async () => {
    const workflow = await createTestWorkflow(clientId, "Healthy");
    const now = new Date();
    const recentPing = new Date(now.getTime() - 2 * 60 * 1000);

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: recentPing, status: WorkflowStatus.healthy },
    });

    await reconcile(now);

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe(WorkflowStatus.healthy);

    const incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(0);
  });

  it("2. Overdue but within debounce (no incident yet)", async () => {
    const workflow = await createTestWorkflow(clientId, "Debounce Test", 5, 1);
    const now = new Date();
    // interval=5, grace=1 → window=6min. Set lastPingAt to now-7min → overdue by 1min < debounce(2min).
    const pastPing = new Date(now.getTime() - 7 * 60 * 1000);

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: pastPing },
    });

    await reconcile(now);

    const incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(0);
  });

  it("3. Overdue past debounce (incident opens)", async () => {
    const workflow = await createTestWorkflow(clientId, "Overdue", 5, 1);
    const now = new Date();
    // interval=5, grace=1, debounce=2 → need overdue by >2min → lastPingAt = now - (6+2+1)min = now-9min.
    const pastPing = new Date(now.getTime() - 9 * 60 * 1000);

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: pastPing },
    });

    await reconcile(now);

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe(WorkflowStatus.down);

    const incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].source).toBe(IncidentSource.heartbeat);
    expect(incidents[0].status).toBe(IncidentStatus.open);
  });

  it("4. Open incident, workflow recovers (incident resolves)", async () => {
    const workflow = await createTestWorkflow(clientId, "Recovery");
    const now = new Date();

    const incident = await prisma.incident.create({
      data: {
        workflowId: workflow.id,
        source: IncidentSource.heartbeat,
        status: IncidentStatus.open,
        openedAt: new Date(now.getTime() - 10 * 60 * 1000),
      },
    });

    // lastPingAt is after openedAt and within the window (not overdue).
    const recentPing = new Date(now.getTime() - 2 * 60 * 1000);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: recentPing, status: WorkflowStatus.down },
    });

    await reconcile(now);

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe(WorkflowStatus.healthy);

    const updatedIncident = await prisma.incident.findUnique({ where: { id: incident.id } });
    expect(updatedIncident?.status).toBe(IncidentStatus.resolved);
    expect(updatedIncident?.resolvedAt).toBeDefined();
  });

  it("5. Pending workflow, first ping (status → healthy)", async () => {
    const workflow = await createTestWorkflow(clientId, "First Ping");
    const now = new Date();

    // Set a recent ping on a pending workflow — within the window.
    const recentPing = new Date(now.getTime() - 2 * 60 * 1000);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: recentPing },
    });

    await reconcile(now);

    const updated = await prisma.workflow.findUnique({ where: { id: workflow.id } });
    expect(updated?.status).toBe(WorkflowStatus.healthy);
  });

  it("8. Watcher does not resolve an explicit_fail incident", async () => {
    const workflow = await createTestWorkflow(clientId, "Explicit Fail No Resolve");
    const now = new Date();

    const incident = await prisma.incident.create({
      data: {
        workflowId: workflow.id,
        source: IncidentSource.explicit_fail,
        status: IncidentStatus.open,
        openedAt: new Date(now.getTime() - 10 * 60 * 1000),
      },
    });

    // Recent ping — not overdue from heartbeat perspective.
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: {
        lastPingAt: new Date(now.getTime() - 2 * 60 * 1000),
        status: WorkflowStatus.down,
      },
    });

    await reconcile(now);

    const updatedIncident = await prisma.incident.findUnique({ where: { id: incident.id } });
    expect(updatedIncident?.status).toBe(IncidentStatus.open);
  });

  it("9. Flapping creates one incident per sustained-down period", async () => {
    const workflow = await createTestWorkflow(clientId, "Flapping", 5, 1);
    const now = new Date();

    // Step 1: overdue past debounce → incident opens.
    const pastPing = new Date(now.getTime() - 9 * 60 * 1000);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: pastPing },
    });
    await reconcile(now);

    let incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].status).toBe(IncidentStatus.open);

    // Step 2: ping arrives → incident resolves.
    const recentPing = new Date(now.getTime() + 1000); // 1s after now, so lastPingAt > openedAt
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: recentPing },
    });
    await reconcile(now);

    incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents[0].status).toBe(IncidentStatus.resolved);

    // Step 3: overdue again → second incident opens (new sustained-down period).
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastPingAt: pastPing },
    });
    await reconcile(now);

    incidents = await prisma.incident.findMany({ where: { workflowId: workflow.id } });
    expect(incidents).toHaveLength(2);
  });
});
