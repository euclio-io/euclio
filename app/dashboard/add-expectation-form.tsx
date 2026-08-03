"use client";

import { useActionState } from "react";
import { createExpectation, type ActionState } from "./actions";

export function AddExpectationForm({ workflowId }: { workflowId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createExpectation, {
    error: null,
  });

  return (
    <form action={action} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "6px" }}>
      <input type="hidden" name="workflowId" value={workflowId} />
      <input
        type="text"
        name="rule"
        placeholder="weekdays by 09:05"
        required
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          padding: "3px 6px",
          border: "1px solid var(--hair-2)",
          borderRadius: "4px",
          background: "var(--paper)",
          color: "var(--ink)",
          width: "160px",
        }}
      />
      <input
        type="number"
        name="windowMins"
        defaultValue={30}
        min={1}
        max={1440}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          padding: "3px 6px",
          border: "1px solid var(--hair-2)",
          borderRadius: "4px",
          background: "var(--paper)",
          color: "var(--ink)",
          width: "60px",
        }}
      />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--ink-2)" }}>
        min window
      </span>
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
        {pending ? "saving…" : "add →"}
      </button>
      {state.error && (
        <span
          role="alert"
          style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--amber-deep)", width: "100%" }}
        >
          {state.error}
        </span>
      )}
    </form>
  );
}
