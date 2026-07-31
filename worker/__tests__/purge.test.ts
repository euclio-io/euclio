import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { IncidentSource, IncidentStatus } from "@/generated/prisma/enums";
import { purgeOldErrorText } from "../purge";

describe("nightly purge", () => {
  let accountId: string;
  let clientId: string;
  let workflowId: string;

  beforeAll(async () => {
    const account = await prisma.account.create({
      data: { name: "Purge Test Account" },
    });
    accountId = account.id;

    const client = await prisma.client.create({
      data: { accountId, name: "Purge Test Client" },
    });
    clientId = client.id;

    const workflow = await prisma.workflow.create({
      data: {
        clientId,
        name: "Purge Test Workflow",
        token: `purge-token-${Math.random().toString(36).slice(2)}`,
        expectedIntervalMinutes: 5,
      },
    });
    workflowId = workflow.id;
  });

  afterEach(async () => {
    await prisma.incident.deleteMany({ where: { workflowId } });
  });

  afterAll(async () => {
    await prisma.incident.deleteMany({ where: { workflowId } });
    await prisma.workflow.deleteMany({ where: { clientId } });
    await prisma.client.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
  });

  it("1. Old errorText is purged", async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);

    const incident = await prisma.incident.create({
      data: {
        workflowId,
        source: IncidentSource.explicit_fail,
        status: IncidentStatus.resolved,
        errorText: "Old error",
        openedAt: oldDate,
      },
    });

    await purgeOldErrorText(now);

    const updated = await prisma.incident.findUnique({ where: { id: incident.id } });
    expect(updated?.errorText).toBeNull();
    expect(updated).not.toBeNull(); // row must still exist
  });

  it("2. Recent errorText is preserved", async () => {
    const now = new Date();
    const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const incident = await prisma.incident.create({
      data: {
        workflowId,
        source: IncidentSource.explicit_fail,
        status: IncidentStatus.resolved,
        errorText: "Recent error",
        openedAt: recentDate,
      },
    });

    await purgeOldErrorText(now);

    const updated = await prisma.incident.findUnique({ where: { id: incident.id } });
    expect(updated?.errorText).toBe("Recent error");
  });
});
