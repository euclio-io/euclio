"use client";

import { useState } from "react";

/**
 * DiagnosticsPanel — the ONLY component that renders errorText.
 *
 * Collapsed by default. Nothing composable (facts, compose, ClientUpdate)
 * imports this component — structural firewall maintained.
 */
interface DiagnosticsPanelProps {
  errorText: string | null;
  errorRedactedByServer: boolean;
  count: number;
}

export function DiagnosticsPanel({
  errorText,
  errorRedactedByServer,
  count,
}: DiagnosticsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Header — always visible, acts as toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          padding: "10px 16px",
          borderBottom: open ? "1px solid var(--hair)" : "none",
          fontFamily: "var(--font-mono)",
          fontSize: "8.5px",
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "var(--ink-2)",
          cursor: "pointer",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ fontSize: "9px" }}>{open ? "▾" : "▸"}</span>
        <span>Diagnostics · {count}</span>
        <span
          style={{
            marginLeft: "auto",
            letterSpacing: ".04em",
            textTransform: "none",
          }}
        >
          redacted · ttl 30d
        </span>
      </div>

      {/* Body — only rendered when open */}
      {open && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "12px",
            padding: "11px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--ink-2)",
          }}
        >
          {errorText ? (
            <>
              <code
                style={{
                  fontSize: "10px",
                  color: "var(--pine)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: "1.6",
                }}
              >
                {errorText}
              </code>
              {errorRedactedByServer && (
                <span
                  style={{
                    fontSize: "9px",
                    color: "var(--ink-2)",
                    marginLeft: "8px",
                  }}
                >
                  · server-side redaction applied
                </span>
              )}
            </>
          ) : (
            <span>No diagnostic data.</span>
          )}
        </div>
      )}
    </>
  );
}
