/**
 * Euclio dead-man's-switch — M3 slice.
 *
 * Pings an external monitor (Healthchecks.io or cron-job.org) after each
 * reconciliation pass. If the watcher dies, the external monitor alerts.
 *
 * If DEADMANS_SWITCH_URL is not set, logs a one-time warning at startup and skips silently.
 */

import { logger } from "@/lib/logger";

let warnedOnce = false;

export async function pingDeadmansSwitch(): Promise<void> {
  const url = process.env.DEADMANS_SWITCH_URL;
  if (!url) {
    if (!warnedOnce) {
      logger.warn("watcher.deadmans.skipped", { reason: "DEADMANS_SWITCH_URL not set" });
      warnedOnce = true;
    }
    return;
  }

  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      logger.warn("watcher.deadmans.failed", {
        status: response.status,
        statusText: response.statusText,
      });
      return;
    }
    logger.debug("watcher.deadmans.ok");
  } catch (err) {
    logger.error("watcher.deadmans.error", { error: err });
  }
}
