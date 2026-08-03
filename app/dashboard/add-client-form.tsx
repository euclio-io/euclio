"use client";

import { useActionState } from "react";
import { createClient, type ActionState } from "./actions";

const initial: ActionState = { error: null };

/**
 * inline=true  → compact pill button in the header ("+ Add client")
 * inline=false → full labelled form at the bottom of the page
 */
export function AddClientForm({ inline = false }: { inline?: boolean }) {
  const [state, formAction, pending] = useActionState(createClient, initial);

  if (inline) {
    return (
      <form action={formAction} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          name="name"
          required
          placeholder="Client name"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            padding: "6px 10px",
            border: "1px solid var(--hair)",
            borderRadius: "999px",
            background: "var(--lift)",
            color: "var(--ink)",
            outline: "none",
            width: "140px",
          }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            borderRadius: "999px",
            padding: "8px 16px",
            border: "none",
            background: "var(--pine)",
            color: "var(--rail-text)",
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "…" : "+ Add client"}
        </button>
        {state.error && (
          <span
            role="alert"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--amber-deep)",
            }}
          >
            {state.error}
          </span>
        )}
      </form>
    );
  }

  return (
    <form action={formAction} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
      <input
        name="name"
        required
        placeholder="New client name"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          padding: "6px 10px",
          border: "1px solid var(--hair-2)",
          borderRadius: "6px",
          background: "var(--lift)",
          color: "var(--ink)",
          outline: "none",
          width: "200px",
        }}
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
        {pending ? "adding…" : "add →"}
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
