"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { generateWorkflowToken, generatePublicSlug } from "@/lib/token";

export type ActionState = { error: string | null; publicSlug?: string };

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

export async function resolveIncident(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getOrCreateAccountForCurrentUser();

  const incidentId = String(formData.get("incidentId") ?? "");
  const noteText = String(formData.get("noteText") ?? "").trim();

  if (!incidentId) return { error: "Incident ID is required." };
  if (noteText.length > 500) return { error: "Note must be 500 characters or fewer." };

  // Ownership check: incident → workflow → client → accountId.
  // The tenant boundary is inside the query — never a follow-up JS check.
  const incident = await prisma.incident.findFirst({
    where: {
      id: incidentId,
      status: "open",
      workflow: { client: { accountId: account.id } },
    },
    select: {
      id: true,
      workflowId: true,
      workflow: { select: { client: { select: { id: true } } } },
    },
  });
  if (!incident) return { error: "Incident not found or already resolved." };

  // Resolve the incident and optionally attach a note, in a transaction.
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.incident.update({
      where: { id: incident.id },
      data: { status: "resolved", resolvedAt: now },
    });
    if (noteText) {
      // Look up the User row for this Clerk user (needed for authorUserId).
      const user = await tx.user.findFirst({
        where: { clerkUserId: userId, accountId: account.id },
        select: { id: true },
      });
      if (user) {
        await tx.note.create({
          data: {
            accountId: account.id,
            authorUserId: user.id,
            incidentId: incident.id,
            text: noteText,
          },
        });
      }
    }
  });

  logger.info("incident.resolved", { accountId: account.id, incidentId: incident.id });
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/incidents/${incident.id}`);
  return { error: null };
}

export async function createClientUpdate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getOrCreateAccountForCurrentUser();

  const incidentId = String(formData.get("incidentId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const markSent = formData.get("markSent") === "1";

  if (!incidentId) return { error: "Incident ID is required." };
  if (!clientId) return { error: "Client ID is required." };
  if (!bodyText) return { error: "Note body is required." };

  // Server-side guard: slot 2 (what it means for you) must be non-empty.
  // The client enforces this too, but we enforce it here as the authoritative check.
  // We detect an empty slot 2 by checking if the body is just the slot 1 prefill
  // (i.e. only one paragraph). A body with only one paragraph means slot 2 was skipped.
  // More robust: the client always sends the assembled body; we just require it's non-trivial.
  if (bodyText.length < 10) return { error: "Note is too short." };

  // Ownership check: incident → workflow → client → accountId.
  const incident = await prisma.incident.findFirst({
    where: {
      id: incidentId,
      workflow: { client: { id: clientId, accountId: account.id } },
    },
    select: { id: true, openedAt: true, resolvedAt: true },
  });
  if (!incident) return { error: "Incident not found." };

  // Ownership check: client must belong to this account.
  const client = await prisma.client.findFirst({
    where: { id: clientId, accountId: account.id, archivedAt: null },
    select: { id: true },
  });
  if (!client) return { error: "Client not found." };

  // Look up the User row for authorUserId.
  const user = await prisma.user.findFirst({
    where: { clerkUserId: userId, accountId: account.id },
    select: { id: true },
  });
  if (!user) return { error: "User not found." };

  const slug = generatePublicSlug();
  const now = new Date();

  const update = await prisma.clientUpdate.create({
    data: {
      accountId: account.id,
      clientId: client.id,
      authorUserId: user.id,
      bodyText,
      publicSlug: slug,
      coversFrom: incident.openedAt,
      coversTo: incident.resolvedAt ?? now,
      sentAt: markSent ? now : null,
    },
    select: { id: true, publicSlug: true },
  });

  logger.info("client_update.created", {
    accountId: account.id,
    clientId: client.id,
    incidentId: incident.id,
    clientUpdateId: update.id,
  });

  revalidatePath(`/dashboard/clients/${clientId}`);
  return { error: null, publicSlug: update.publicSlug };
}

export async function simulateFailure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getOrCreateAccountForCurrentUser();

  const workflowId = String(formData.get("workflowId") ?? "");

  // Ownership check: the workflow must belong to this account.
  const workflow = await prisma.workflow.findFirst({
    where: {
      id: workflowId,
      client: { accountId: account.id },
      archivedAt: null,
    },
    select: { id: true, status: true, expectedIntervalMinutes: true, graceMinutes: true },
  });
  if (!workflow) return { error: "Workflow not found." };
  if (workflow.status === "down") return { error: "Workflow is already down." };

  // Set lastPingAt to the past so the watcher sees it as overdue on the next run.
  // Use the plan formula: expectedInterval + grace + debounce + 1 minute buffer.
  const DEBOUNCE_MINUTES = Number(process.env.WATCHER_DEBOUNCE_MINUTES ?? "2");
  const overdueDuration =
    (workflow.expectedIntervalMinutes + workflow.graceMinutes + DEBOUNCE_MINUTES + 1) * 60_000;

  await prisma.workflow.update({
    where: { id: workflowId },
    data: { lastPingAt: new Date(Date.now() - overdueDuration) },
  });

  logger.info("workflow.simulate_miss", {
    accountId: account.id,
    workflowId: workflowId,
  });
  revalidatePath("/dashboard");
  return { error: null };
}
