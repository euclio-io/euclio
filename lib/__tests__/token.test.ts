/**
 * token.ts unit tests — regression suite for the canary address bug found 2026-08-05.
 *
 * Bug: generateCanaryAddress() was producing mixed-case output (base64url includes
 * A–Z) but POST /api/canary/inbound looks up addr.toLowerCase().trim(). Every real
 * inbound email therefore hit the unmatched-address branch (silent 200 no-leak),
 * hiding the bug perfectly. Fixed: .toLowerCase() added at generation time.
 *
 * These tests are the regression guard.
 */

import { describe, it, expect } from "vitest";
import { generateCanaryAddress, generateWorkflowToken, generatePublicSlug } from "../token";

// ── generateCanaryAddress ─────────────────────────────────────────────────────

describe("generateCanaryAddress", () => {
  it("output is fully lowercase", () => {
    // Run many times to exercise the full base64url alphabet (A–Z would appear
    // in ~50% of outputs before the fix).
    for (let i = 0; i < 50; i++) {
      const addr = generateCanaryAddress();
      expect(addr).toBe(addr.toLowerCase());
    }
  });

  it("ends with @in.euclio.io when CANARY_DOMAIN is not set", () => {
    // CANARY_DOMAIN is not set in the test environment (.env.local may not define it).
    // The function falls back to "in.euclio.io".
    const saved = process.env.CANARY_DOMAIN;
    delete process.env.CANARY_DOMAIN;

    const addr = generateCanaryAddress();
    expect(addr).toMatch(/@in\.euclio\.io$/);

    // Restore
    if (saved !== undefined) process.env.CANARY_DOMAIN = saved;
  });

  it("ends with @<CANARY_DOMAIN> when CANARY_DOMAIN is set", () => {
    const saved = process.env.CANARY_DOMAIN;
    process.env.CANARY_DOMAIN = "canary.example.com";

    const addr = generateCanaryAddress();
    expect(addr).toMatch(/@canary\.example\.com$/);

    // Restore
    if (saved !== undefined) {
      process.env.CANARY_DOMAIN = saved;
    } else {
      delete process.env.CANARY_DOMAIN;
    }
  });

  it("starts with 'canary-'", () => {
    const addr = generateCanaryAddress();
    expect(addr).toMatch(/^canary-/);
  });

  it("is unique across calls (unguessable)", () => {
    const a = generateCanaryAddress();
    const b = generateCanaryAddress();
    expect(a).not.toBe(b);
  });

  it("local part contains only lowercase base64url chars and hyphens", () => {
    for (let i = 0; i < 20; i++) {
      const addr = generateCanaryAddress();
      const [local] = addr.split("@");
      // base64url alphabet: a-z, 0-9, -, _ (plus our "canary-" prefix)
      expect(local).toMatch(/^[a-z0-9_-]+$/);
    }
  });
});

// ── generateWorkflowToken ─────────────────────────────────────────────────────

describe("generateWorkflowToken", () => {
  it("returns a non-empty string", () => {
    expect(generateWorkflowToken()).toBeTruthy();
  });

  it("is unique across calls", () => {
    expect(generateWorkflowToken()).not.toBe(generateWorkflowToken());
  });
});

// ── generatePublicSlug ────────────────────────────────────────────────────────

describe("generatePublicSlug", () => {
  it("starts with 'cu_'", () => {
    expect(generatePublicSlug()).toMatch(/^cu_/);
  });

  it("is unique across calls", () => {
    expect(generatePublicSlug()).not.toBe(generatePublicSlug());
  });
});
