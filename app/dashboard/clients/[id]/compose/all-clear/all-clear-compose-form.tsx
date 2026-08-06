"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createAllClearUpdate } from "@/app/dashboard/actions";

interface AllClearComposeFormProps {
  clientId: string;
  clientName: string;
  slot1Prefill: string;
  coversFrom: string; // ISO string
  coversTo: string;   // ISO string
}

export function AllClearComposeForm({
  clientId,
  clientName,
  slot1Prefill,
  coversFrom,
  coversTo,
}: AllClearComposeFormProps) {
  const [slot1, setSlot1] = useState(slot1Prefill);
  const [slot2, setSlot2] = useState(""); // mandatory — never pre-filled
  const [slot3, setSlot3] = useState("");
  const [slot4, setSlot4] = useState("Nothing — just keeping you in the loop.");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicSlug, setPublicSlug] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const slot2Empty = slot2.trim() === "";
  const canSend = !slot2Empty;

  function assembleBody(): string {
    const parts: string[] = [];
    if (slot1.trim()) parts.push(slot1.trim());
    if (slot2.trim()) parts.push(slot2.trim());
    if (slot3.trim()) parts.push(slot3.trim());
    if (slot4.trim()) parts.push(slot4.trim());
    return parts.join("\n\n");
  }

  async function handleCopy() {
    if (!canSend) return;
    const body = assembleBody();
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleMarkSent() {
    if (!canSend) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("clientId", clientId);
      formData.set("bodyText", assembleBody());
      formData.set("slot2", slot2); // structural guard — server rejects if empty
      formData.set("markSent", "1");
      formData.set("coversFrom", coversFrom);
      formData.set("coversTo", coversTo);
      const result = await createAllClearUpdate({ error: null }, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSent(true);
        if (result.publicSlug) setPublicSlug(result.publicSlug);
      }
    });
  }

  if (sent) {
    return (
      <div style={{ maxWidth: "640px" }}>
        <Link
          href={`/dashboard/clients/${clientId}`}
          style={{
            fontFamily: "var(--mono)",
            fontSize: "12px",
            color: "var(--t3)",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: "24px",
          }}
        >
          ← ledger
        </Link>
        <div
          style={{
            border: "1px solid var(--green-bd)",
            borderRadius: "10px",
            background: "var(--green-bg)",
            padding: "28px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, marginBottom: "6px" }}>
            All-clear recorded.
          </p>
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: "12px",
              color: "var(--t2)",
              marginBottom: "20px",
            }}
          >
            Marked as sent to {clientName}.
          </p>
          {publicSlug && (
            <p
              style={{
                fontFamily: "var(--mono)",
                fontSize: "11px",
                color: "var(--t3)",
                marginBottom: "20px",
              }}
            >
              Receipt page:{" "}
              <a
                href={`/u/${publicSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "underline" }}
              >
                /u/{publicSlug}
              </a>
            </p>
          )}
          <Link
            href={`/dashboard/clients/${clientId}`}
            style={{
              fontFamily: "var(--mono)",
              fontSize: "13px",
              color: "var(--t2)",
              border: "1px solid var(--border-2)",
              borderRadius: "8px",
              padding: "8px 16px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Back to ledger
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "640px" }}>
      {/* Back */}
      <Link
        href={`/dashboard/clients/${clientId}`}
        style={{
          fontFamily: "var(--mono)",
          fontSize: "12px",
          color: "var(--t3)",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: "24px",
        }}
      >
        ← ledger
      </Link>

      {/* Subtitle */}
      <p
        style={{
          fontFamily: "var(--mono)",
          fontSize: "11px",
          color: "var(--t3)",
          marginBottom: "28px",
        }}
      >
        {clientName} · all-clear
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Slot 1 — What happened (pre-filled from facts, editable) */}
        <div>
          <label
            style={{
              display: "block",
              fontFamily: "var(--mono)",
              fontSize: "10px",
              color: "var(--t3)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: "6px",
            }}
          >
            what happened
          </label>
          <textarea
            value={slot1}
            onChange={(e) => setSlot1(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              fontFamily: "var(--mono)",
              fontSize: "13px",
              color: "var(--t1)",
              background: "#fff",
              border: "1px solid var(--border-2)",
              borderRadius: "8px",
              padding: "10px 12px",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: "11px",
              color: "var(--t3)",
              marginTop: "4px",
            }}
          >
            Pre-filled from the record. Edit freely.
          </p>
        </div>

        {/* Slot 2 — What it means for you (MANDATORY, never pre-filled) */}
        <div>
          <label
            style={{
              display: "block",
              fontFamily: "var(--mono)",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: "6px",
              color: slot2Empty ? "var(--amber)" : "var(--t3)",
            }}
          >
            what it means for you
            <span style={{ color: "var(--amber)", marginLeft: "6px" }}>· required</span>
          </label>
          <textarea
            value={slot2}
            onChange={(e) => setSlot2(e.target.value)}
            rows={3}
            placeholder="[your read — only you can say what this quiet period meant for their business]"
            style={{
              width: "100%",
              fontFamily: "var(--mono)",
              fontSize: "13px",
              color: "var(--t1)",
              background: "#fff",
              border: `1px solid ${slot2Empty ? "var(--amber-bd)" : "var(--border-2)"}`,
              borderRadius: "8px",
              padding: "10px 12px",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: "11px",
              color: "var(--t3)",
              marginTop: "4px",
            }}
          >
            Euclio never fills this. Only you know what it meant for their business.
          </p>
        </div>

        {/* Slot 3 — What I did (optional) */}
        <div>
          <label
            style={{
              display: "block",
              fontFamily: "var(--mono)",
              fontSize: "10px",
              color: "var(--t3)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: "6px",
            }}
          >
            what I did
          </label>
          <textarea
            value={slot3}
            onChange={(e) => setSlot3(e.target.value)}
            rows={2}
            placeholder="Optional — anything you did to keep things running."
            style={{
              width: "100%",
              fontFamily: "var(--mono)",
              fontSize: "13px",
              color: "var(--t1)",
              background: "#fff",
              border: "1px solid var(--border-2)",
              borderRadius: "8px",
              padding: "10px 12px",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Slot 4 — What you need to do */}
        <div>
          <label
            style={{
              display: "block",
              fontFamily: "var(--mono)",
              fontSize: "10px",
              color: "var(--t3)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: "6px",
            }}
          >
            what you need to do
          </label>
          <textarea
            value={slot4}
            onChange={(e) => setSlot4(e.target.value)}
            rows={2}
            style={{
              width: "100%",
              fontFamily: "var(--mono)",
              fontSize: "13px",
              color: "var(--t1)",
              background: "#fff",
              border: "1px solid var(--border-2)",
              borderRadius: "8px",
              padding: "10px 12px",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Preview */}
        {!slot2Empty && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--subtle)",
              padding: "16px",
            }}
          >
            <p
              style={{
                fontFamily: "var(--mono)",
                fontSize: "10px",
                color: "var(--t3)",
                textTransform: "uppercase",
                letterSpacing: ".08em",
                marginBottom: "10px",
              }}
            >
              preview · plain text
            </p>
            <pre
              style={{
                fontFamily: "var(--mono)",
                fontSize: "13px",
                color: "var(--t2)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              {assembleBody()}
            </pre>
          </div>
        )}

        {/* Error */}
        {error && (
          <p
            role="alert"
            style={{
              fontFamily: "var(--mono)",
              fontSize: "13px",
              color: "var(--amber)",
            }}
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px", paddingTop: "4px" }}>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!canSend}
            style={{
              fontFamily: "var(--mono)",
              fontSize: "13px",
              padding: "9px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border-2)",
              color: "var(--t2)",
              background: "#fff",
              cursor: canSend ? "pointer" : "not-allowed",
              opacity: canSend ? 1 : 0.35,
            }}
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
          <button
            type="button"
            onClick={handleMarkSent}
            disabled={!canSend || isPending}
            style={{
              fontFamily: "var(--mono)",
              fontSize: "13px",
              padding: "9px 16px",
              borderRadius: "8px",
              border: "none",
              background: "var(--pine)",
              color: "#fff",
              cursor: canSend && !isPending ? "pointer" : "not-allowed",
              opacity: canSend && !isPending ? 1 : 0.35,
            }}
          >
            {isPending ? "Saving…" : "Mark sent"}
          </button>
        </div>

        {slot2Empty && (
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: "11px",
              color: "var(--amber-tx)",
            }}
          >
            Fill in "what it means for you" to enable sending.
          </p>
        )}
      </div>
    </div>
  );
}
