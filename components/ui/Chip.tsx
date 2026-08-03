import type { StatusKind } from "@/lib/status";

interface ChipProps {
  kind: StatusKind | "matched" | "unmatched";
  label: string;
}

const styles: Record<ChipProps["kind"], React.CSSProperties> = {
  open: {
    color: "var(--amber-deep)",
    background: "rgba(176,133,46,.14)",
  },
  resolved: {
    color: "var(--green)",
    background: "rgba(47,107,74,.1)",
  },
  quiet: {
    color: "var(--ink-2)",
    background: "rgba(28,43,34,.06)",
  },
  matched: {
    color: "var(--green)",
    background: "rgba(47,107,74,.1)",
  },
  unmatched: {
    color: "var(--amber-deep)",
    background: "rgba(176,133,46,.14)",
  },
};

export function Chip({ kind, label }: ChipProps) {
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-mono)",
        fontSize: "8.5px",
        letterSpacing: ".07em",
        fontWeight: 600,
        borderRadius: "5px",
        padding: "4px 8px",
        whiteSpace: "nowrap",
        ...styles[kind],
      }}
    >
      {label}
    </span>
  );
}
