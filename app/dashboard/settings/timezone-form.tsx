"use client";

import { useActionState } from "react";
import { saveTimezone, type SettingsActionState } from "./actions";

// Curated list of common IANA timezone identifiers.
// Grouped by region for readability; value is the canonical IANA name.
const TIMEZONES: { label: string; value: string }[] = [
  { label: "UTC", value: "UTC" },
  // Americas
  { label: "America/New_York — Eastern Time", value: "America/New_York" },
  { label: "America/Chicago — Central Time", value: "America/Chicago" },
  { label: "America/Denver — Mountain Time", value: "America/Denver" },
  { label: "America/Phoenix — Mountain Time (no DST)", value: "America/Phoenix" },
  { label: "America/Los_Angeles — Pacific Time", value: "America/Los_Angeles" },
  { label: "America/Anchorage — Alaska Time", value: "America/Anchorage" },
  { label: "Pacific/Honolulu — Hawaii Time", value: "Pacific/Honolulu" },
  { label: "America/Toronto — Eastern Time (Canada)", value: "America/Toronto" },
  { label: "America/Vancouver — Pacific Time (Canada)", value: "America/Vancouver" },
  { label: "America/Winnipeg — Central Time (Canada)", value: "America/Winnipeg" },
  { label: "America/Halifax — Atlantic Time", value: "America/Halifax" },
  { label: "America/St_Johns — Newfoundland Time", value: "America/St_Johns" },
  { label: "America/Sao_Paulo — Brasília Time", value: "America/Sao_Paulo" },
  { label: "America/Argentina/Buenos_Aires — Argentina Time", value: "America/Argentina/Buenos_Aires" },
  { label: "America/Bogota — Colombia Time", value: "America/Bogota" },
  { label: "America/Mexico_City — Central Time (Mexico)", value: "America/Mexico_City" },
  // Europe
  { label: "Europe/London — GMT / BST", value: "Europe/London" },
  { label: "Europe/Dublin — IST", value: "Europe/Dublin" },
  { label: "Europe/Lisbon — WET / WEST", value: "Europe/Lisbon" },
  { label: "Europe/Paris — CET / CEST", value: "Europe/Paris" },
  { label: "Europe/Berlin — CET / CEST", value: "Europe/Berlin" },
  { label: "Europe/Amsterdam — CET / CEST", value: "Europe/Amsterdam" },
  { label: "Europe/Brussels — CET / CEST", value: "Europe/Brussels" },
  { label: "Europe/Madrid — CET / CEST", value: "Europe/Madrid" },
  { label: "Europe/Rome — CET / CEST", value: "Europe/Rome" },
  { label: "Europe/Stockholm — CET / CEST", value: "Europe/Stockholm" },
  { label: "Europe/Warsaw — CET / CEST", value: "Europe/Warsaw" },
  { label: "Europe/Athens — EET / EEST", value: "Europe/Athens" },
  { label: "Europe/Helsinki — EET / EEST", value: "Europe/Helsinki" },
  { label: "Europe/Bucharest — EET / EEST", value: "Europe/Bucharest" },
  { label: "Europe/Istanbul — TRT", value: "Europe/Istanbul" },
  { label: "Europe/Moscow — MSK", value: "Europe/Moscow" },
  // Africa
  { label: "Africa/Cairo — EET", value: "Africa/Cairo" },
  { label: "Africa/Johannesburg — SAST", value: "Africa/Johannesburg" },
  { label: "Africa/Lagos — WAT", value: "Africa/Lagos" },
  { label: "Africa/Nairobi — EAT", value: "Africa/Nairobi" },
  // Asia / Middle East
  { label: "Asia/Dubai — GST", value: "Asia/Dubai" },
  { label: "Asia/Riyadh — AST", value: "Asia/Riyadh" },
  { label: "Asia/Karachi — PKT", value: "Asia/Karachi" },
  { label: "Asia/Kolkata — IST", value: "Asia/Kolkata" },
  { label: "Asia/Dhaka — BST", value: "Asia/Dhaka" },
  { label: "Asia/Bangkok — ICT", value: "Asia/Bangkok" },
  { label: "Asia/Singapore — SGT", value: "Asia/Singapore" },
  { label: "Asia/Shanghai — CST", value: "Asia/Shanghai" },
  { label: "Asia/Hong_Kong — HKT", value: "Asia/Hong_Kong" },
  { label: "Asia/Taipei — CST", value: "Asia/Taipei" },
  { label: "Asia/Tokyo — JST", value: "Asia/Tokyo" },
  { label: "Asia/Seoul — KST", value: "Asia/Seoul" },
  { label: "Asia/Jakarta — WIB", value: "Asia/Jakarta" },
  // Pacific / Oceania
  { label: "Australia/Perth — AWST", value: "Australia/Perth" },
  { label: "Australia/Adelaide — ACST / ACDT", value: "Australia/Adelaide" },
  { label: "Australia/Sydney — AEST / AEDT", value: "Australia/Sydney" },
  { label: "Australia/Melbourne — AEST / AEDT", value: "Australia/Melbourne" },
  { label: "Pacific/Auckland — NZST / NZDT", value: "Pacific/Auckland" },
  { label: "Pacific/Fiji — FJT", value: "Pacific/Fiji" },
];

const INITIAL_STATE: SettingsActionState = { error: null };

export function TimezoneForm({ currentTimezone }: { currentTimezone: string }) {
  const [state, formAction, isPending] = useActionState(saveTimezone, INITIAL_STATE);

  return (
    <form action={formAction}>
      <div style={{ marginBottom: "16px" }}>
        <label
          htmlFor="timezone"
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--t2)",
            marginBottom: "6px",
          }}
        >
          Timezone
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={currentTimezone}
          style={{
            width: "100%",
            maxWidth: "420px",
            padding: "8px 10px",
            fontSize: "14px",
            color: "var(--t1)",
            background: "var(--canvas)",
            border: "1px solid var(--border-2)",
            borderRadius: "6px",
            outline: "none",
            cursor: "pointer",
          }}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
        <p
          style={{
            marginTop: "6px",
            fontSize: "12px",
            color: "var(--t3)",
          }}
        >
          Used for all time displays and canary window calculations. Clients and
          workflows can override this individually.
        </p>
      </div>

      {state.error && (
        <p
          role="alert"
          style={{
            marginBottom: "12px",
            fontSize: "13px",
            color: "var(--amber-tx)",
          }}
        >
          {state.error}
        </p>
      )}

      {state.error === null && state !== INITIAL_STATE && (
        <p
          role="status"
          style={{
            marginBottom: "12px",
            fontSize: "13px",
            color: "var(--green-tx)",
          }}
        >
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        style={{
          padding: "8px 16px",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--rail-text)",
          background: isPending ? "var(--pine-2)" : "var(--pine)",
          border: "none",
          borderRadius: "6px",
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
