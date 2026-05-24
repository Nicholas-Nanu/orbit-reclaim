"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScoreBadge } from "./ScoreBadge";
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
};

type SortKey = keyof CatalogRow;
type SortDir = "asc" | "desc";

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
];

export function DebrisTable({ rows }: { rows: CatalogRow[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey, numeric: boolean) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numeric columns are most useful highest-first; text ascending.
      setSortDir(numeric ? "desc" : "asc");
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
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
          {sorted.map((row) => (
            <tr
              key={row.id}
              onClick={() => router.push(`/debris/${row.id}`)}
              className="cursor-pointer border-b border-border/60 transition-colors hover:bg-surface"
            >
              <td className="px-3 py-2 font-mono text-xs text-muted">
                {row.id}
              </td>
              <td className="px-3 py-2 font-medium">{row.name}</td>
              <td className="px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                {TYPE_LABEL.get(row.type) ?? row.type}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {row.altitudeKm.toLocaleString()}
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
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-3 py-12 text-center font-mono text-xs uppercase tracking-wider text-muted"
              >
                No objects match the current filters
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
