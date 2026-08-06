/**
 * settings-action.test.ts
 *
 * Tests the saveTimezone server action.
 * Verifies: valid timezone saves, empty value rejected, invalid string rejected,
 * and that the update is scoped to the caller's own account (ownership via
 * getOrCreateAccountForCurrentUser — no external ID to forge).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Clerk auth ──────────────────────────────────────────────────────────
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "test-clerk-user" }),
}));

// ── Mock next/navigation ─────────────────────────────────────────────────────
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

// ── Mock prisma — factory only uses vi.fn() (no top-level variable reference) ─
vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      update: vi.fn().mockResolvedValue({ id: "test-account-id" }),
    },
  },
}));

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn() },
}));

// ── Import action and mocked module after mocks ───────────────────────────────
import { saveTimezone } from "../actions";
import { prisma } from "@/lib/prisma";

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("saveTimezone", () => {
  beforeEach(() => {
    vi.mocked(prisma.account.update).mockClear();
  });

  it("saves a valid IANA timezone and returns no error", async () => {
    const fd = makeFormData({ timezone: "America/Toronto" });
    const result = await saveTimezone({ error: null }, fd);

    expect(result.error).toBeNull();
    expect(prisma.account.update).toHaveBeenCalledOnce();
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: "test-account-id" },
      data: { timezone: "America/Toronto" },
    });
  });

  it("saves UTC explicitly", async () => {
    const fd = makeFormData({ timezone: "UTC" });
    const result = await saveTimezone({ error: null }, fd);

    expect(result.error).toBeNull();
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: "test-account-id" },
      data: { timezone: "UTC" },
    });
  });

  it("rejects an empty timezone", async () => {
    const fd = makeFormData({ timezone: "" });
    const result = await saveTimezone({ error: null }, fd);

    expect(result.error).toBeTruthy();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("rejects a timezone that is not a valid IANA identifier", async () => {
    const fd = makeFormData({ timezone: "Not/A/Real/Timezone/At/All" });
    const result = await saveTimezone({ error: null }, fd);

    expect(result.error).toBeTruthy();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("rejects a timezone that passes structural check but is not recognised by Intl", async () => {
    const fd = makeFormData({ timezone: "Fake/City" });
    const result = await saveTimezone({ error: null }, fd);

    expect(result.error).toBeTruthy();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});
