interface StatPair {
  value: string;
  label: string;
}

interface ImpactStripProps {
  heroValue: string;
  heroLabel: string;
  heroColor?: "green" | "amber";
  stats: StatPair[];
}

export function ImpactStrip({
  heroValue,
  heroLabel,
  heroColor = "green",
  stats,
}: ImpactStripProps) {
  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      {/* Hero */}
      <div
        style={{
          padding: "16px 26px 14px",
          borderRight: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: "30px",
            fontWeight: 600,
            letterSpacing: "-.01em",
            color:
              heroColor === "green" ? "var(--green-tx)" : "var(--amber-tx)",
          }}
        >
          {heroValue}
        </div>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--t2)",
            marginTop: "4px",
          }}
        >
          {heroLabel}
        </div>
      </div>

      {/* Stat pairs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "36px",
          padding: "0 28px",
          flexWrap: "wrap",
        }}
      >
        {stats.map((s) => (
          <div key={s.label}>
            <div
              style={{
                fontSize: "17px",
                fontWeight: 600,
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontSize: "12.5px",
                fontWeight: 500,
                color: "var(--t2)",
                marginTop: "3px",
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
