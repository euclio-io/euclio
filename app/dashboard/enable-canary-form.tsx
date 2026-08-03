"use client";

import { useActionState } from "react";
import { enableCanary, type ActionState } from "./actions";

export function EnableCanaryForm({ workflowId }: { workflowId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(enableCanary, {
    error: null,
  });

  return (
    <form action={action}>
      <input type="hidden" name="workflowId" value={workflowId} />
      <button
        type="submit"
        disabled={pending}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--pine)",
          background: "none",
          border: "none",
          cursor: pending ? "default" : "pointer",
          padding: 0,
          opacity: pending ? 0.5 : 1,
        }}
      >
        {pending ? "enabling…" : "enable canary →"}
      </button>
      {state.error && (
        <span
          role="alert"
          style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--amber-deep)", marginLeft: "8px" }}
        >
          {state.error}
        </span>
      )}
    </form>
  );
}
