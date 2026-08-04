"use client";

import { useState } from "react";

/**
 * DiagnosticsPanel — the ONLY component that renders errorText.
 *
 * Collapsed by default. Nothing composable (facts, compose, ClientUpdate)
 * imports this component — structural firewall maintained.
 *
 * Uses v6 design tokens.
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
          alignItems: "center",
          gap: "8px",
          padding: "13px 16px",
          borderBottom: open ? "1px solid var(--border)" : "none",
          cursor: "pointer",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Collapse chevron */}
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
          {open ? (
            <path d="m6 9 6 6 6-6" />
          ) : (
            <path d="m9 18 6-6-6-6" />
          )}
        </svg>
        <span style={{ fontSize: "15px", fontWeight: 600 }}>Diagnostics</span>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--t2)",
            background: "var(--subtle)",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "1px 8px",
          }}
        >
          {count}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "13px",
            color: "var(--t2)",
          }}
        >
          redacted · ttl 30d
        </span>
      </div>

      {/* Body — only rendered when open */}
      {open && (
        <div
          style={{
            padding: "12px 16px",
            fontSize: "13px",
            color: "var(--t2)",
          }}
        >
          {errorText ? (
            <>
              <code
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: "12px",
                  color: "var(--t1)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: "1.6",
                  display: "block",
                  background: "var(--subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                }}
              >
                {errorText}
              </code>
              {errorRedactedByServer && (
                <span
                  style={{
                    display: "block",
                    marginTop: "6px",
                    fontSize: "12px",
                    color: "var(--t3)",
                  }}
                >
                  Server-side redaction applied.
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "var(--t3)" }}>No diagnostic data.</span>
          )}
        </div>
      )}
    </>
  );
}
