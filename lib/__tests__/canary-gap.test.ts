import { describe, it, expect } from "vitest";
import { computeGap, type GapReceipt } from "../canary-gap";

// ── helpers ──────────────────────────────────────────────────────────────────

function utc(iso: string): Date {
  return new Date(iso);
}

function receipt(receivedAt: Date, expectationId: string | null = "exp1"): GapReceipt {
  return { receivedAt, expectationId };
}

// ── basic daily rule ──────────────────────────────────────────────────────────

describe("computeGap — daily rule", () => {
  it("counts one occurrence when a single daily send falls in the window", () => {
    // Incident: Mon 2026-08-03 08:00 UTC → Mon 2026-08-03 18:00 UTC
    // Rule: daily by 09:00 UTC → one occurrence at 09:00 falls in window
    const result = computeGap(
      "daily by 09:00",
      30,
      utc("2026-08-03T08:00:00Z"),
      utc("2026-08-03T18:00:00Z"),
      [],
    );
    expect(result.sendsDue).toBe(1);
    expect(result.sendsArrived).toBe(0);
  });

  it("counts two occurrences for a 2-day incident", () => {
    // Incident: Mon 08:00 → Wed 18:00 → daily 09:00 hits Mon 09:00 and Tue 09:00
    // (Wed 09:00 is before Wed 18:00 so it also counts → 3 occurrences)
    const result = computeGap(
      "daily by 09:00",
      30,
      utc("2026-08-03T08:00:00Z"), // Mon
      utc("2026-08-05T18:00:00Z"), // Wed
      [],
    );
    expect(result.sendsDue).toBe(3); // Mon 09:00, Tue 09:00, Wed 09:00
  });

  it("returns sendsDue=0 when the occurrence is outside the window", () => {
    // Incident: 08:00–08:30, occurrence at 09:00 — outside
    const result = computeGap(
      "daily by 09:00",
      30,
      utc("2026-08-03T08:00:00Z"),
      utc("2026-08-03T08:30:00Z"),
      [],
    );
    expect(result.sendsDue).toBe(0);
  });

  it("returns sendsDue=0 for a zero-duration incident", () => {
    const t = utc("2026-08-03T09:00:00Z");
    const result = computeGap("daily by 09:00", 30, t, t, []);
    expect(result.sendsDue).toBe(0);
  });
});

// ── weekdays rule ─────────────────────────────────────────────────────────────

describe("computeGap — weekdays rule", () => {
  it("counts 2 weekday occurrences for a Mon–Tue incident", () => {
    // Mon 08:00 → Tue 18:00: Mon 09:00 and Tue 09:00 both fall in window
    const result = computeGap(
      "weekdays by 09:00",
      30,
      utc("2026-08-03T08:00:00Z"), // Mon
      utc("2026-08-04T18:00:00Z"), // Tue
      [],
    );
    expect(result.sendsDue).toBe(2);
  });

  it("counts 0 occurrences for a weekend-only incident", () => {
    // Sat 08:00 → Sun 18:00: no weekday occurrences
    const result = computeGap(
      "weekdays by 09:00",
      30,
      utc("2026-08-01T08:00:00Z"), // Sat
      utc("2026-08-02T18:00:00Z"), // Sun
      [],
    );
    expect(result.sendsDue).toBe(0);
  });

  it("counts 2 occurrences for a Fri–Mon incident (skips weekend)", () => {
    // Fri 08:00 → Mon 18:00: Fri 09:00 and Mon 09:00 (Sat/Sun skipped)
    const result = computeGap(
      "weekdays by 09:00",
      30,
      utc("2026-07-31T08:00:00Z"), // Fri
      utc("2026-08-03T18:00:00Z"), // Mon
      [],
    );
    expect(result.sendsDue).toBe(2);
  });
});

// ── sendsArrived ──────────────────────────────────────────────────────────────

describe("computeGap — sendsArrived", () => {
  const openedAt = utc("2026-08-03T08:00:00Z");
  const resolvedAt = utc("2026-08-04T18:00:00Z");

  it("counts matched receipts that arrived after recovery", () => {
    const receipts: GapReceipt[] = [
      receipt(utc("2026-08-04T19:00:00Z"), "exp1"), // after recovery ✓
      receipt(utc("2026-08-04T20:00:00Z"), "exp1"), // after recovery ✓
    ];
    const result = computeGap("weekdays by 09:00", 30, openedAt, resolvedAt, receipts);
    expect(result.sendsArrived).toBe(2);
  });

  it("does NOT count receipts that arrived during the incident", () => {
    const receipts: GapReceipt[] = [
      receipt(utc("2026-08-03T10:00:00Z"), "exp1"), // during incident ✗
      receipt(utc("2026-08-04T17:00:00Z"), "exp1"), // during incident ✗
    ];
    const result = computeGap("weekdays by 09:00", 30, openedAt, resolvedAt, receipts);
    expect(result.sendsArrived).toBe(0);
  });

  it("does NOT count unmatched receipts (expectationId=null)", () => {
    const receipts: GapReceipt[] = [
      receipt(utc("2026-08-04T19:00:00Z"), null), // unexpected send ✗
      receipt(utc("2026-08-04T20:00:00Z"), "exp1"), // matched ✓
    ];
    const result = computeGap("weekdays by 09:00", 30, openedAt, resolvedAt, receipts);
    expect(result.sendsArrived).toBe(1);
  });

  it("the canonical scenario: 2-day pause, 2 due, 2 arrived", () => {
    // Mon 08:00 → Tue 18:00: Mon 09:00 and Tue 09:00 are due
    // Both receipts arrive after recovery
    const receipts: GapReceipt[] = [
      receipt(utc("2026-08-04T19:00:00Z"), "exp1"),
      receipt(utc("2026-08-04T20:00:00Z"), "exp1"),
    ];
    const result = computeGap(
      "weekdays by 09:00",
      30,
      utc("2026-08-03T08:00:00Z"),
      utc("2026-08-04T18:00:00Z"),
      receipts,
    );
    expect(result.sendsDue).toBe(2);
    expect(result.sendsArrived).toBe(2);
  });
});

// ── unrecognised rule ─────────────────────────────────────────────────────────

describe("computeGap — unrecognised rule", () => {
  it("returns sendsDue=0 for an unrecognised rule format", () => {
    const result = computeGap(
      "every monday",
      30,
      utc("2026-08-03T08:00:00Z"),
      utc("2026-08-04T18:00:00Z"),
      [],
    );
    expect(result.sendsDue).toBe(0);
    expect(result.sendsArrived).toBe(0);
  });
});

// ── timezone ──────────────────────────────────────────────────────────────────

describe("computeGap — timezone handling", () => {
  it("correctly counts occurrences in America/New_York (UTC-4 in summer)", () => {
    // Rule: weekdays by 09:00 America/New_York = 13:00 UTC
    // Incident: Mon 12:00 UTC → Mon 14:00 UTC
    // 09:00 NY = 13:00 UTC → falls in window
    const result = computeGap(
      "weekdays by 09:00",
      30,
      utc("2026-08-03T12:00:00Z"),
      utc("2026-08-03T14:00:00Z"),
      [],
      "America/New_York",
    );
    expect(result.sendsDue).toBe(1);
  });

  it("does not count a weekend occurrence in a non-UTC timezone", () => {
    // Sat/Sun in America/New_York
    const result = computeGap(
      "weekdays by 09:00",
      30,
      utc("2026-08-01T12:00:00Z"), // Sat NY
      utc("2026-08-02T14:00:00Z"), // Sun NY
      [],
      "America/New_York",
    );
    expect(result.sendsDue).toBe(0);
  });
});
