interface StatPair {
  value: string;
  label: string;
}

interface ImpactStripProps {
  /** Hero figure — the most important number */
  heroValue: string;
  heroLabel: string;
  /** Semantic color for the hero: "green" | "amber" */
  heroColor?: "green" | "amber";
  /** Additional stat pairs shown to the right */
  stats: StatPair[];
}

export function ImpactStrip({
  heroValue,
  heroLabel,
  heroColor = "green",
  stats,
}: ImpactStripProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
      }}
    >
      {/* Hero */}
      <div
        style={{
          padding: "18px 28px 16px",
          borderRight: "1px solid var(--hair-2)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "33px",
            fontWeight: 600,
            color: heroColor === "green" ? "var(--green)" : "var(--amber-deep)",
            letterSpacing: "-.02em",
          }}
        >
          {heroValue}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
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
          gap: "34px",
          padding: "0 30px",
          flexWrap: "wrap",
        }}
      >
        {stats.map((s) => (
          <div key={s.label}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "15px",
                fontWeight: 600,
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "8.5px",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
                marginTop: "4px",
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
