/**
 * Euclio watcher worker — M3 slice.
 *
 * Long-running process that reconciles workflow status every minute.
 * Runs on Railway as a separate service from the web app.
 *
 * Responsibilities:
 * - Reconcile: process every workflow overdue since the last check, idempotently.
 * - Debounce: require sustained-down duration before opening an incident.
 * - Dead-man's-switch: ping an external monitor each run.
 * - Nightly purge: NULL errorText older than 30 days (runs at 02:00 UTC).
 */

import cron from "node-cron";
import { logger } from "@/lib/logger";
import { reconcile } from "./watcher";
import { purgeOldErrorText } from "./purge";
import { pingDeadmansSwitch } from "./deadmans";

async function main() {
  logger.info("watcher.start");

  // Reconcile every minute.
  cron.schedule("* * * * *", async () => {
    try {
      await reconcile();
      await pingDeadmansSwitch();
    } catch (err) {
      logger.error("watcher.reconcile.error", { error: err });
    }
  });

  // Purge at 02:00 UTC every day.
  cron.schedule("0 2 * * *", async () => {
    try {
      await purgeOldErrorText();
    } catch (err) {
      logger.error("watcher.purge.error", { error: err });
    }
  });

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
