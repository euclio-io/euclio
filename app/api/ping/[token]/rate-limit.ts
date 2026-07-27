// In-memory fixed-window limiter, scoped to ingest only — never imported by
// dashboard/watcher code. Correct only under a single web instance (see
// docs/plans / CLAUDE.md's own extraction trigger). Keyed by resolved
// workflow.id, never the raw token, so map size is bounded by real workflows
// that exist, not by attacker-supplied garbage.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const SWEEP_INTERVAL_MS = 5 * 60_000;

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

let sweepStarted = false;
function ensureSweep() {
  if (sweepStarted) return;
  sweepStarted = true;
  setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, bucket] of buckets) {
      if (bucket.windowStart < cutoff) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS).unref();
}

/** true = allowed, false = caller should get a 429. */
export function checkRateLimit(workflowId: string): boolean {
  ensureSweep();
  const now = Date.now();
  const bucket = buckets.get(workflowId);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(workflowId, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}
