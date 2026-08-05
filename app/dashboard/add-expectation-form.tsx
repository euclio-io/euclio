"use client";

import { useActionState } from "react";
import { createExpectation, deactivateExpectation, type ActionState } from "./actions";

/** One row in the existing-expectations list. */
function ExpectationRow({
  id,
  rule,
  windowMins,
  timezone,
}: {
  id: string;
  rule: string;
  windowMins: number;
  timezone: string;
}) {
  const [, deactivateAction, deactivatePending] = useActionState<ActionState, FormData>(
    deactivateExpectation,
    { error: null },
  );

  // Convert "weekdays by 09:05" → "Weekdays by 9:05 am"
  function wordedRule(r: string): string {
    const m = r.match(/^(daily|weekdays)\s+by\s+(\d{1,2}):(\d{2})$/i);
    if (!m) return r;
    const freq = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    const h = parseInt(m[2], 10);
    const min = m[3];
    const suffix = h < 12 ? "am" : "pm";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${freq} by ${h12}:${min} ${suffix}`;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--t1)" }}>
          {wordedRule(rule)}
        </div>
        <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>
          ±{windowMins} min window · {timezone}
        </div>
      </div>
      <form action={deactivateAction}>
        <input type="hidden" name="expectationId" value={id} />
        <button
          type="submit"
          disabled={deactivatePending}
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--t3)",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "4px 10px",
            cursor: deactivatePending ? "default" : "pointer",
            opacity: deactivatePending ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {deactivatePending ? "Removing…" : "Remove"}
        </button>
      </form>
    </div>
  );
}

interface AddExpectationFormProps {
  workflowId: string;
  /** Existing active expectations to display above the add form. */
  expectations?: { id: string; rule: string; windowMins: number }[];
  /** Effective timezone for display (e.g. "America/Toronto"). */
  timezone?: string;
}

export function AddExpectationForm({
  workflowId,
  expectations = [],
  timezone = "UTC",
}: AddExpectationFormProps) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createExpectation, {
    error: null,
  });

  return (
    <div>
      {/* ── Section header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>
          Expectations
        </span>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--t2)",
            background: "var(--subtle)",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "1px 8px",
          }}
        >
          {expectations.length}
        </span>
      </div>

      {/* ── Empty state ── */}
      {expectations.length === 0 && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--t2)",
            lineHeight: "1.6",
            marginBottom: "12px",
          }}
        >
          Tell the canary when a send is expected. A receipt inside the window
          counts as matched; anything else is logged as unexpected.
        </p>
      )}

      {/* ── Existing expectations ── */}
      {expectations.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          {expectations.map((e) => (
            <ExpectationRow
              key={e.id}
              id={e.id}
              rule={e.rule}
              windowMins={e.windowMins}
              timezone={timezone}
            />
          ))}
        </div>
      )}

      {/* ── Add form ── */}
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <input type="hidden" name="workflowId" value={workflowId} />

        {/* Frequency */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label
            htmlFor="exp-freq"
            style={{ fontSize: "12px", fontWeight: 500, color: "var(--t2)" }}
          >
            Frequency
          </label>
          <select
            id="exp-freq"
            name="freq"
            style={{
              fontSize: "13px",
              padding: "7px 10px",
              border: "1px solid var(--border-2)",
              borderRadius: "6px",
              background: "#fff",
              color: "var(--t1)",
              appearance: "auto",
            }}
          >
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
          </select>
        </div>

        {/* By time */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label
            htmlFor="exp-time"
            style={{ fontSize: "12px", fontWeight: 500, color: "var(--t2)" }}
          >
            By (time in {timezone})
          </label>
          <input
            id="exp-time"
            type="time"
            name="byTime"
            required
            style={{
              fontSize: "13px",
              padding: "7px 10px",
              border: "1px solid var(--border-2)",
              borderRadius: "6px",
              background: "#fff",
              color: "var(--t1)",
              width: "140px",
            }}
          />
        </div>

        {/* Window */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label
            htmlFor="exp-window"
            style={{ fontSize: "12px", fontWeight: 500, color: "var(--t2)" }}
          >
            Window (minutes)
          </label>
          <input
            id="exp-window"
            type="number"
            name="windowMins"
            defaultValue={30}
            min={1}
            max={1440}
            style={{
              fontSize: "13px",
              padding: "7px 10px",
              border: "1px solid var(--border-2)",
              borderRadius: "6px",
              background: "#fff",
              color: "var(--t1)",
              width: "100px",
            }}
          />
        </div>

        {/* Hidden rule field — assembled client-side via the freq + byTime fields */}
        {/* The server action reads "rule" directly; we use a hidden input populated
            by the freq + byTime selects via a submit handler below. */}
        <input type="hidden" name="rule" id="exp-rule" />

        <button
          type="submit"
          disabled={pending}
          onClick={(e) => {
            // Assemble the rule string from freq + byTime before submit.
            const form = (e.currentTarget as HTMLButtonElement).form!;
            const freq = (form.elements.namedItem("freq") as HTMLSelectElement).value;
            const byTime = (form.elements.namedItem("byTime") as HTMLInputElement).value;
            if (!byTime) return; // let HTML5 required validation fire
            const ruleInput = form.elements.namedItem("rule") as HTMLInputElement;
            ruleInput.value = `${freq} by ${byTime}`;
          }}
          style={{
            alignSelf: "flex-start",
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
          }}
        >
          {pending ? "Adding…" : "Add expectation"}
        </button>

        {state.error && (
          <p
            role="alert"
            style={{ fontSize: "12px", color: "var(--amber-tx)", margin: 0 }}
          >
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
