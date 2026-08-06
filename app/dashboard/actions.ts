"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreateAccountForCurrentUser } from "@/lib/account";
import { generateWorkflowToken, generatePublicSlug, generateCanaryAddress } from "@/lib/token";

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
  // slot2 is posted separately so the server can enforce the mandatory-read rule
  // structurally, regardless of how bodyText was assembled.
  const slot2 = String(formData.get("slot2") ?? "").trim();
  const markSent = formData.get("markSent") === "1";

  if (!incidentId) return { error: "Incident ID is required." };
  if (!clientId) return { error: "Client ID is required." };
  if (!bodyText) return { error: "Note body is required." };
  // Structural guard: slot 2 ("what it means for you") must be non-empty.
  // The client enforces this too, but this is the authoritative server-side check.
  if (!slot2) return { error: "Your read (slot 2) is required." };

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

export async function enableCanary(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getOrCreateAccountForCurrentUser();

  const workflowId = String(formData.get("workflowId") ?? "");

  // Ownership check: workflow → client → accountId.
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, client: { accountId: account.id }, archivedAt: null },
    select: { id: true, canaryAddress: true },
  });
  if (!workflow) return { error: "Workflow not found." };
  if (workflow.canaryAddress) return { error: null }; // already enabled — idempotent

  const canaryAddress = generateCanaryAddress();
  await prisma.workflow.update({
    where: { id: workflowId },
    data: { canaryAddress },
  });

  logger.info("workflow.canary_enabled", { accountId: account.id, workflowId });
  revalidatePath("/dashboard");
  return { error: null };
}

export async function createExpectation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getOrCreateAccountForCurrentUser();

  const workflowId = String(formData.get("workflowId") ?? "");
  const rule = String(formData.get("rule") ?? "").trim();
  const windowMinsRaw = Number(formData.get("windowMins") ?? "30");

  if (!rule) return { error: "Schedule rule is required." };
  if (!rule.match(/^(daily|weekdays)\s+by\s+\d{1,2}:\d{2}$/i)) {
    return { error: 'Rule must be "daily by HH:MM" or "weekdays by HH:MM".' };
  }
  if (!Number.isInteger(windowMinsRaw) || windowMinsRaw < 1 || windowMinsRaw > 1440) {
    return { error: "Window must be between 1 and 1440 minutes." };
  }

  // Ownership check.
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, client: { accountId: account.id }, archivedAt: null },
    select: { id: true },
  });
  if (!workflow) return { error: "Workflow not found." };

  await prisma.canaryExpectation.create({
    data: { workflowId: workflow.id, rule, windowMins: windowMinsRaw },
  });

  logger.info("canary_expectation.created", { accountId: account.id, workflowId });
  revalidatePath("/dashboard");
  return { error: null };
}

export async function deactivateExpectation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getOrCreateAccountForCurrentUser();

  const expectationId = String(formData.get("expectationId") ?? "");
  if (!expectationId) return { error: "Expectation ID is required." };

  // Ownership check: expectation → workflow → client → accountId.
  const expectation = await prisma.canaryExpectation.findFirst({
    where: {
      id: expectationId,
      workflow: { client: { accountId: account.id } },
    },
    select: { id: true, workflowId: true },
  });
  if (!expectation) return { error: "Expectation not found." };

  await prisma.canaryExpectation.update({
    where: { id: expectation.id },
    data: { active: false },
  });

  logger.info("canary_expectation.deactivated", {
    accountId: account.id,
    workflowId: expectation.workflowId,
    expectationId: expectation.id,
  });
  revalidatePath("/dashboard");
  return { error: null };
}

export async function createAllClearUpdate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getOrCreateAccountForCurrentUser();

  const clientId = String(formData.get("clientId") ?? "");
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  // slot2 is posted separately so the server can enforce the mandatory-read rule
  // structurally, regardless of how bodyText was assembled.
  const slot2 = String(formData.get("slot2") ?? "").trim();
  const markSent = formData.get("markSent") === "1";
  const coversFromRaw = String(formData.get("coversFrom") ?? "");
  const coversToRaw = String(formData.get("coversTo") ?? "");

  if (!clientId) return { error: "Client ID is required." };
  if (!bodyText) return { error: "Note body is required." };
  // Structural guard: slot 2 ("what it means for you") must be non-empty.
  // The client enforces this too, but this is the authoritative server-side check.
  if (!slot2) return { error: "Your read (slot 2) is required." };

  // Ownership check: client must belong to this account.
  const client = await prisma.client.findFirst({
    where: { id: clientId, accountId: account.id, archivedAt: null },
    select: { id: true },
  });
  if (!client) return { error: "Client not found." };

  // Guard: no open incidents for this client (all-clear is only valid when quiet).
  const openIncidentCount = await prisma.incident.count({
    where: {
      status: "open",
      workflow: { clientId, client: { accountId: account.id } },
    },
  });
  if (openIncidentCount > 0) {
    return { error: "Cannot send an all-clear while incidents are open." };
  }

  // Look up the User row for authorUserId.
  const user = await prisma.user.findFirst({
    where: { clerkUserId: userId, accountId: account.id },
    select: { id: true },
  });
  if (!user) return { error: "User not found." };

  const slug = generatePublicSlug();
  const now = new Date();
  const coversFrom = coversFromRaw ? new Date(coversFromRaw) : null;
  const coversTo = coversToRaw ? new Date(coversToRaw) : now;

  const update = await prisma.clientUpdate.create({
    data: {
      accountId: account.id,
      clientId: client.id,
      authorUserId: user.id,
      kind: "all_clear",
      bodyText,
      publicSlug: slug,
      coversFrom,
      coversTo,
      sentAt: markSent ? now : null,
    },
    select: { id: true, publicSlug: true },
  });

  logger.info("client_update.all_clear.created", {
    accountId: account.id,
    clientId: client.id,
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
