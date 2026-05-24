"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ScoreBadge } from "./ScoreBadge";
import { formatUsd } from "@/lib/format";
import { TYPES } from "@/lib/catalog-filters";

export type CatalogRow = {
  id: string;
  name: string;
  type: string;
  altitudeKm: number;
  inclinationDeg: number;
  collision: number;
  compliance: number;
  salvage: number;
  composite: number;
  nsvToday: number | null;
  yearsOverdue: number | null;
};

type SortKey =
  | "id"
  | "name"
  | "type"
  | "altitudeKm"
  | "inclinationDeg"
  | "collision"
  | "compliance"
  | "salvage"
  | "composite"
  | "nsvToday"
  | "yearsOverdue";

const MAX_COMPARE = 3;
const TYPE_LABEL = new Map<string, string>(TYPES.map((t) => [t.key, t.label]));

const COLUMNS: {
  key: SortKey;
  label: string;
  numeric: boolean;
  align: "left" | "right";
}[] = [
  { key: "id", label: "NORAD", numeric: false, align: "left" },
  { key: "name", label: "Name", numeric: false, align: "left" },
  { key: "type", label: "Type", numeric: false, align: "left" },
  { key: "altitudeKm", label: "Alt (km)", numeric: true, align: "right" },
  { key: "inclinationDeg", label: "Incl (°)", numeric: true, align: "right" },
  { key: "collision", label: "Collision", numeric: true, align: "right" },
  { key: "compliance", label: "Compliance", numeric: true, align: "right" },
  { key: "salvage", label: "Salvage", numeric: true, align: "right" },
  { key: "composite", label: "Composite", numeric: true, align: "right" },
  { key: "nsvToday", label: "NSV (today)", numeric: true, align: "right" },
  { key: "yearsOverdue", label: "Overdue", numeric: true, align: "right" },
];

export function DebrisTable({
  rows,
  sortKey,
  sortDir,
  page,
  totalPages,
  total,
}: {
  rows: CatalogRow[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  totalPages: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pushParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  function toggleSort(key: SortKey, numeric: boolean) {
    pushParams((p) => {
      if (key === sortKey) {
        p.set("dir", sortDir === "asc" ? "desc" : "asc");
      } else {
        p.set("sort", key);
        p.set("dir", numeric ? "desc" : "asc");
      }
      p.delete("page");
    });
  }

  function goToPage(n: number) {
    pushParams((p) => {
      if (n <= 1) p.delete("page");
      else p.set("page", String(n));
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  }

  const canCompare = selected.size >= 2 && selected.size <= MAX_COMPARE;

  function compare() {
    if (!canCompare) return;
    router.push(`/compare?ids=${Array.from(selected).join(",")}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 px-2 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {selected.size > 0
            ? `${selected.size} selected (max ${MAX_COMPARE})`
            : "Select 2–3 rows to compare"}
        </span>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-text"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={compare}
            disabled={!canCompare}
            className="rounded-sm border border-gold bg-gold/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-muted"
          >
            Compare selected
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-bg">
            <tr className="border-b border-border">
              <th className="w-8 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted">
                Cmp
              </th>
              {COLUMNS.map((col) => {
                const active = col.key === sortKey;
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key, col.numeric)}
                    className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-mono text-[10px] uppercase tracking-wider ${
                      col.align === "right" ? "text-right" : "text-left"
                    } ${active ? "text-gold" : "text-muted"} hover:text-text`}
                  >
                    {col.label}
                    <span className="ml-1 inline-block w-2">
                      {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = selected.has(row.id);
              const disabled = !isSelected && selected.size >= MAX_COMPARE;
              return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/debris/${row.id}`)}
                  className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-surface ${
                    isSelected ? "bg-surface" : ""
                  }`}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => toggleSelect(row.id)}
                      aria-label={`Select ${row.name} to compare`}
                      className="h-3.5 w-3.5 accent-gold disabled:opacity-30"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{row.id}</td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                    {TYPE_LABEL.get(row.type) ?? row.type}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {Math.round(row.altitudeKm).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {row.inclinationDeg.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ScoreBadge score={row.collision} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ScoreBadge score={row.compliance} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ScoreBadge score={row.salvage} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ScoreBadge score={row.composite} emphasis />
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono tabular-nums ${
                      row.nsvToday != null && row.nsvToday >= 0
                        ? "text-gold"
                        : "text-muted"
                    }`}
                  >
                    {row.nsvToday != null ? formatUsd(row.nsvToday) : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono tabular-nums ${
                      row.yearsOverdue && row.yearsOverdue > 0
                        ? "text-scoreHigh"
                        : "text-muted"
                    }`}
                  >
                    {row.yearsOverdue && row.yearsOverdue > 0
                      ? `${row.yearsOverdue} yr`
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="px-3 py-12 text-center font-mono text-xs uppercase tracking-wider text-muted"
                >
                  No objects match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted">
        <span>
          Page {page} / {totalPages} · {total.toLocaleString()} objects
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded-sm border border-border px-2 py-1 hover:text-text disabled:opacity-30"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="rounded-sm border border-border px-2 py-1 hover:text-text disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
