"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ALTITUDE_BANDS,
  COLOR_LENSES,
  JURISDICTIONS,
  STATUSES,
  TYPES,
} from "@/lib/catalog-filters";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
        active
          ? "border-gold bg-gold/10 text-gold"
          : "border-border text-muted hover:border-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-4 py-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ScoreSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
        <span>{label}</span>
        <span className={value > 0 ? "text-gold" : ""}>≥ {value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-gold"
        aria-label={`${label} minimum`}
      />
    </div>
  );
}

export function FilterPanel({
  variant = "dashboard",
}: {
  variant?: "dashboard" | "globe";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const current = useCallback(
    (key: string): string[] => {
      const v = searchParams.get(key);
      return v ? v.split(",").filter(Boolean) : [];
    },
    [searchParams],
  );

  const write = useCallback(
    (mutate: (p: URLSearchParams) => void, replace = false) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page"); // any filter change returns to page 1
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const toggleMulti = (key: string, value: string) =>
    write((p) => {
      const set = new Set(current(key));
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size) p.set(key, Array.from(set).join(","));
      else p.delete(key);
    });

  const setStatus = (value: string) =>
    write((p) => (value === "all" ? p.delete("status") : p.set("status", value)));

  const setScore = (key: string, v: number) =>
    write((p) => (v > 0 ? p.set(key, String(v)) : p.delete(key)), true);

  const setSingle = (key: string, value: string, isDefault: boolean) =>
    write((p) => (isDefault ? p.delete(key) : p.set(key, value)));

  const clearAll = () =>
    write((p) => Array.from(p.keys()).forEach((k) => p.delete(k)));

  const status = searchParams.get("status") ?? "all";
  const cMin = Math.max(0, Math.min(100, Number(searchParams.get("cMin")) || 0));
  const pMin = Math.max(0, Math.min(100, Number(searchParams.get("pMin")) || 0));
  const sMin = Math.max(0, Math.min(100, Number(searchParams.get("sMin")) || 0));
  const showAmbient = searchParams.get("amb") !== "0";
  const lens = searchParams.get("lens") ?? "composite";

  const activeCount =
    current("alt").length +
    current("jur").length +
    current("type").length +
    (status !== "all" ? 1 : 0) +
    (cMin > 0 ? 1 : 0) +
    (pMin > 0 ? 1 : 0) +
    (sMin > 0 ? 1 : 0);

  const controls = (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="font-mono text-[10px] uppercase tracking-wider text-goldDim hover:text-gold"
          >
            Clear
          </button>
        )}
      </div>

      <Section title="Altitude">
        {ALTITUDE_BANDS.map((b) => (
          <Chip key={b.key} active={current("alt").includes(b.key)} onClick={() => toggleMulti("alt", b.key)}>
            {b.label}
          </Chip>
        ))}
      </Section>

      <Section title="Jurisdiction">
        {JURISDICTIONS.map((j) => (
          <Chip key={j} active={current("jur").includes(j)} onClick={() => toggleMulti("jur", j)}>
            {j}
          </Chip>
        ))}
      </Section>

      <Section title="Type">
        {TYPES.map((t) => (
          <Chip key={t.key} active={current("type").includes(t.key)} onClick={() => toggleMulti("type", t.key)}>
            {t.label}
          </Chip>
        ))}
      </Section>

      <Section title="Mission status">
        {STATUSES.map((s) => (
          <Chip key={s.key} active={status === s.key} onClick={() => setStatus(s.key)}>
            {s.label}
          </Chip>
        ))}
      </Section>

      <div className="border-b border-border px-4 py-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">
          Score thresholds
        </p>
        <ScoreSlider label="Collision" value={cMin} onChange={(v) => setScore("cMin", v)} />
        <ScoreSlider label="Compliance" value={pMin} onChange={(v) => setScore("pMin", v)} />
        <ScoreSlider label="Salvage" value={sMin} onChange={(v) => setScore("sMin", v)} />
      </div>

      {variant === "globe" && (
        <>
          <Section title="Color lens">
            {COLOR_LENSES.map((l) => (
              <Chip
                key={l.key}
                active={lens === l.key}
                onClick={() => setSingle("lens", l.key, l.key === "composite")}
              >
                {l.label}
              </Chip>
            ))}
          </Section>
          <div className="px-4 py-4">
            <Chip
              active={showAmbient}
              onClick={() => setSingle("amb", "0", showAmbient ? false : true)}
            >
              Catalog cloud {showAmbient ? "on" : "off"}
            </Chip>
          </div>
        </>
      )}
    </>
  );

  if (variant === "globe") {
    return (
      <div className="absolute left-4 top-4 z-10 w-60">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-sm border border-border bg-surface/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted backdrop-blur hover:text-text"
          >
            Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
        ) : (
          <div className="max-h-[80vh] overflow-y-auto rounded-sm border border-border bg-surface/95 backdrop-blur">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-between border-b border-border px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted hover:text-text"
            >
              <span>Collapse</span>
              <span>▲</span>
            </button>
            {controls}
          </div>
        )}
      </div>
    );
  }

  return <aside className="w-56 shrink-0 border-r border-border">{controls}</aside>;
}
