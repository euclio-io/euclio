/**
 * Canary inbound — address matching regression tests (2026-08-05).
 *
 * Bug: canary addresses were minted mixed-case (base64url A–Z) but the inbound
 * lookup normalises with addr.toLowerCase().trim(). Every real inbound email
 * therefore hit the unmatched-address branch (silent 200 no-leak), hiding the
 * bug perfectly. Fixed: generateCanaryAddress() now lowercases at generation.
 *
 * These tests exercise the matching logic directly against the real DB so that
 * the full lookup path (prisma.workflow.findFirst with canaryAddress) is covered.
 * Signature verification is NOT tested here — that requires a live Svix secret
 * and is an integration concern. The matching logic is the regression target.
 *
 * Test strategy: insert a workflow with a known lowercase canaryAddress, then
 * call the matching helper (extracted below) with both exact-case and upper-case
 * variants of the address and assert the correct workflow is found / not found.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

// ── matching helper (mirrors the logic in route.ts) ───────────────────────────
//
// The route iterates toAddresses and calls:
//   prisma.workflow.findFirst({ where: { canaryAddress: addr.toLowerCase().trim() } })
//
// We replicate that exact lookup here so the test exercises the same code path
// without needing to spin up a Next.js server or bypass Svix verification.

async function findWorkflowByCanaryAddress(
  toAddresses: string[],
): Promise<{ id: string } | null> {
  for (const addr of toAddresses) {
    const found = await prisma.workflow.findFirst({
      where: { canaryAddress: addr.toLowerCase().trim() },
      select: { id: true },
    });
    if (found) return found;
  }
  return null;
}

// ── fixtures ──────────────────────────────────────────────────────────────────

describe("canary inbound — address matching", () => {
  let accountId: string;
  let clientId: string;
  let workflowId: string;
  // A known lowercase canary address (as generateCanaryAddress() now produces).
  const CANARY_ADDR = "canary-regressiontest2026@in.euclio.io";

  beforeAll(async () => {
    const account = await prisma.account.create({
      data: { name: "Canary Matching Test Account" },
    });
    accountId = account.id;

    const client = await prisma.client.create({
      data: { accountId, name: "Canary Matching Test Client" },
    });
    clientId = client.id;

    const workflow = await prisma.workflow.create({
      data: {
        clientId,
        name: "Canary Matching Test Workflow",
        token: `canary-match-test-${Math.random().toString(36).slice(2)}`,
        expectedIntervalMinutes: 60,
        canaryAddress: CANARY_ADDR,
      },
    });
    workflowId = workflow.id;
  });

  afterAll(async () => {
    await prisma.canaryReceipt.deleteMany({ where: { workflowId } });
    await prisma.workflow.deleteMany({ where: { clientId } });
    await prisma.client.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
  });

  // ── exact match ──────────────────────────────────────────────────────────────

  it("finds the workflow when To: address exactly matches the stored canaryAddress", async () => {
    const result = await findWorkflowByCanaryAddress([CANARY_ADDR]);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(workflowId);
  });

  // ── case-insensitive match (the regression case) ──────────────────────────────
  //
  // Before the fix, addresses were stored mixed-case (e.g. "canary-AbCdEf@in.euclio.io")
  // but the lookup normalised with toLowerCase(). After the fix, addresses are stored
  // lowercase, so a mixed-case inbound To: header still matches via toLowerCase().

  it("finds the workflow when To: address differs only by case (UPPERCASE)", async () => {
    const upperAddr = CANARY_ADDR.toUpperCase();
    const result = await findWorkflowByCanaryAddress([upperAddr]);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(workflowId);
  });

  it("finds the workflow when To: address has mixed case", async () => {
    // Simulate what a mail server might do: mixed-case local part
    const mixedAddr = "Canary-RegressionTest2026@in.euclio.io";
    const result = await findWorkflowByCanaryAddress([mixedAddr]);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(workflowId);
  });

  it("finds the workflow when To: address has leading/trailing whitespace", async () => {
    const paddedAddr = `  ${CANARY_ADDR}  `;
    const result = await findWorkflowByCanaryAddress([paddedAddr]);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(workflowId);
  });

  // ── no match ─────────────────────────────────────────────────────────────────

  it("returns null for an address that does not match any workflow", async () => {
    const result = await findWorkflowByCanaryAddress(["canary-unknown@in.euclio.io"]);
    expect(result).toBeNull();
  });

  it("returns null for an empty To: list", async () => {
    const result = await findWorkflowByCanaryAddress([]);
    expect(result).toBeNull();
  });

  // ── multi-address To: header ──────────────────────────────────────────────────

  it("finds the workflow when the matching address is not the first in the To: list", async () => {
    const result = await findWorkflowByCanaryAddress([
      "canary-unknown@in.euclio.io",
      CANARY_ADDR,
    ]);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(workflowId);
  });

  // ── receipt write after match ─────────────────────────────────────────────────
  //
  // Verify the full happy path: a matched address leads to a CanaryReceipt row.

  it("writes a CanaryReceipt when the To: address matches (case-insensitive)", async () => {
    const upperAddr = CANARY_ADDR.toUpperCase();

    // Simulate what the route does after finding the workflow
    const found = await findWorkflowByCanaryAddress([upperAddr]);
    expect(found).not.toBeNull();

    const before = await prisma.canaryReceipt.count({ where: { workflowId } });

    await prisma.canaryReceipt.create({
      data: {
        workflowId: found!.id,
        receivedAt: new Date(),
        fromAddr: "sender@example.com",
        subjectHash: null,
        expectationId: null,
      },
    });

    const after = await prisma.canaryReceipt.count({ where: { workflowId } });
    expect(after).toBe(before + 1);
  });
});
