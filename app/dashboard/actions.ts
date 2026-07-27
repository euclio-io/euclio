"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { generateWorkflowToken } from "@/lib/token";

export type ActionState = { error: string | null };

// Workflow.expectedIntervalMinutes/graceMinutes are Postgres INT4 columns;
// an unbounded value would throw an uncaught DB error instead of a friendly
// form message, so both fields are bounded here at the input boundary.
const INT32_MAX = 2_147_483_647;

export async function createClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getOrCreateAccountForCurrentUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Client name is required." };

  const client = await prisma.client.create({ data: { accountId: account.id, name } });
  logger.info("client.created", { accountId: account.id, clientId: client.id });
  revalidatePath("/dashboard");
  return { error: null };
}

export async function createWorkflow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getOrCreateAccountForCurrentUser();

  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const intervalRaw = Number(formData.get("expectedIntervalMinutes"));
  const graceRaw = formData.get("graceMinutes");

  if (!name) return { error: "Workflow name is required." };
  if (!Number.isInteger(intervalRaw) || intervalRaw <= 0 || intervalRaw > INT32_MAX) {
    return { error: "Expected interval must be a whole number of minutes, greater than 0." };
  }
  let graceMinutes: number | undefined;
  if (graceRaw !== null && graceRaw !== "") {
    const g = Number(graceRaw);
    if (!Number.isInteger(g) || g < 0 || g > INT32_MAX) {
      return { error: "Grace period must be a whole number of minutes, 0 or more." };
    }
    graceMinutes = g;
  }

  // Ownership check baked into the query itself — never a follow-up JS
  // equality check. This is the tenant boundary CLAUDE.md treats as the
  // highest-severity review gate: a forged clientId must never let a
  // workflow attach to another account's client.
  const client = await prisma.client.findFirst({
    where: { id: clientId, accountId: account.id, archivedAt: null },
    select: { id: true },
  });
  if (!client) return { error: "Client not found." }; // deliberately vague across tenants

  const workflow = await prisma.workflow.create({
    data: {
      clientId: client.id,
      name,
      token: generateWorkflowToken(),
      expectedIntervalMinutes: intervalRaw,
      ...(graceMinutes !== undefined ? { graceMinutes } : {}),
      // status intentionally omitted — must default to "pending"; the
      // watcher is the only writer of "healthy".
    },
  });
  logger.info("workflow.created", {
    accountId: account.id,
    clientId: client.id,
    workflowId: workflow.id,
  });
  revalidatePath("/dashboard");
  return { error: null };
}
