/**
 * facts.ts unit tests — honesty-critical module.
 *
 * Covered:
 * 1. Heartbeat shape — correct phrase, no explicit_fail phrase
 * 2. Explicit_fail shape — correct phrase, no heartbeat phrase
 * 3. Open incident — single line, no "Back at"
 * 4. Resolved incident — second line starts with "Back at"
 * 5. Duration formatting — sub-hour, exact-hour, multi-hour
 * 6. Timezone rendering — UTC vs America/New_York
 * 7. Banned words — comprehensive fixture across both shapes, open + resolved
 * 8. Structural firewall — facts.ts source never references errorText or ClientUpdate
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { factsForIncident, factsForQuietPeriod } from "../facts";

// ── fixtures ──────────────────────────────────────────────────────────────────

const WORKFLOW = "Booking sync";

// 9:02am UTC
const OPENED_AT = new Date("2026-06-14T09:02:00.000Z");
// 9:14am UTC — 12 minutes later
const RESOLVED_12M = new Date("2026-06-14T09:14:00.000Z");
// 10:32am UTC — 90 minutes later
const RESOLVED_90M = new Date("2026-06-14T10:32:00.000Z");
// 11:02am UTC — exactly 2 hours later
const RESOLVED_2H = new Date("2026-06-14T11:02:00.000Z");

// ── 1. Heartbeat shape ────────────────────────────────────────────────────────

describe("heartbeat shape", () => {
  it("contains 'stopped checking in at'", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT);
    expect(lines[0]).toContain("stopped checking in at");
  });

  it("does NOT contain 'reported a failure'", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT);
    expect(lines[0]).not.toContain("reported a failure");
  });

  it("includes the workflow name", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT);
    expect(lines[0]).toContain(WORKFLOW);
  });
});

// ── 2. Explicit_fail shape ────────────────────────────────────────────────────

describe("explicit_fail shape", () => {
  it("contains 'reported a failure at'", () => {
    const lines = factsForIncident(WORKFLOW, "explicit_fail", OPENED_AT);
    expect(lines[0]).toContain("reported a failure at");
  });

  it("does NOT contain 'stopped checking in'", () => {
    const lines = factsForIncident(WORKFLOW, "explicit_fail", OPENED_AT);
    expect(lines[0]).not.toContain("stopped checking in");
  });

  it("includes the workflow name", () => {
    const lines = factsForIncident(WORKFLOW, "explicit_fail", OPENED_AT);
    expect(lines[0]).toContain(WORKFLOW);
  });
});

// ── 3. Open incident ──────────────────────────────────────────────────────────

describe("open incident (no resolvedAt)", () => {
  it("returns exactly one line", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT);
    expect(lines).toHaveLength(1);
  });

  it("does not contain 'Back at'", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT);
    expect(lines.join(" ")).not.toContain("Back at");
  });

  it("returns one line when resolvedAt is null", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, null);
    expect(lines).toHaveLength(1);
  });
});

// ── 4. Resolved incident ──────────────────────────────────────────────────────

describe("resolved incident", () => {
  it("returns exactly two lines", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, RESOLVED_12M);
    expect(lines).toHaveLength(2);
  });

  it("second line starts with 'Back at'", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, RESOLVED_12M);
    expect(lines[1]).toMatch(/^Back at /);
  });

  it("second line contains the duration", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, RESOLVED_12M);
    expect(lines[1]).toContain("12 min");
  });
});

// ── 5. Duration formatting ────────────────────────────────────────────────────

describe("duration formatting", () => {
  it("sub-hour: '12 min'", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, RESOLVED_12M);
    expect(lines[1]).toContain("12 min");
  });

  it("90 minutes: '1h 30m'", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, RESOLVED_90M);
    expect(lines[1]).toContain("1h 30m");
  });

  it("exactly 2 hours: '2h' (no trailing '0m')", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, RESOLVED_2H);
    expect(lines[1]).toContain("2h");
    expect(lines[1]).not.toContain("0m");
  });

  it("1 minute: '1 min'", () => {
    const oneMinLater = new Date(OPENED_AT.getTime() + 60_000);
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, oneMinLater);
    expect(lines[1]).toContain("1 min");
  });
});

// ── 6. Timezone rendering ─────────────────────────────────────────────────────

describe("timezone rendering", () => {
  it("UTC: 9:02am", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, undefined, "UTC");
    expect(lines[0]).toContain("9:02am");
  });

  it("America/New_York (UTC-4 in June): 5:02am", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, undefined, "America/New_York");
    // UTC-4 in June (EDT)
    expect(lines[0]).toContain("5:02am");
  });

  it("resolved line uses the same timezone", () => {
    const lines = factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, RESOLVED_12M, "UTC");
    expect(lines[1]).toContain("9:14am");
  });
});

// ── 7. Banned words ───────────────────────────────────────────────────────────
//
// These words/phrases must NEVER appear in any output from factsForIncident,
// regardless of shape, resolution state, or timezone.
//
// Categories (from CLAUDE.md + Euclio_note_spec_M5-5_compose_requirements.md):
//   Severity/impact:      brief, minor, hiccup, smoothly, nothing was missed,
//                         no impact, all good, everything is fine
//   Inference:            would have, were affected, runs lost
//   Recovery promises:    should be back, expect it fixed, within the hour
//   Abstract pain:        any inconvenience, may have been affected, some users
//   Passive constructions: has been implemented, has been resolved
//   Meta:                 severity (the word itself)
//   Reassurance:          nothing was missed, no impact

const BANNED_PHRASES = [
  "brief",
  "minor",
  "hiccup",
  "smoothly",
  "nothing was missed",
  "no impact",
  "all good",
  "everything is fine",
  "would have",
  "were affected",
  "runs lost",
  "should be back",
  "expect it fixed",
  "within the hour",
  "any inconvenience",
  "may have been affected",
  "some users",
  "has been implemented",
  "has been resolved",
  "severity",
];

// All combinations to test: both shapes × open/resolved
const BANNED_FIXTURES: Array<{ label: string; lines: string[] }> = [
  {
    label: "heartbeat open",
    lines: factsForIncident(WORKFLOW, "heartbeat", OPENED_AT),
  },
  {
    label: "heartbeat resolved",
    lines: factsForIncident(WORKFLOW, "heartbeat", OPENED_AT, RESOLVED_12M),
  },
  {
    label: "explicit_fail open",
    lines: factsForIncident(WORKFLOW, "explicit_fail", OPENED_AT),
  },
  {
    label: "explicit_fail resolved",
    lines: factsForIncident(WORKFLOW, "explicit_fail", OPENED_AT, RESOLVED_12M),
  },
];

describe("banned words", () => {
  for (const fixture of BANNED_FIXTURES) {
    for (const phrase of BANNED_PHRASES) {
      it(`[${fixture.label}] never contains "${phrase}"`, () => {
        const combined = fixture.lines.join(" ").toLowerCase();
        expect(combined).not.toContain(phrase.toLowerCase());
      });
    }
  }
});

// ── 9. factsForQuietPeriod ────────────────────────────────────────────────────

// Jun 14, 2026 at 9:02am UTC — used as sinceDate
const SINCE_DATE = new Date("2026-06-14T09:02:00.000Z");

describe("factsForQuietPeriod — basic shape", () => {
  it("returns one line when no canary receipts", () => {
    const lines = factsForQuietPeriod({ sinceDate: SINCE_DATE, checkinCount: 42 });
    expect(lines).toHaveLength(1);
  });

  it("first line contains check-in count", () => {
    const lines = factsForQuietPeriod({ sinceDate: SINCE_DATE, checkinCount: 42 });
    expect(lines[0]).toContain("42");
  });

  it("first line contains 'check-ins'", () => {
    const lines = factsForQuietPeriod({ sinceDate: SINCE_DATE, checkinCount: 42 });
    expect(lines[0]).toContain("check-ins");
  });

  it("singular: '1 check-in'", () => {
    const lines = factsForQuietPeriod({ sinceDate: SINCE_DATE, checkinCount: 1 });
    expect(lines[0]).toContain("1 check-in");
    expect(lines[0]).not.toContain("check-ins");
  });

  it("first line contains 'since'", () => {
    const lines = factsForQuietPeriod({ sinceDate: SINCE_DATE, checkinCount: 42 });
    expect(lines[0]).toContain("since");
  });

  it("first line contains the formatted date (UTC)", () => {
    const lines = factsForQuietPeriod({ sinceDate: SINCE_DATE, checkinCount: 42, timezone: "UTC" });
    // Jun 14, 2026
    expect(lines[0]).toContain("Jun 14, 2026");
  });

  it("date respects timezone (America/New_York UTC-4 in June → Jun 14)", () => {
    // 9:02am UTC = 5:02am EDT — still Jun 14
    const lines = factsForQuietPeriod({
      sinceDate: SINCE_DATE,
      checkinCount: 10,
      timezone: "America/New_York",
    });
    expect(lines[0]).toContain("Jun 14, 2026");
  });
});

describe("factsForQuietPeriod — canary line", () => {
  it("returns two lines when receiptsVerified > 0", () => {
    const lines = factsForQuietPeriod({
      sinceDate: SINCE_DATE,
      checkinCount: 42,
      receiptsVerified: 7,
    });
    expect(lines).toHaveLength(2);
  });

  it("second line contains receipts count", () => {
    const lines = factsForQuietPeriod({
      sinceDate: SINCE_DATE,
      checkinCount: 42,
      receiptsVerified: 7,
    });
    expect(lines[1]).toContain("7");
  });

  it("second line contains 'verified at the canary'", () => {
    const lines = factsForQuietPeriod({
      sinceDate: SINCE_DATE,
      checkinCount: 42,
      receiptsVerified: 7,
    });
    expect(lines[1]).toContain("verified at the canary");
  });

  it("singular: '1 send verified at the canary'", () => {
    const lines = factsForQuietPeriod({
      sinceDate: SINCE_DATE,
      checkinCount: 5,
      receiptsVerified: 1,
    });
    expect(lines[1]).toContain("1 send verified at the canary");
    expect(lines[1]).not.toContain("sends");
  });

  it("returns one line when receiptsVerified is 0", () => {
    const lines = factsForQuietPeriod({
      sinceDate: SINCE_DATE,
      checkinCount: 42,
      receiptsVerified: 0,
    });
    expect(lines).toHaveLength(1);
  });

  it("returns one line when receiptsVerified is undefined", () => {
    const lines = factsForQuietPeriod({
      sinceDate: SINCE_DATE,
      checkinCount: 42,
    });
    expect(lines).toHaveLength(1);
  });
});

// Banned words for factsForQuietPeriod — same list, all fixtures
const QUIET_BANNED_FIXTURES: Array<{ label: string; lines: string[] }> = [
  {
    label: "quiet no canary",
    lines: factsForQuietPeriod({ sinceDate: SINCE_DATE, checkinCount: 42 }),
  },
  {
    label: "quiet with canary",
    lines: factsForQuietPeriod({ sinceDate: SINCE_DATE, checkinCount: 42, receiptsVerified: 7 }),
  },
];

describe("banned words — factsForQuietPeriod", () => {
  for (const fixture of QUIET_BANNED_FIXTURES) {
    for (const phrase of BANNED_PHRASES) {
      it(`[${fixture.label}] never contains "${phrase}"`, () => {
        const combined = fixture.lines.join(" ").toLowerCase();
        expect(combined).not.toContain(phrase.toLowerCase());
      });
    }
  }
});

// ── 8. Structural firewall ────────────────────────────────────────────────────
//
// facts.ts must never reference errorText or ClientUpdate.
// This is a static source-text assertion — no DB, no runtime.
// It is the structural guard that keeps the diagnostic out of the compose path.

describe("structural firewall", () => {
  // Strip JSDoc/line comments before checking — the doc may legitimately
  // mention these names to explain what is NOT included. What must never
  // appear is a code-level reference (import, property access, type usage).
  function codeOnly(src: string): string {
    // Remove block comments (/** ... */ and /* ... */)
    let s = src.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove line comments (// ...)
    s = s.replace(/\/\/.*/g, "");
    return s;
  }

  it("facts.ts code does not reference errorText", () => {
    const src = readFileSync(resolve(__dirname, "../facts.ts"), "utf8");
    expect(codeOnly(src)).not.toMatch(/errorText/);
  });

  it("facts.ts code does not reference ClientUpdate", () => {
    const src = readFileSync(resolve(__dirname, "../facts.ts"), "utf8");
    expect(codeOnly(src)).not.toMatch(/ClientUpdate/);
  });

  it("facts.ts source does not import from prisma (no DB access)", () => {
    const src = readFileSync(resolve(__dirname, "../facts.ts"), "utf8");
    expect(src).not.toMatch(/from.*prisma/i);
    expect(src).not.toMatch(/from.*generated/i);
  });
});
