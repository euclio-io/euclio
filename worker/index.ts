/**
 * Euclio watcher worker — M3 slice.
 *
 * Long-running process that reconciles workflow status every N seconds.
 * Runs on Railway as a separate service from the web app.
 *
 * Responsibilities:
 * - Reconcile: process every workflow overdue since the last check, idempotently.
 * - Debounce: require sustained-down duration before opening an incident.
 * - Dead-man's-switch: ping an external monitor each run.
 * - Nightly purge: NULL errorText older than 30 days.
 */

import { logger } from "@/lib/logger";
import { reconcile } from "./watcher";
import { purgeOldErrorText } from "./purge";
import { pingDeadmansSwitch } from "./deadmans";

const RECONCILE_INTERVAL_MS = 30_000; // 30 seconds
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function main() {
  logger.info("watcher.start", {
    reconcileIntervalMs: RECONCILE_INTERVAL_MS,
    purgeIntervalMs: PURGE_INTERVAL_MS,
  });

  // Reconcile loop.
  setInterval(async () => {
    try {
      await reconcile();
      await pingDeadmansSwitch();
    } catch (err) {
      logger.error("watcher.reconcile.error", { error: err });
    }
  }, RECONCILE_INTERVAL_MS);

  // Purge loop (runs once per day).
  setInterval(async () => {
    try {
      await purgeOldErrorText();
    } catch (err) {
      logger.error("watcher.purge.error", { error: err });
    }
  }, PURGE_INTERVAL_MS);

  // Run reconcile once immediately on startup.
  try {
    await reconcile();
    await pingDeadmansSwitch();
  } catch (err) {
    logger.error("watcher.startup.error", { error: err });
  }

  logger.info("watcher.ready");
}

main().catch((err) => {
  logger.error("watcher.fatal", { error: err });
  process.exit(1);
});
