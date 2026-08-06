"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createClientUpdate } from "@/app/dashboard/actions";

interface ComposeFormProps {
  clientId: string;
  clientName: string;
  incidentId: string;
  workflowName: string;
  slot1Prefill: string;
}

export function ComposeForm({
  clientId,
  clientName,
  incidentId,
  workflowName,
  slot1Prefill,
}: ComposeFormProps) {
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

  // Assemble the plain-text note body (strip-by-construction: no HTML, no links)
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
      formData.set("incidentId", incidentId);
      formData.set("clientId", clientId);
      formData.set("bodyText", assembleBody());
      formData.set("slot2", slot2); // structural guard — server rejects if empty
      formData.set("markSent", "1");
      const result = await createClientUpdate({ error: null }, formData);
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
      <main className="min-h-screen bg-paper px-6 py-10 max-w-2xl mx-auto">
        <Link
          href={`/dashboard/clients/${clientId}`}
          className="text-sm font-mono text-ink/50 hover:text-ink mb-8 inline-block"
        >
          ← ledger
        </Link>
        <div className="border border-green/30 rounded bg-green/5 px-6 py-8 text-center">
          <p className="font-serif text-xl text-ink mb-2">Note recorded.</p>
          <p className="font-mono text-sm text-ink/60 mb-6">
            Marked as sent to {clientName}.
          </p>
          {publicSlug && (
            <p className="font-mono text-xs text-ink/40 mb-6">
              Receipt page:{" "}
              <a
                href={`/u/${publicSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-ink"
              >
                /u/{publicSlug}
              </a>
            </p>
          )}
          <Link
            href={`/dashboard/clients/${clientId}`}
            className="font-mono text-sm text-ink/60 border border-hair rounded px-4 py-2 hover:border-ink/30 hover:text-ink transition-colors"
          >
            Back to ledger
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper px-6 py-10 max-w-2xl mx-auto">
      {/* Back */}
      <Link
        href={`/dashboard/clients/${clientId}`}
        className="text-sm font-mono text-ink/50 hover:text-ink mb-8 inline-block"
      >
        ← ledger
      </Link>

      {/* Header */}
      <h1 className="font-serif text-2xl text-ink mb-1">
        Compose client note
      </h1>
      <p className="font-mono text-xs text-ink/40 mb-8">
        {clientName} · {workflowName}
      </p>

      <div className="space-y-6">
        {/* Slot 1 — What happened (pre-filled from facts, editable) */}
        <div>
          <label className="block font-mono text-xs text-ink/50 uppercase tracking-widest mb-2">
            what happened
          </label>
          <textarea
            value={slot1}
            onChange={(e) => setSlot1(e.target.value)}
            rows={3}
            className="w-full font-mono text-sm text-ink bg-paper border border-hair rounded px-3 py-2 resize-y focus:outline-none focus:border-ink/30"
          />
          <p className="font-mono text-xs text-ink/30 mt-1">
            Pre-filled from the record. Edit freely.
          </p>
        </div>

        {/* Slot 2 — What it means for you (MANDATORY, never pre-filled) */}
        <div>
          <label className="block font-mono text-xs uppercase tracking-widest mb-2">
            <span
              className={slot2Empty ? "text-amber" : "text-ink/50"}
            >
              what it means for you
            </span>
            <span className="text-amber ml-1">· required</span>
          </label>
          <textarea
            value={slot2}
            onChange={(e) => setSlot2(e.target.value)}
            rows={3}
            placeholder="[your read — only you can say what this meant for their business]"
            className={`w-full font-mono text-sm text-ink bg-paper border rounded px-3 py-2 resize-y focus:outline-none transition-colors placeholder:text-ink/25 ${
              slot2Empty
                ? "border-amber/50 focus:border-amber"
                : "border-hair focus:border-ink/30"
            }`}
          />
          <p className="font-mono text-xs text-ink/30 mt-1">
            Euclio never fills this. Only you know what it meant for their
            business.
          </p>
        </div>

        {/* Slot 3 — What I did (optional) */}
        <div>
          <label className="block font-mono text-xs text-ink/50 uppercase tracking-widest mb-2">
            what I did
          </label>
          <textarea
            value={slot3}
            onChange={(e) => setSlot3(e.target.value)}
            rows={2}
            placeholder="Optional — what you did to investigate or fix it."
            className="w-full font-mono text-sm text-ink bg-paper border border-hair rounded px-3 py-2 resize-y focus:outline-none focus:border-ink/30 placeholder:text-ink/25"
          />
        </div>

        {/* Slot 4 — What you need to do (defaults to "Nothing…") */}
        <div>
          <label className="block font-mono text-xs text-ink/50 uppercase tracking-widest mb-2">
            what you need to do
          </label>
          <textarea
            value={slot4}
            onChange={(e) => setSlot4(e.target.value)}
            rows={2}
            className="w-full font-mono text-sm text-ink bg-paper border border-hair rounded px-3 py-2 resize-y focus:outline-none focus:border-ink/30"
          />
        </div>

        {/* Preview */}
        {!slot2Empty && (
          <div className="border border-hair rounded bg-lift px-4 py-4">
            <p className="font-mono text-xs text-ink/40 uppercase tracking-widest mb-3">
              preview · plain text
            </p>
            <pre className="font-mono text-sm text-ink/80 whitespace-pre-wrap leading-relaxed">
              {assembleBody()}
            </pre>
          </div>
        )}

        {/* Error */}
        {error && (
          <p role="alert" className="font-mono text-sm text-amber">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!canSend}
            className="font-mono text-sm px-4 py-2 rounded border border-hair text-ink/60 hover:border-ink/30 hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
          <button
            type="button"
            onClick={handleMarkSent}
            disabled={!canSend || isPending}
            className="font-mono text-sm px-4 py-2 rounded bg-ink text-paper hover:bg-ink/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : "Mark sent"}
          </button>
        </div>

        {slot2Empty && (
          <p className="font-mono text-xs text-amber/70">
            Fill in "what it means for you" to enable sending.
          </p>
        )}
      </div>
    </main>
  );
}
