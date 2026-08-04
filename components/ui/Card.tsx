/**
 * Card + CardHeader — v6 design system card components.
 *
 * Card: white bg, 1px #EAECF0 border, radius 10, whisper shadow.
 * Attention variant: amber border + amber header band (warn-card treatment).
 *
 * CardHeader: 15/600 title + gray count pill + optional collapse chevron
 *             + right-aligned 13px gray meta. #F9FAFB band.
 */

interface CardProps {
  children: React.ReactNode;
  attention?: boolean;
  style?: React.CSSProperties;
}

export function Card({ children, attention = false, style }: CardProps) {
  return (
    <div
      style={{
        background: "var(--canvas)",
        border: `1px solid ${attention ? "var(--amber-bd)" : "var(--border)"}`,
        borderRadius: "10px",
        boxShadow: "var(--sh)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  count?: number | string;
  right?: React.ReactNode;
  collapse?: "open" | "closed";
  onToggle?: () => void;
  attention?: boolean;
  icon?: React.ReactNode;
}

export function CardHeader({
  title,
  count,
  right,
  collapse,
  onToggle,
  attention = false,
  icon,
}: CardHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "13px 16px",
        borderBottom: `1px solid ${attention ? "var(--amber-bd)" : "var(--border)"}`,
        background: attention ? "var(--amber-bg)" : "transparent",
        cursor: onToggle ? "pointer" : "default",
      }}
      onClick={onToggle}
    >
      {collapse !== undefined && (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--t3)", flexShrink: 0 }}
        >
          {collapse === "open" ? (
            <path d="m6 9 6 6 6-6" />
          ) : (
            <path d="m9 18 6-6-6-6" />
          )}
        </svg>
      )}
      {icon}
      <span
        style={{
          fontSize: "15px",
          fontWeight: 600,
        }}
      >
        {title}
      </span>
      {count !== undefined && (
        <span
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: attention ? "var(--amber-tx)" : "var(--t2)",
            background: attention ? "var(--amber-bg)" : "var(--subtle)",
            border: `1px solid ${attention ? "var(--amber-bd)" : "var(--border)"}`,
            borderRadius: "999px",
            padding: "1px 8px",
          }}
        >
          {count}
        </span>
      )}
      {right !== undefined && (
        <span
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            color: "var(--t2)",
          }}
        >
          {right}
        </span>
      )}
    </div>
  );
}

/** Chevron icon used in card rows */
export function ChevronRight() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--t3)", flexShrink: 0 }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
