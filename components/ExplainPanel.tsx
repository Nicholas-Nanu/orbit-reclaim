"use client";

import { useCallback, useRef, useState } from "react";

type Persona = "operator" | "insurer" | "agency" | "removal_provider";

const PERSONAS: { key: Persona; label: string }[] = [
  { key: "operator", label: "Operator" },
  { key: "insurer", label: "Insurer" },
  { key: "agency", label: "Agency" },
  { key: "removal_provider", label: "Removal" },
];

type Status = "idle" | "loading" | "streaming" | "done" | "error";

// Session cache by (objectId, mode, persona) — CLAUDE.md §7 cost guard.
const cache = new Map<string, string>();
const cacheKey = (objectId: string, persona: Persona) =>
  `${objectId}|persona_brief|${persona}`;

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-gold" fill="none" aria-hidden>
      <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <g className="animate-orbit">
        <circle cx="22" cy="12" r="2" fill="currentColor" />
      </g>
    </svg>
  );
}

export function ExplainPanel({ objectId }: { objectId: string }) {
  const [persona, setPersona] = useState<Persona>("operator");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (p: Persona) => {
      const key = cacheKey(objectId, p);
      const cached = cache.get(key);
      if (cached) {
        setText(cached);
        setStatus("done");
        setError(null);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setText("");
      setError(null);
      setStatus("loading");

      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectId,
            mode: "persona_brief",
            persona: p,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const msg = await res.json().catch(() => null);
          throw new Error(msg?.error ?? `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            acc += chunk;
            // Reasoning models stay silent while "thinking"; keep the spinner
            // until the first real token, then switch to the typewriter.
            setStatus("streaming");
            setText(acc);
          }
        }
        cache.set(key, acc);
        setStatus("done");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong");
        setStatus("error");
      }
    },
    [objectId],
  );

  const selectPersona = useCallback(
    (p: Persona) => {
      setPersona(p);
      // Once activated, switching persona regenerates (or shows cache).
      if (status !== "idle") generate(p);
    },
    [status, generate],
  );

  const busy = status === "loading" || status === "streaming";

  return (
    <div className="rounded-sm border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted">
          AI Briefing
        </h3>
        <div className="flex gap-1">
          {PERSONAS.map((pp) => (
            <button
              key={pp.key}
              type="button"
              onClick={() => selectPersona(pp.key)}
              disabled={busy}
              className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50 ${
                persona === pp.key
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              {pp.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {status === "idle" && (
          <button
            type="button"
            onClick={() => generate(persona)}
            className="rounded-sm border border-gold bg-gold/10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-gold transition-colors hover:bg-gold/20"
          >
            Explain this score
          </button>
        )}

        {status === "loading" && (
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted">
            <Spinner />
            Analyzing…
          </div>
        )}

        {(status === "streaming" || status === "done") && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
            {text}
            {status === "streaming" && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-gold align-text-bottom" />
            )}
          </p>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <p className="text-sm text-scoreHigh">{error}</p>
            <button
              type="button"
              onClick={() => generate(persona)}
              className="rounded-sm border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted hover:text-text"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
