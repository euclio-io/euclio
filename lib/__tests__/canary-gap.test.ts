import { describe, it, expect } from "vitest";
import { computeGap, isWithinWindow, type GapReceipt } from "../canary-gap";

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

// ── isWithinWindow ────────────────────────────────────────────────────────────
//
// Regression suite for the live bug found 2026-08-05:
//   A "daily by 19:05" expectation created by a Toronto user matched 19:05 UTC
//   because isWithinWindow() was UTC-only. Fixed: isWithinWindow() now lives in
//   lib/canary-gap.ts and accepts an IANA timezone parameter.

describe("isWithinWindow — UTC default (existing behaviour unchanged)", () => {
  it("returns true when now is exactly at the occurrence time", () => {
    // daily by 09:00 UTC, now = 09:00 UTC exactly
    expect(isWithinWindow(utc("2026-08-05T09:00:00Z"), "daily by 09:00", 30)).toBe(true);
  });

  it("returns true when now is within the window (before)", () => {
    // daily by 09:00 UTC, now = 08:45 UTC → 15 min before, within ±30 min
    expect(isWithinWindow(utc("2026-08-05T08:45:00Z"), "daily by 09:00", 30)).toBe(true);
  });

  it("returns true when now is within the window (after)", () => {
    // daily by 09:00 UTC, now = 09:25 UTC → 25 min after, within ±30 min
    expect(isWithinWindow(utc("2026-08-05T09:25:00Z"), "daily by 09:00", 30)).toBe(true);
  });

  it("returns false when now is outside the window", () => {
    // daily by 09:00 UTC, now = 10:00 UTC → 60 min after, outside ±30 min
    expect(isWithinWindow(utc("2026-08-05T10:00:00Z"), "daily by 09:00", 30)).toBe(false);
  });

  it("returns false for weekdays rule on a Saturday (UTC)", () => {
    // 2026-08-01 is a Saturday UTC
    expect(isWithinWindow(utc("2026-08-01T09:00:00Z"), "weekdays by 09:00", 30)).toBe(false);
  });

  it("returns false for an unrecognised rule", () => {
    expect(isWithinWindow(utc("2026-08-05T09:00:00Z"), "every monday", 30)).toBe(false);
  });
});

describe("isWithinWindow — America/Toronto timezone (the live bug scenario)", () => {
  // America/Toronto = UTC-4 in summer (EDT).
  // "daily by 19:05" Toronto = 23:05 UTC.
  // Before the fix, isWithinWindow() used UTC math and would match 19:05 UTC
  // (= 15:05 Toronto), not 23:05 UTC (= 19:05 Toronto).

  it("matches a receipt at 23:02 UTC for 'daily by 19:05' America/Toronto", () => {
    // 23:02 UTC = 19:02 Toronto EDT — within ±30 min of 19:05 Toronto
    expect(
      isWithinWindow(
        utc("2026-08-05T23:02:00Z"),
        "daily by 19:05",
        30,
        "America/Toronto",
      ),
    ).toBe(true);
  });

  it("does NOT match a receipt at 19:05 UTC for 'daily by 19:05' America/Toronto", () => {
    // 19:05 UTC = 15:05 Toronto EDT — 4 hours before the expected occurrence
    expect(
      isWithinWindow(
        utc("2026-08-05T19:05:00Z"),
        "daily by 19:05",
        30,
        "America/Toronto",
      ),
    ).toBe(false);
  });

  it("matches a receipt at 23:30 UTC (edge of window) for 'daily by 19:05' America/Toronto", () => {
    // 23:30 UTC = 19:30 Toronto EDT — exactly 25 min after 19:05, within ±30 min
    expect(
      isWithinWindow(
        utc("2026-08-05T23:30:00Z"),
        "daily by 19:05",
        30,
        "America/Toronto",
      ),
    ).toBe(true);
  });

  it("does NOT match a receipt at 23:36 UTC (just outside window) for 'daily by 19:05' America/Toronto", () => {
    // 23:36 UTC = 19:36 Toronto EDT — 31 min after 19:05, outside ±30 min
    expect(
      isWithinWindow(
        utc("2026-08-05T23:36:00Z"),
        "daily by 19:05",
        30,
        "America/Toronto",
      ),
    ).toBe(false);
  });

  it("does NOT match on a Saturday for 'weekdays by 19:05' America/Toronto", () => {
    // 2026-08-01 23:05 UTC = Sat 19:05 Toronto EDT
    expect(
      isWithinWindow(
        utc("2026-08-01T23:05:00Z"),
        "weekdays by 19:05",
        30,
        "America/Toronto",
      ),
    ).toBe(false);
  });
});

describe("isWithinWindow — DST boundary sanity (America/Toronto)", () => {
  // DST ends first Sunday of November. 2026-11-01 02:00 → 01:00 (clocks fall back).
  // "daily by 19:05" America/Toronto:
  //   Before DST end (EDT, UTC-4): 19:05 Toronto = 23:05 UTC
  //   After DST end (EST, UTC-5):  19:05 Toronto = 00:05 UTC next day

  it("matches correctly in EDT (UTC-4) before DST end", () => {
    // 2026-10-31 (Saturday before DST end) — but we use a weekday for clarity
    // 2026-10-30 (Friday) 23:05 UTC = 19:05 Toronto EDT
    expect(
      isWithinWindow(
        utc("2026-10-30T23:05:00Z"),
        "daily by 19:05",
        30,
        "America/Toronto",
      ),
    ).toBe(true);
  });

  it("matches correctly in EST (UTC-5) after DST end", () => {
    // 2026-11-02 (Monday after DST end) 00:05 UTC = 19:05 Toronto EST
    expect(
      isWithinWindow(
        utc("2026-11-02T00:05:00Z"),
        "daily by 19:05",
        30,
        "America/Toronto",
      ),
    ).toBe(true);
  });
});
