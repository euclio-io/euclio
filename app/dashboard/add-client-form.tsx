"use client";

import { useActionState } from "react";
import { createClient, type ActionState } from "./actions";

const initial: ActionState = { error: null };

export function AddClientForm() {
  const [state, formAction, pending] = useActionState(createClient, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Client name</span>
        <input
          name="name"
          required
          className="rounded border px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-1 disabled:opacity-50 dark:border-zinc-700"
      >
        Add client
      </button>
      {state.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
