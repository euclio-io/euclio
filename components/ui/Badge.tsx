import type { StatusKind } from "@/lib/status";

/**
 * Badge — worded status pill with a 6px colored dot.
 * Matches the .badge pattern from the v6 spec files.
 *
 * kind: "open" | "resolved" | "quiet" | "matched" | "unmatched"
 * label: the worded text, e.g. "Open · 28 min" (from deriveStatus)
 */

export type BadgeKind = StatusKind | "matched" | "unmatched";

interface BadgeProps {
  kind: BadgeKind;
  label: string;
}

const config: Record<
  BadgeKind,
  { color: string; bg: string; border: string; dot: string }
> = {
  open: {
    color: "var(--amber-tx)",
    bg: "var(--amber-bg)",
    border: "var(--amber-bd)",
    dot: "var(--amber)",
  },
  resolved: {
    color: "var(--green-tx)",
    bg: "var(--green-bg)",
    border: "var(--green-bd)",
    dot: "var(--green)",
  },
  quiet: {
    color: "var(--gray-tx)",
    bg: "var(--gray-bg)",
    border: "var(--gray-bd)",
    dot: "var(--gray)",
  },
  matched: {
    color: "var(--green-tx)",
    bg: "var(--green-bg)",
    border: "var(--green-bd)",
    dot: "var(--green)",
  },
  unmatched: {
    color: "var(--amber-tx)",
    bg: "var(--amber-bg)",
    border: "var(--amber-bd)",
    dot: "var(--amber)",
  },
};

export function Badge({ kind, label }: BadgeProps) {
  const c = config[kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        fontWeight: 500,
        borderRadius: "999px",
        padding: "3px 9px",
        border: `1px solid ${c.border}`,
        color: c.color,
        background: c.bg,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: c.dot,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
