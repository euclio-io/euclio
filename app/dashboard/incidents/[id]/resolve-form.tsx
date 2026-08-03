"use client";

import { useActionState } from "react";
import { resolveIncident } from "@/app/dashboard/actions";
import type { ActionState } from "@/app/dashboard/actions";

interface ResolveFormProps {
  incidentId: string;
}

const initialState: ActionState = { error: null };

export function ResolveForm({ incidentId }: ResolveFormProps) {
  const [state, formAction, isPending] = useActionState(resolveIncident, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <input type="hidden" name="incidentId" value={incidentId} />

      <label
        htmlFor="noteText"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "8.5px",
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "var(--ink-2)",
        }}
      >
        Resolution note (optional)
      </label>
      <textarea
        id="noteText"
        name="noteText"
        rows={3}
        maxLength={500}
        placeholder="What happened and how it was fixed…"
        disabled={isPending}
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          color: "var(--ink)",
          background: "var(--lift)",
          border: "1px solid var(--hair)",
          borderRadius: "6px",
          padding: "10px 12px",
          resize: "vertical",
          lineHeight: "1.55",
          outline: "none",
        }}
      />

      {state.error && (
        <p
          role="alert"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--amber-deep)",
          }}
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        style={{
          alignSelf: "flex-start",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          borderRadius: "999px",
          padding: "8px 18px",
          border: "none",
          background: "var(--pine)",
          color: "var(--rail-text)",
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? "Resolving…" : "Mark resolved"}
      </button>
    </form>
  );
}
