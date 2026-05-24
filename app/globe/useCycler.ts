"use client";

import { useEffect, useRef, useState } from "react";

export type CyclerState = "off" | "running" | "paused";

/**
 * Auto-tour state machine: when enabled, fires onAdvance(index) every
 * `advanceMs`, cycling through `count` items. User interaction pauses it;
 * it resumes after `idleMs` of inactivity.
 */
export function useCycler(opts: {
  enabled: boolean;
  count: number;
  onAdvance: (index: number) => void;
  advanceMs?: number;
  idleMs?: number;
}): { state: CyclerState } {
  const { enabled, count } = opts;
  const advanceMs = opts.advanceMs ?? 10000;
  const idleMs = opts.idleMs ?? 30000;

  const [state, setState] = useState<CyclerState>("off");
  const indexRef = useRef(0);
  const countRef = useRef(count);
  countRef.current = count;
  const onAdvanceRef = useRef(opts.onAdvance);
  onAdvanceRef.current = opts.onAdvance;

  useEffect(() => {
    setState(enabled ? "running" : "off");
  }, [enabled]);

  // Advance loop.
  useEffect(() => {
    if (state !== "running" || count === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const c = countRef.current;
      if (c > 0) {
        if (indexRef.current >= c) indexRef.current = 0;
        onAdvanceRef.current(indexRef.current);
        indexRef.current = (indexRef.current + 1) % c;
      }
      timer = setTimeout(tick, advanceMs);
    };
    timer = setTimeout(tick, 800); // let the intro settle first
    return () => clearTimeout(timer);
  }, [state, count, advanceMs]);

  // Pause on interaction; resume after idle.
  useEffect(() => {
    if (!enabled) return;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const onInteract = () => {
      setState((s) => (s === "running" ? "paused" : s));
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => setState((s) => (s === "paused" ? "running" : s)),
        idleMs,
      );
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
    events.forEach((e) =>
      window.addEventListener(e, onInteract, { passive: true }),
    );
    return () => {
      events.forEach((e) => window.removeEventListener(e, onInteract));
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [enabled, idleMs]);

  return { state };
}
