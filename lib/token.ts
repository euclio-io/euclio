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
