"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ALTITUDE_BANDS,
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

export function FilterPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = useCallback(
    (key: string): string[] => {
      const v = searchParams.get(key);
      return v ? v.split(",").filter(Boolean) : [];
    },
    [searchParams],
  );

  const commit = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const toggleMulti = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const set = new Set(current(key));
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size) params.set(key, Array.from(set).join(","));
      else params.delete(key);
      commit(params);
    },
    [searchParams, current, commit],
  );

  const setStatus = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") params.delete("status");
      else params.set("status", value);
      commit(params);
    },
    [searchParams, commit],
  );

  const clearAll = useCallback(() => {
    commit(new URLSearchParams());
  }, [commit]);

  const status = searchParams.get("status") ?? "all";
  const hasAny = ["alt", "jur", "type"].some((k) => current(k).length) ||
    status !== "all";

  return (
    <aside className="w-56 shrink-0 border-r border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Filters
        </span>
        {hasAny && (
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
          <Chip
            key={b.key}
            active={current("alt").includes(b.key)}
            onClick={() => toggleMulti("alt", b.key)}
          >
            {b.label}
          </Chip>
        ))}
      </Section>

      <Section title="Jurisdiction">
        {JURISDICTIONS.map((j) => (
          <Chip
            key={j}
            active={current("jur").includes(j)}
            onClick={() => toggleMulti("jur", j)}
          >
            {j}
          </Chip>
        ))}
      </Section>

      <Section title="Type">
        {TYPES.map((t) => (
          <Chip
            key={t.key}
            active={current("type").includes(t.key)}
            onClick={() => toggleMulti("type", t.key)}
          >
            {t.label}
          </Chip>
        ))}
      </Section>

      <Section title="Mission status">
        {STATUSES.map((s) => (
          <Chip
            key={s.key}
            active={status === s.key}
            onClick={() => setStatus(s.key)}
          >
            {s.label}
          </Chip>
        ))}
      </Section>
    </aside>
  );
}
