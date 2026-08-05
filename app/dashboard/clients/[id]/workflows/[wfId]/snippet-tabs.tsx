"use client";

import { useState } from "react";

type Tab = "n8n" | "Make" | "Zapier" | "Node" | "Python" | "curl" | "Agent";

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: "n8n", label: "n8n" },
  { id: "Make", label: "Make" },
  { id: "Zapier", label: "Zapier" },
  { id: "Node", label: "Node" },
  { id: "Python", label: "Python" },
  { id: "curl", label: "curl" },
  { id: "Agent", label: "Coding agent" },
];

function getSnippet(tab: Tab, pingUrl: string, failUrl: string): string {
  switch (tab) {
    case "Node":
      return `try {
  await fetch('${pingUrl}', {
    method: 'POST',
    signal: AbortSignal.timeout(4000)
  });
} catch {} // an Euclio outage never touches your work`;

    case "Python":
      return `import httpx
try:
    httpx.post('${pingUrl}', timeout=4)
except Exception:
    pass  # an Euclio outage never touches your work`;

    case "curl":
      return `curl -fsS --max-time 4 -X POST '${pingUrl}' || true
# --max-time 4: short timeout so Euclio never blocks your script
# || true: an Euclio outage never fails your job`;

    case "n8n":
      return `// Add an HTTP Request node at the END of your workflow:
// Method: POST
// URL: ${pingUrl}
// (no body needed)
//
// For error reporting: add a second HTTP Request node
// in your Error Workflow → Method: POST
// URL: ${failUrl}
// Body: { "error": "{{ $json.error }}" }`;

    case "Make":
      return `// Add an HTTP module at the END of your scenario:
// Method: POST
// URL: ${pingUrl}
//
// For error reporting: add a route in your error handler
// Method: POST
// URL: ${failUrl}
// Body: { "error": "{{error.message}}" }`;

    case "Zapier":
      return `// Add a Webhooks by Zapier step at the END of your Zap:
// (Note: Webhooks by Zapier requires a paid plan)
// Method: POST
// URL: ${pingUrl}
//
// For error reporting: Zapier doesn't have a native error
// handler — use a Filter + Webhooks step if needed.`;

    case "Agent":
      return `// Paste this into your coding agent (Claude Code, Cursor, etc.):
//
// After every successful run of this workflow, make a fire-and-forget
// POST request to: ${pingUrl}
// Wrap it in try/catch — an Euclio outage must never crash the workflow.
// Use a 4-second timeout. Await the call (don't fire-and-forget in
// serverless environments — the runtime may freeze before it sends).
//
// If the workflow throws an error, also POST to: ${failUrl}
// with body: { "error": "<the error message, first 200 chars only>" }`;
  }
}

export function SnippetTabs({
  pingUrl,
  failUrl,
}: {
  pingUrl: string;
  failUrl: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Node");
  const [copied, setCopied] = useState(false);

  const snippet = getSnippet(activeTab, pingUrl, failUrl);

  function handleCopy() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      {/* Tabs — horizontal scroll on mobile */}
      <div
        style={{
          display: "flex",
          gap: "20px",
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {TAB_LABELS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              fontFamily: "var(--mono)",
              fontSize: "10.5px",
              letterSpacing: ".04em",
              color: activeTab === id ? "var(--t1)" : "var(--t3)",
              padding: "0 0 10px",
              border: "none",
              borderBottom: activeTab === id
                ? "2px solid var(--pine)"
                : "2px solid transparent",
              marginBottom: "-1px",
              background: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Snippet card */}
      <div
        style={{
          background: "var(--subtle)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          boxShadow: "var(--sh)",
          marginTop: "16px",
          overflow: "hidden",
        }}
      >
        <pre
          style={{
            margin: 0,
            padding: "16px 20px",
            fontFamily: "var(--mono)",
            fontSize: "11.5px",
            lineHeight: "1.7",
            color: "var(--pine)",
            whiteSpace: "pre",
            overflowX: "auto",
          }}
        >
          {snippet}
        </pre>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            background: "var(--canvas)",
            borderTop: "1px solid var(--border)",
            padding: "12px 20px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: "9px",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--t3)",
            }}
          >
            {activeTab === "Node" || activeTab === "Python" || activeTab === "curl"
              ? "zero dependencies · the request is the whole footprint"
              : "platform integration · no SDK required"}
          </span>
          {/* Copy — primary filled button (the one filled primary per screen) */}
          <button
            onClick={handleCopy}
            style={{
              fontFamily: "var(--mono)",
              fontSize: "10px",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              borderRadius: "8px",
              padding: "8px 16px",
              border: "1px solid var(--pine)",
              background: "var(--pine)",
              color: "#fff",
              cursor: "pointer",
              boxShadow: "var(--sh)",
              minHeight: "44px",
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>
    </>
  );
}
