/**
 * actions-slot2.test.ts
 *
 * Tests the structural slot-2 guard in both compose server actions.
 * Both createClientUpdate and createAllClearUpdate must reject when
 * slot2 is empty, even when bodyText is long.
 *
 * These tests call the actions directly with mocked auth/DB so they
 * run without a real Clerk session. The ownership checks are tested
 * separately via the DB-hitting tests; here we only care about the
 * slot-2 guard firing before any DB access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Clerk auth ──────────────────────────────────────────────────────────
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "test-clerk-user" }),
}));

// ── Mock next/navigation (redirect throws in tests) ──────────────────────────
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// ── Mock next/cache ──────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ── Mock account helper ───────────────────────────────────────────────────────
vi.mock("@/lib/account", () => ({
  getOrCreateAccountForCurrentUser: vi.fn().mockResolvedValue({
    id: "test-account-id",
    timezone: "UTC",
  }),
}));

// ── Mock prisma — return valid objects so ownership checks pass ───────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: {
      findFirst: vi.fn().mockResolvedValue({ id: "test-client-id" }),
    },
    incident: {
      findFirst: vi.fn().mockResolvedValue({
        id: "test-incident-id",
        openedAt: new Date("2026-06-14T09:00:00Z"),
        resolvedAt: new Date("2026-06-14T09:12:00Z"),
      }),
      count: vi.fn().mockResolvedValue(0), // no open incidents → all-clear allowed
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: "test-user-id" }),
    },
    clientUpdate: {
      create: vi.fn().mockResolvedValue({ id: "test-update-id", publicSlug: "cu_test" }),
    },
  },
}));

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn() },
}));

// ── Import actions after mocks ────────────────────────────────────────────────
import { createClientUpdate, createAllClearUpdate } from "../actions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const LONG_BODY = "A".repeat(200); // long enough to pass any length check

// ── createClientUpdate — slot-2 guard ─────────────────────────────────────────

describe("createClientUpdate — slot-2 structural guard", () => {
  it("rejects when slot2 is absent (not posted)", async () => {
    const fd = makeFormData({
      incidentId: "test-incident-id",
      clientId: "test-client-id",
      bodyText: LONG_BODY,
      // slot2 intentionally omitted
    });
    const result = await createClientUpdate({ error: null }, fd);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("slot 2");
  });

  it("rejects when slot2 is empty string", async () => {
    const fd = makeFormData({
      incidentId: "test-incident-id",
      clientId: "test-client-id",
      bodyText: LONG_BODY,
      slot2: "",
    });
    const result = await createClientUpdate({ error: null }, fd);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("slot 2");
  });

  it("rejects when slot2 is whitespace only", async () => {
    const fd = makeFormData({
      incidentId: "test-incident-id",
      clientId: "test-client-id",
      bodyText: LONG_BODY,
      slot2: "   ",
    });
    const result = await createClientUpdate({ error: null }, fd);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("slot 2");
  });

  it("succeeds when slot2 is non-empty (guard passes)", async () => {
    const fd = makeFormData({
      incidentId: "test-incident-id",
      clientId: "test-client-id",
      bodyText: LONG_BODY,
      slot2: "This is what it means for the client.",
    });
    const result = await createClientUpdate({ error: null }, fd);
    // Should not fail on the slot-2 guard (may fail on DB if mocks are incomplete,
    // but the error should not be about slot 2)
    if (result.error) {
      expect(result.error).not.toContain("slot 2");
    }
  });
});

// ── createAllClearUpdate — slot-2 guard ───────────────────────────────────────

describe("createAllClearUpdate — slot-2 structural guard", () => {
  it("rejects when slot2 is absent (not posted)", async () => {
    const fd = makeFormData({
      clientId: "test-client-id",
      bodyText: LONG_BODY,
      // slot2 intentionally omitted
    });
    const result = await createAllClearUpdate({ error: null }, fd);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("slot 2");
  });

  it("rejects when slot2 is empty string", async () => {
    const fd = makeFormData({
      clientId: "test-client-id",
      bodyText: LONG_BODY,
      slot2: "",
    });
    const result = await createAllClearUpdate({ error: null }, fd);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("slot 2");
  });

  it("rejects when slot2 is whitespace only", async () => {
    const fd = makeFormData({
      clientId: "test-client-id",
      bodyText: LONG_BODY,
      slot2: "   ",
    });
    const result = await createAllClearUpdate({ error: null }, fd);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("slot 2");
  });

  it("succeeds when slot2 is non-empty (guard passes)", async () => {
    const fd = makeFormData({
      clientId: "test-client-id",
      bodyText: LONG_BODY,
      slot2: "This is what the quiet period means for the client.",
    });
    const result = await createAllClearUpdate({ error: null }, fd);
    // Should not fail on the slot-2 guard
    if (result.error) {
      expect(result.error).not.toContain("slot 2");
    }
  });
});
