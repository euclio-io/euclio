import { randomBytes } from "node:crypto";

/** Unguessable bearer token embedded in a Workflow's future ping URL. */
export function generateWorkflowToken(): string {
  return randomBytes(24).toString("base64url");
}
