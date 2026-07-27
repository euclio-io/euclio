"use client";

import { useActionState } from "react";
import { createWorkflow, type ActionState } from "./actions";

const initial: ActionState = { error: null };

export function AddWorkflowForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(createWorkflow, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Workflow name</span>
        <input
          name="name"
          required
          className="rounded border px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Expected interval (minutes)</span>
        <input
          name="expectedIntervalMinutes"
          type="number"
          min={1}
          required
          className="w-32 rounded border px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Grace period (minutes, optional)</span>
        <input
          name="graceMinutes"
          type="number"
          min={0}
          placeholder="5"
          className="w-32 rounded border px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-1 disabled:opacity-50 dark:border-zinc-700"
      >
        Add workflow
      </button>
      {state.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
