import { randomBytes } from "node:crypto";

/** Unguessable bearer token embedded in a Workflow's future ping URL. */
export function generateWorkflowToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Unguessable public slug for a ClientUpdate's no-login receipt page.
 * Prefixed "cu_" so it's identifiable in logs without being guessable.
 */
export function generatePublicSlug(): string {
  return `cu_${randomBytes(18).toString("base64url")}`;
}

/**
 * Canary email address for a workflow.
 * Format: canary-<cuid-like random>@euclio.io
 * Globally unique and unguessable — the address IS the access token.
 */
export function generateCanaryAddress(): string {
  return `canary-${randomBytes(12).toString("base64url")}@euclio.io`;
}
