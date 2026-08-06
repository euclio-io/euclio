"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";

export type SettingsActionState = { error: string | null };

/**
 * Validates that a string is a plausible IANA timezone identifier.
 * We do a lightweight structural check (no external list) and rely on
 * Intl.DateTimeFormat to reject anything the runtime doesn't recognise.
 */
function isValidIANATimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  // Must look like "Region/City" or "UTC" or "Etc/UTC" etc.
  if (!/^[A-Za-z_]+(?:\/[A-Za-z_+\-]+)*$/.test(tz) && tz !== "UTC") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves the account timezone.
 *
 * Ownership: the account is resolved from the authenticated Clerk user —
 * there is no external ID to forge; the update is always scoped to the
 * caller's own account.
 */
export async function saveTimezone(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const account = await getOrCreateAccountForCurrentUser();

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone) return { error: "Timezone is required." };
  if (!isValidIANATimezone(timezone)) return { error: "Invalid timezone." };

  await prisma.account.update({
    where: { id: account.id },
    data: { timezone },
  });

  logger.info("account.timezone_updated", { accountId: account.id });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { error: null };
}
