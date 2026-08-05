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
          display: "block",
          width: "100%",
          fontSize: "13px",
          fontWeight: 600,
          borderRadius: "8px",
          padding: "9px 14px",
          border: "1px solid var(--border-2)",
          background: "#fff",
          color: "var(--t2)",
          boxShadow: "var(--sh)",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
          textAlign: "center",
        }}
      >
        {pending ? "Enabling…" : "Enable canary"}
      </button>
      <p
        style={{
          marginTop: "8px",
          fontSize: "12px",
          color: "var(--t3)",
          lineHeight: "1.5",
        }}
      >
        Adds a silent recipient address that verifies real sends arrive.
      </p>
      {state.error && (
        <p
          role="alert"
          style={{
            marginTop: "6px",
            fontSize: "12px",
            color: "var(--amber-tx)",
          }}
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
