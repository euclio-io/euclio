/**
 * Euclio nightly purge — M3 slice.
 *
 * Deletes errorText from incidents older than 30 days.
 * The incident record itself is never deleted — only the diagnostic data.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const ERROR_TEXT_TTL_DAYS = 30;

export async function purgeOldErrorText(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - ERROR_TEXT_TTL_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.incident.updateMany({
    where: {
      openedAt: { lt: cutoff },
      errorText: { not: null },
    },
    data: {
      errorText: null,
      errorRedactedByServer: false,
    },
  });

  logger.info("watcher.purge.complete", {
    incidentsUpdated: result.count,
    cutoffDate: cutoff.toISOString(),
  });
}
