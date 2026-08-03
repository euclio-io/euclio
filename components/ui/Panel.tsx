interface PanelProps {
  children: React.ReactNode;
  loud?: boolean;
  style?: React.CSSProperties;
}

export function Panel({ children, loud = false, style }: PanelProps) {
  return (
    <div
      style={{
        background: "var(--lift)",
        border: "1px solid var(--hair-2)",
        borderLeft: loud ? "3px solid var(--amber)" : "1px solid var(--hair-2)",
        borderRadius: "10px",
        overflow: "hidden",
        boxShadow: loud
          ? "0 12px 36px -20px rgba(30,54,43,.32)"
          : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  label: string;
  count?: number | string;
  right?: React.ReactNode;
  collapse?: "open" | "closed";
  onToggle?: () => void;
}

export function PanelHeader({
  label,
  count,
  right,
  collapse,
  onToggle,
}: PanelHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "10px",
        padding: "10px 16px",
        borderBottom: "1px solid var(--hair)",
        fontFamily: "var(--font-mono)",
        fontSize: "8.5px",
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color: "var(--ink-2)",
        cursor: onToggle ? "pointer" : "default",
      }}
      onClick={onToggle}
    >
      {collapse !== undefined && (
        <span style={{ fontSize: "9px" }}>
          {collapse === "open" ? "▾" : "▸"}
        </span>
      )}
      <span>
        {label}
        {count !== undefined && ` · ${count}`}
      </span>
      {right !== undefined && (
        <span
          style={{
            marginLeft: "auto",
            letterSpacing: ".04em",
            textTransform: "none",
          }}
        >
          {right}
        </span>
      )}
    </div>
  );
}
