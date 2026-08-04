interface TimelineEvent {
  kind: "amber" | "green" | "neutral";
  kindLabel: string;
  text: React.ReactNode;
  timestamp: string;
}

interface TimelineProps {
  events: TimelineEvent[];
}

const nodeColor: Record<TimelineEvent["kind"], string> = {
  amber: "var(--amber)",
  green: "var(--green)",
  neutral: "var(--gray)",
};

const labelColor: Record<TimelineEvent["kind"], string> = {
  amber: "var(--amber-tx)",
  green: "var(--green-tx)",
  neutral: "var(--t2)",
};

export function Timeline({ events }: TimelineProps) {
  return (
    <div style={{ padding: "8px 16px 12px 22px" }}>
      {events.map((ev, i) => (
        <div
          key={i}
          style={{
            position: "relative",
            padding: "9px 0 9px 22px",
            borderLeft:
              i < events.length - 1
                ? "2px solid var(--border)"
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
              background: nodeColor[ev.kind],
              border: "2px solid #fff",
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
                fontSize: "12px",
                fontWeight: 600,
                color: labelColor[ev.kind],
              }}
            >
              {ev.kindLabel}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: "12px",
                color: "var(--t3)",
              }}
            >
              {ev.timestamp}
            </span>
          </div>

          {/* Detail text */}
          <div
            style={{
              fontSize: "13.5px",
              lineHeight: "1.55",
              marginTop: "2px",
              color: "var(--t1)",
            }}
          >
            {ev.text}
          </div>
        </div>
      ))}
    </div>
  );
}
