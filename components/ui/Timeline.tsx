interface TimelineEvent {
  kind: "amber" | "green" | "neutral";
  kindLabel: string;
  text: React.ReactNode;
  timestamp: string;
}

interface TimelineProps {
  events: TimelineEvent[];
}

const kindColor: Record<TimelineEvent["kind"], string> = {
  amber: "var(--amber)",
  green: "var(--green)",
  neutral: "var(--ink-2)",
};

const kindTextColor: Record<TimelineEvent["kind"], string> = {
  amber: "var(--amber-deep)",
  green: "var(--green)",
  neutral: "var(--ink-2)",
};

export function Timeline({ events }: TimelineProps) {
  return (
    <div style={{ padding: "6px 16px 12px 20px" }}>
      {events.map((ev, i) => (
        <div
          key={i}
          style={{
            position: "relative",
            padding: "9px 0 9px 24px",
            borderLeft: i < events.length - 1
              ? "2px solid var(--hair-2)"
              : "2px solid transparent",
          }}
        >
          {/* Node */}
          <span
            style={{
              position: "absolute",
              left: "-5px",
              top: "14px",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: kindColor[ev.kind],
              border: "2px solid var(--lift)",
              display: "block",
            }}
          />

          {/* Top row: kind label + timestamp */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "10px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8.5px",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: kindTextColor[ev.kind],
              }}
            >
              {ev.kindLabel}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: "9.5px",
                color: "var(--ink-2)",
              }}
            >
              {ev.timestamp}
            </span>
          </div>

          {/* Detail text */}
          <div
            style={{
              fontSize: "12.5px",
              lineHeight: "1.5",
              marginTop: "2px",
            }}
          >
            {ev.text}
          </div>
        </div>
      ))}
    </div>
  );
}
