/**
 * Smoke harness — run with `npm run smoke`.
 *
 * Required env:  APP_URL  (e.g. https://euclio-production.up.railway.app)
 * Optional env:  SMOKE_WORKFLOW_TOKEN  — if set, POSTs a ping and asserts 2xx.
 *
 * Zero new dependencies: uses Node 22 built-in fetch.
 * Exit 0 = all checks passed.  Exit 1 = any check failed.
 */
export {};

const base = process.env.APP_URL?.replace(/\/$/, "");
if (!base) {
  console.error("ERROR: APP_URL is not set.");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function ok(label: string): void {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label: string, detail?: string): void {
  console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

// ── 1. Health check ──────────────────────────────────────────────────────────

console.log(`\nSmoke: ${base}\n`);
console.log("── /api/health ─────────────────────────────────────────────────");

const healthRes = await fetch(`${base}/api/health`);
if (healthRes.status === 200) {
  const body = (await healthRes.json()) as { status?: string };
  if (body.status === "ok") {
    ok(`GET /api/health → 200 { status: "ok" }`);
  } else {
    fail(`GET /api/health → 200 but body.status is "${body.status}" (expected "ok")`);
  }
} else {
  fail(`GET /api/health → ${healthRes.status} (expected 200)`);
  // Drain body to avoid resource leak
  await healthRes.text().catch(() => undefined);
}

// ── 2. Ping (optional) ───────────────────────────────────────────────────────

console.log("\n── /api/ping/[token] ───────────────────────────────────────────");

const token = process.env.SMOKE_WORKFLOW_TOKEN;
if (!token) {
  console.log("  –  SMOKE_WORKFLOW_TOKEN not set — ping check skipped.");
} else {
  const pingRes = await fetch(`${base}/api/ping/${token}`, { method: "POST" });
  if (pingRes.status >= 200 && pingRes.status < 300) {
    ok(`POST /api/ping/[token] → ${pingRes.status}`);
  } else {
    fail(`POST /api/ping/[token] → ${pingRes.status} (expected 2xx)`);
  }
  await pingRes.text().catch(() => undefined);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
