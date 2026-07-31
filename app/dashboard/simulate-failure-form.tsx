"use client";

import { useActionState } from "react";
import { simulateFailure } from "./actions";

export function SimulateFailureForm({ workflowId }: { workflowId: string }) {
  const [state, formAction, pending] = useActionState(simulateFailure, { error: null });

  return (
    <form action={formAction}>
      <input type="hidden" name="workflowId" value={workflowId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        {pending ? "Simulating…" : "Simulate miss"}
      </button>
      {state.error && (
        <span className="ml-2 text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
