"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScoreResult } from "@/lib/scoring";
import { scoreTextClass } from "./ScoreBadge";

// On-brand, distinguishable segment colors (gold → orange → amber → muted).
const PALETTE = ["#ffe11f", "#ff6b35", "#e0a82e", "#9a8a3a", "#6b7280", "#9ca3af"];

type TooltipEntry = { name: string; value: number; color: string };

function ChartTooltip({
  active,
  payload,
  labels,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  labels: Map<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-sm border border-border bg-bg px-2 py-1 font-mono text-[11px]">
      <span style={{ color: entry.color }}>{labels.get(entry.name) ?? entry.name}</span>
      <span className="ml-2 tabular-nums text-text">
        +{entry.value.toFixed(1)}
      </span>
    </div>
  );
}

export function ScoreBreakdown({
  title,
  result,
}: {
  title: string;
  result: ScoreResult;
}) {
  const data = [
    Object.fromEntries(result.factors.map((f) => [f.name, f.contribution])),
  ];
  const labels = new Map(result.factors.map((f) => [f.name, f.label]));
  const colorOf = (i: number) => PALETTE[i % PALETTE.length];

  return (
    <div className="rounded-sm border border-border bg-surface">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted">
          {title}
        </h3>
        <span
          className={`font-mono text-3xl font-semibold tabular-nums ${scoreTextClass(result.score)}`}
        >
          {result.score.toFixed(1)}
        </span>
      </div>

      <div className="px-4 pt-4">
        <ResponsiveContainer width="100%" height={28}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" hide />
            <Tooltip
              cursor={false}
              content={<ChartTooltip labels={labels} />}
            />
            {result.factors.map((f, i) => (
              <Bar
                key={f.name}
                dataKey={f.name}
                stackId="score"
                fill={colorOf(i)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          <span>0</span>
          <span>100</span>
        </div>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="px-4 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider">
              Factor
            </th>
            <th className="px-2 py-1.5 text-right font-mono text-[10px] uppercase tracking-wider">
              Weight
            </th>
            <th className="px-2 py-1.5 text-right font-mono text-[10px] uppercase tracking-wider">
              Raw
            </th>
            <th className="px-4 py-1.5 text-right font-mono text-[10px] uppercase tracking-wider">
              Contrib
            </th>
          </tr>
        </thead>
        <tbody>
          {result.factors.map((f, i) => (
            <tr key={f.name} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-1.5">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
                    style={{ backgroundColor: colorOf(i) }}
                  />
                  {f.label}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted">
                {Math.round(f.weight * 100)}%
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted">
                {f.rawValue.toFixed(2)}
              </td>
              <td className="px-4 py-1.5 text-right font-mono tabular-nums">
                {f.contribution.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
