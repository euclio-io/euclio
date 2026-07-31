/**
 * Purge tests — M3 slice.
 *
 * Two test cases:
 * 1. Old errorText is purged
 * 2. Recent errorText is preserved
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { purgeOldErrorText } from "../purge";

describe("nightly purge", () => {
  let workflowId: string;

  beforeEach(async () => {
    // Create a test account, client, and workflow.
    const account = await prisma.account.create({
      data: { name: "Test Account" },
    });

    const client = await prisma.client.create({
      data: { accountId: account.id, name: "Test Client" },
    });

    const workflow = await prisma.workflow.create({
      data: {
        clientId: client.id,
        name: "Test Workflow",
        token: `test-token-${Math.random()}`,
        expectedIntervalMinutes: 5,
      },
    });

    workflowId = workflow.id;
  });

  afterEach(async () => {
    // Clean up.
    await prisma.incident.deleteMany({});
    await prisma.workflow.deleteMany({});
    await prisma.client.deleteMany({});
    await prisma.account.deleteMany({});
  });

  it("1. Old errorText is purged", async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000); // 31 days ago

    const incident = await prisma.incident.create({
      data: {
        workflowId,
        source: "explicit_fail",
        status: "resolved",
        errorText: "Old error",
        createdAt: oldDate,
      },
    });

    await purgeOldErrorText();

    const updated = await prisma.incident.findUnique({ where: { id: incident.id } });
    expect(updated?.errorText).toBeNull();
  });

  it("2. Recent errorText is preserved", async () => {
    const now = new Date();
    const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

    const incident = await prisma.incident.create({
      data: {
        workflowId,
        source: "explicit_fail",
        status: "resolved",
        errorText: "Recent error",
        createdAt: recentDate,
      },
    });

    await purgeOldErrorText();

    const updated = await prisma.incident.findUnique({ where: { id: incident.id } });
    expect(updated?.errorText).toBe("Recent error");
  });
});
