"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scoreObject, type ScoringInput, type ObjectScores } from "@/lib/scoring";
import { formatUsd } from "@/lib/format";
import type {
  DebrisType,
  Jurisdiction,
  MaterialClass,
  MissionStatus,
} from "@/lib/db/schema";
import { AiOutput } from "./AiOutput";

type Baseline = ScoringInput & { id: string; name: string };
type Overrides = Partial<ScoringInput>;
type Tab = "orbital" | "physical" | "regulatory";

const MATERIALS: MaterialClass[] = [
  "al_li_alloy",
  "titanium",
  "comsat_electronics",
  "eo_satellite",
  "mixed",
  "unknown",
];
const JURISDICTIONS: Jurisdiction[] = ["US", "ESA", "JP", "CN", "RU", "IN", "OTHER"];
const STATUSES: MissionStatus[] = ["active", "defunct", "unknown"];

const PRESETS: { name: string; overrides: Overrides }[] = [
  {
    name: "Deorbit-ready",
    overrides: { hasThrusters: true, hasPropellant: true, missionStatus: "active" },
  },
  { name: "Migrate to FCC (US)", overrides: { jurisdiction: "US" } },
  { name: "Lower to 400 km", overrides: { altitudeKm: 400 } },
  { name: "Fragmented", overrides: { intact: false, type: "fragment" as DebrisType } },
];

const SAVED_KEY = "orbit-reclaim-whatif-presets";

// ── Small controls ──

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  changed,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  changed: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-wider">
        <span className={changed ? "text-gold" : "text-muted"}>{label}</span>
        <span className={changed ? "text-gold" : "text-text"}>
          {value.toLocaleString()} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-gold"
        aria-label={label}
      />
    </div>
  );
}

function Dropdown<T extends string>({
  label,
  value,
  options,
  changed,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  changed: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-3">
      <p className={`mb-1 font-mono text-[10px] uppercase tracking-wider ${changed ? "text-gold" : "text-muted"}`}>
        {label}
      </p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  value,
  changed,
  onChange,
}: {
  label: string;
  value: boolean;
  changed: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`mb-2 mr-2 inline-flex items-center gap-2 rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
        value
          ? "border-gold bg-gold/10 text-gold"
          : "border-border text-muted hover:text-text"
      } ${changed ? "ring-1 ring-gold/40" : ""}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${value ? "bg-gold" : "bg-border"}`} />
      {label}
    </button>
  );
}

// ── Score card with baseline → modified delta ──

function ScoreCard({
  title,
  base,
  next,
  goodDirection,
}: {
  title: string;
  base: number;
  next: number;
  goodDirection: "down" | "up" | "neutral";
}) {
  const delta = Math.round((next - base) * 10) / 10;
  const improved =
    goodDirection === "neutral"
      ? null
      : goodDirection === "down"
        ? delta < 0
        : delta > 0;
  const color =
    delta === 0 || improved === null
      ? "text-muted"
      : improved
        ? "text-gold"
        : "text-scoreHigh";
  return (
    <div className="rounded-sm border border-border bg-surface px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{title}</p>
      <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
        <span className="text-muted">{base.toFixed(1)}</span>
        <span className="text-muted">→</span>
        <span className="text-lg font-semibold text-text">{next.toFixed(1)}</span>
        {delta !== 0 && (
          <span className={`text-xs ${color}`}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

export function WhatIfSimulator({
  baseline,
  quantiles,
}: {
  baseline: Baseline;
  quantiles: number[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("orbital");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [saved, setSaved] = useState<{ name: string; overrides: Overrides }[]>([]);
  const [presetName, setPresetName] = useState("");

  const [narration, setNarration] = useState("");
  const [narrStatus, setNarrStatus] = useState<"idle" | "loading" | "streaming" | "done" | "error">("idle");
  const abortRef = useRef<AbortController | null>(null);

  // Load saved presets once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const effective = useMemo(
    () => ({ ...baseline, ...overrides }) as Baseline,
    [baseline, overrides],
  );

  // Live recompute — pure, sub-millisecond. Quantiles approximate the percentile.
  const baseScores: ObjectScores = useMemo(
    () => scoreObject(baseline, undefined, quantiles),
    [baseline, quantiles],
  );
  const nextScores: ObjectScores = useMemo(
    () => scoreObject(effective, undefined, quantiles),
    [effective, quantiles],
  );

  const dirty = Object.keys(overrides).length > 0;
  const isChanged = (key: keyof ScoringInput) => key in overrides;

  const setOverride = useCallback(
    <K extends keyof ScoringInput>(key: K, value: ScoringInput[K]) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (value === baseline[key]) delete next[key];
        else next[key] = value;
        return next;
      });
    },
    [baseline],
  );

  // Debounced AI narration whenever overrides change.
  useEffect(() => {
    abortRef.current?.abort();
    if (!dirty) {
      setNarration("");
      setNarrStatus("idle");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setNarrStatus("loading");
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "what-if", objectId: baseline.id, overrides }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setNarration(acc);
          setNarrStatus("streaming");
        }
        setNarrStatus("done");
      } catch {
        if (!controller.signal.aborted) setNarrStatus("error");
      }
    }, 800);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(overrides), baseline.id]);

  const reset = () => setOverrides({});
  const applyPreset = (o: Overrides) =>
    setOverrides((prev) => {
      // merge, then drop keys equal to baseline
      const merged: Overrides = { ...prev, ...o };
      for (const k of Object.keys(merged) as (keyof ScoringInput)[]) {
        if (merged[k] === baseline[k]) delete merged[k];
      }
      return merged;
    });
  const saveScenario = () => {
    if (!presetName.trim() || !dirty) return;
    const next = [...saved, { name: presetName.trim(), overrides }];
    setSaved(next);
    setPresetName("");
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const deleteSaved = (i: number) => {
    const next = saved.filter((_, idx) => idx !== i);
    setSaved(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm border border-gold bg-gold/10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-gold transition-colors hover:bg-gold/20"
      >
        ⚙ Open what-if simulator
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close simulator"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-bg shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">What-if simulator</h2>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {baseline.name} · NORAD {baseline.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="font-mono text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            {/* Score cards */}
            <div className="grid grid-cols-2 gap-2 px-5 py-4">
              <ScoreCard title="Collision" base={baseScores.collisionRisk.score} next={nextScores.collisionRisk.score} goodDirection="down" />
              <ScoreCard title="Compliance" base={baseScores.compliance.score} next={nextScores.compliance.score} goodDirection="down" />
              <ScoreCard title="Salvage" base={baseScores.salvage.score} next={nextScores.salvage.score} goodDirection="up" />
              <ScoreCard title="Composite" base={baseScores.composite} next={nextScores.composite} goodDirection="neutral" />
            </div>

            {/* NSV USD readout */}
            <div className="mx-5 mb-3 flex items-center justify-between rounded-sm border border-border bg-surface px-3 py-2 font-mono text-xs tabular-nums">
              <span className="text-[10px] uppercase tracking-widest text-muted">NSV today</span>
              <span>
                <span className="text-muted">{formatUsd(Number(baseScores.salvage.meta?.nsvTodayUsd ?? 0))}</span>
                <span className="mx-1 text-muted">→</span>
                <span className={Number(nextScores.salvage.meta?.nsvTodayUsd ?? 0) >= 0 ? "text-gold" : "text-text"}>
                  {formatUsd(Number(nextScores.salvage.meta?.nsvTodayUsd ?? 0))}
                </span>
              </span>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border px-5">
              {(["orbital", "physical", "regulatory"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    tab === t ? "border-gold text-gold" : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="flex-1 px-5 py-4">
              {tab === "orbital" && (
                <>
                  <Slider label="Altitude" value={effective.altitudeKm} min={200} max={40000} step={10} unit="km" changed={isChanged("altitudeKm")} onChange={(v) => setOverride("altitudeKm", v)} />
                  <Slider label="Inclination" value={effective.inclinationDeg} min={0} max={120} step={0.5} unit="°" changed={isChanged("inclinationDeg")} onChange={(v) => setOverride("inclinationDeg", v)} />
                  <Slider label="Δv to reach" value={effective.deltaVToReachKms ?? 0} min={0} max={6} step={0.1} unit="km/s" changed={isChanged("deltaVToReachKms")} onChange={(v) => setOverride("deltaVToReachKms", v)} />
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                    Eccentricity {effective.eccentricity.toFixed(4)} (read-only)
                  </p>
                </>
              )}
              {tab === "physical" && (
                <>
                  <Slider label="Mass" value={effective.massKg} min={0} max={15000} step={50} unit="kg" changed={isChanged("massKg")} onChange={(v) => setOverride("massKg", v)} />
                  <Slider label="Cross-section" value={effective.crossSectionM2} min={0} max={120} step={0.5} unit="m²" changed={isChanged("crossSectionM2")} onChange={(v) => setOverride("crossSectionM2", v)} />
                  <Dropdown label="Material class" value={(effective.materialClass ?? "unknown") as MaterialClass} options={MATERIALS} changed={isChanged("materialClass")} onChange={(v) => setOverride("materialClass", v)} />
                  <Toggle label="Intact" value={effective.intact} changed={isChanged("intact")} onChange={(v) => setOverride("intact", v)} />
                </>
              )}
              {tab === "regulatory" && (
                <>
                  <Dropdown label="Jurisdiction" value={(effective.jurisdiction ?? "OTHER") as Jurisdiction} options={JURISDICTIONS} changed={isChanged("jurisdiction")} onChange={(v) => setOverride("jurisdiction", v)} />
                  <Dropdown label="Mission status" value={(effective.missionStatus ?? "unknown") as MissionStatus} options={STATUSES} changed={isChanged("missionStatus")} onChange={(v) => setOverride("missionStatus", v)} />
                  <Slider label="End-of-life year" value={effective.endOfLifeYear ?? 2000} min={1960} max={2026} step={1} changed={isChanged("endOfLifeYear")} onChange={(v) => setOverride("endOfLifeYear", v)} />
                  <div className="mt-1">
                    <Toggle label="Has thrusters" value={effective.hasThrusters} changed={isChanged("hasThrusters")} onChange={(v) => setOverride("hasThrusters", v)} />
                    <Toggle label="Has propellant" value={effective.hasPropellant} changed={isChanged("hasPropellant")} onChange={(v) => setOverride("hasPropellant", v)} />
                  </div>
                </>
              )}
            </div>

            {/* Presets */}
            <div className="border-t border-border px-5 py-3">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">Presets</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p.name} type="button" onClick={() => applyPreset(p.overrides)} className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted hover:border-gold hover:text-gold">
                    {p.name}
                  </button>
                ))}
                {saved.map((p, i) => (
                  <span key={`${p.name}-${i}`} className="inline-flex items-center gap-1 rounded-sm border border-goldDim/40 bg-gold/5 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-goldDim">
                    <button type="button" onClick={() => applyPreset(p.overrides)} className="hover:text-gold">{p.name}</button>
                    <button type="button" onClick={() => deleteSaved(i)} aria-label="Delete preset" className="text-muted hover:text-scoreHigh">✕</button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Name this scenario…"
                  className="min-w-0 flex-1 rounded-sm border border-border bg-bg px-2 py-1 font-mono text-[11px] text-text placeholder:text-muted"
                />
                <button type="button" onClick={saveScenario} disabled={!dirty || !presetName.trim()} className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted hover:text-text disabled:opacity-40">
                  Save
                </button>
                <button type="button" onClick={reset} disabled={!dirty} className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted hover:text-text disabled:opacity-40">
                  Reset
                </button>
              </div>
            </div>

            {/* AI narration */}
            <div className="border-t border-border px-5 py-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">AI narration</p>
              {!dirty && <p className="text-xs text-muted">Adjust an input to see how the scores change and why.</p>}
              {dirty && narrStatus === "loading" && <p className="text-xs text-muted">Analyzing change…</p>}
              {dirty && (narrStatus === "streaming" || narrStatus === "done") && (
                <AiOutput text={narration} streaming={narrStatus === "streaming"} />
              )}
              {dirty && narrStatus === "error" && <p className="text-xs text-scoreHigh">Narration failed — adjust again to retry.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
