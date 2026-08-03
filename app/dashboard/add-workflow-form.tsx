"use client";

import { useActionState } from "react";
import { createWorkflow, type ActionState } from "./actions";

const initial: ActionState = { error: null };

const inputStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  padding: "6px 10px",
  border: "1px solid var(--hair-2)",
  borderRadius: "6px",
  background: "var(--lift)",
  color: "var(--ink)",
  outline: "none",
};

/**
 * compact=true  → inline pill "add workflow" button (used in ledger workflow row)
 * compact=false → full labelled form (used on dashboard)
 */
export function AddWorkflowForm({
  clientId,
  compact = false,
}: {
  clientId: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createWorkflow, initial);

  if (compact) {
    return (
      <form
        action={formAction}
        style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}
      >
        <input type="hidden" name="clientId" value={clientId} />
        <input
          name="name"
          required
          placeholder="Workflow name"
          style={{ ...inputStyle, width: "130px" }}
        />
        <input
          name="expectedIntervalMinutes"
          type="number"
          min={1}
          required
          placeholder="interval min"
          style={{ ...inputStyle, width: "90px" }}
        />
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
          {pending ? "adding…" : "+ add →"}
        </button>
        {state.error && (
          <span
            role="alert"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--amber-deep)",
              width: "100%",
            }}
          >
            {state.error}
          </span>
        )}
      </form>
    );
  }

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "10px" }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8.5px",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
          }}
        >
          Workflow name
        </span>
        <input
          name="name"
          required
          style={{ ...inputStyle, width: "180px" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8.5px",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
          }}
        >
          Interval (min)
        </span>
        <input
          name="expectedIntervalMinutes"
          type="number"
          min={1}
          required
          style={{ ...inputStyle, width: "90px" }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8.5px",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
          }}
        >
          Grace (min, opt)
        </span>
        <input
          name="graceMinutes"
          type="number"
          min={0}
          placeholder="5"
          style={{ ...inputStyle, width: "90px" }}
        />
      </div>
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
          padding: "0 0 6px",
          opacity: pending ? 0.5 : 1,
        }}
      >
        {pending ? "adding…" : "add workflow →"}
      </button>
      {state.error && (
        <span
          role="alert"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--amber-deep)",
            width: "100%",
          }}
        >
          {state.error}
        </span>
      )}
    </form>
  );
}
