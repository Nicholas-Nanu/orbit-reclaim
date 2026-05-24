"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ScoreBadge } from "@/components/ScoreBadge";
import { FilterPanel } from "@/components/FilterPanel";
import { parseFilters, matchesFilters } from "@/lib/catalog-filters";
import { useCycler } from "./useCycler";
import type { SceneApi } from "./CesiumScene";
import type { HeroObject } from "./types";

function GlobeLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-bg">
      <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-muted">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-gold" fill="none" aria-hidden>
          <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <g className="animate-orbit">
            <circle cx="22" cy="12" r="2" fill="currentColor" />
          </g>
        </svg>
        Initializing orbital view…
      </div>
    </div>
  );
}

const CesiumScene = dynamic(() => import("./CesiumScene"), {
  ssr: false,
  loading: () => <GlobeLoading />,
});

function DetailPanel({
  object,
  onClose,
}: {
  object: HeroObject;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-0 z-10 h-full w-80 border-l border-border bg-surface/95 backdrop-blur">
      <div className="flex items-start justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-semibold leading-tight">{object.name}</h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
            NORAD {object.id}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="font-mono text-muted hover:text-text"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border">
        <div className="bg-surface px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Altitude</p>
          <p className="mt-1 font-mono tabular-nums">
            {Math.round(object.altitudeKm).toLocaleString()}
            <span className="ml-1 text-xs text-muted">km</span>
          </p>
        </div>
        <div className="bg-surface px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Inclination</p>
          <p className="mt-1 font-mono tabular-nums">
            {object.inclinationDeg.toFixed(1)}
            <span className="ml-1 text-xs text-muted">°</span>
          </p>
        </div>
      </div>

      <div className="space-y-2 px-4 py-4">
        {(
          [
            ["Collision", object.collision],
            ["Compliance", object.compliance],
            ["Salvage", object.salvage],
            ["Composite", object.composite],
          ] as const
        ).map(([label, score]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</span>
            <ScoreBadge score={score} emphasis={label === "Composite"} />
          </div>
        ))}
      </div>

      <div className="px-4">
        <Link
          href={`/debris/${object.id}`}
          className="block rounded-sm border border-gold bg-gold/10 px-3 py-2 text-center font-mono text-xs uppercase tracking-wider text-gold transition-colors hover:bg-gold/20"
        >
          Open full brief →
        </Link>
      </div>
    </div>
  );
}

export default function GlobeView({ objects }: { objects: HeroObject[] }) {
  const [selected, setSelected] = useState<HeroObject | null>(null);
  const searchParams = useSearchParams();
  const filterKey = searchParams.toString();

  // Deep-link: ?sel=<noradId> pre-selects an object (shareable + draws its orbit).
  useEffect(() => {
    const sel = new URLSearchParams(window.location.search).get("sel");
    if (sel) {
      const o = objects.find((x) => x.id === sel);
      if (o) setSelected(o);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filters = useMemo(
    () => parseFilters(Object.fromEntries(searchParams.entries())),
    [searchParams],
  );

  const visible = useMemo(
    () => objects.filter((o) => matchesFilters(o, filters)),
    [objects, filters],
  );
  const visibleIds = useMemo(() => visible.map((o) => o.id), [visible]);

  // Deselect if the selected hero is filtered out.
  useEffect(() => {
    if (selected && !visibleIds.includes(selected.id)) setSelected(null);
  }, [selected, visibleIds]);

  // --- Auto-tour cycler (POLISH-4) ---
  const sceneApiRef = useRef<SceneApi | null>(null);
  const [cyclerOn, setCyclerOn] = useState(false);
  const { state: cyclerState } = useCycler({
    enabled: cyclerOn,
    count: visible.length,
    onAdvance: (i) => {
      const o = visible[i];
      if (o) sceneApiRef.current?.focusObject(o.id);
    },
  });
  const toggleCycler = () => {
    setCyclerOn((v) => {
      const next = !v;
      if (!next) sceneApiRef.current?.clearFocus();
      return next;
    });
  };

  // Booth flags: ?fullscreen=1 hides chrome; ?demo=1 also auto-starts the tour.
  const demoParam = searchParams.get("demo") === "1";
  const fullscreen = searchParams.get("fullscreen") === "1" || demoParam;
  useEffect(() => {
    if (demoParam) setCyclerOn(true);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 overflow-hidden bg-bg"
          : "relative h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-bg"
      }
    >
      <CesiumScene
        objects={objects}
        visibleIds={visibleIds}
        colorLens={filters.colorLens}
        showAmbient={filters.showAmbient}
        filterKey={filterKey}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        onReady={(api) => {
          sceneApiRef.current = api;
          // Cold-start: if the tour is already on (e.g. ?demo=1), focus the
          // first object immediately rather than waiting for the next tick.
          if (cyclerOn && visible.length > 0) api.focusObject(visible[0].id);
        }}
      />
      {!fullscreen && <FilterPanel variant="globe" />}
      {!fullscreen && (
        <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
          <Link
            href={(() => {
              const p = new URLSearchParams(searchParams.toString());
              p.set("fullscreen", "1");
              return `/globe?${p.toString()}`;
            })()}
            className="rounded-sm border border-border bg-surface/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted backdrop-blur hover:text-text"
          >
            ⛶ Fullscreen
          </Link>
          <span className="pointer-events-none text-right font-mono text-[10px] uppercase tracking-widest text-muted">
            {visible.length} / {objects.length} heroes
            <br />
            drag to orbit · scroll to zoom
          </span>
        </div>
      )}
      {fullscreen && (
        <Link
          href="/globe"
          className="absolute right-4 top-4 z-10 rounded-sm border border-border bg-surface/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted backdrop-blur hover:text-text"
        >
          Exit ↗
        </Link>
      )}

      <div className="absolute bottom-16 left-4 z-10 flex items-center gap-3 rounded-sm border border-border bg-surface/90 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={toggleCycler}
          className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text"
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              cyclerOn
                ? cyclerState === "running"
                  ? "animate-pulse bg-gold"
                  : "bg-muted"
                : "bg-border"
            }`}
          />
          Auto-tour
          {cyclerOn
            ? cyclerState === "running"
              ? " · playing"
              : " · paused"
            : " · off"}
        </button>
        {cyclerOn && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {visible.length === 0
              ? "no matches"
              : cyclerState === "paused"
                ? "resuming after idle…"
                : `${visible.length} objects`}
          </span>
        )}
      </div>

      {cyclerOn && selected && (
        <div
          key={selected.id}
          className="animate-caption pointer-events-none absolute bottom-28 left-1/2 z-10 -translate-x-1/2 text-center"
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Now showing
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-gold">
            {selected.name}
          </p>
        </div>
      )}

      {!fullscreen && selected && (
        <DetailPanel object={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
