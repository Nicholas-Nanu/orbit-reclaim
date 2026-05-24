"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScoreResult } from "@/lib/scoring";
import { ConfidenceBadge, scoreTextClass } from "./ScoreBadge";

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
  const lowConf = result.confidence === "low";

  return (
    <div className="rounded-sm border border-border bg-surface">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted">
            {title}
          </h3>
          <ConfidenceBadge confidence={result.confidence} />
        </div>
        <span
          className={`font-mono text-3xl font-semibold tabular-nums ${scoreTextClass(result.score)} ${lowConf ? "opacity-60" : ""}`}
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
            <Tooltip cursor={false} content={<ChartTooltip labels={labels} />} />
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

      {/* Sub-score breakdown with physical / USD detail (METHODOLOGY §3–5). */}
      <div className="mt-2">
        {result.subScores.map((ss, i) => (
          <div
            key={ss.name}
            className="border-t border-border/50 px-4 py-2 first:border-t-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
                  style={{ backgroundColor: colorOf(i) }}
                />
                {ss.label}
                {ss.citation && (
                  <Link
                    href={`/methodology#${ss.citation.replace(/[§.]/g, "").trim()}`}
                    title={`Methodology ${ss.citation}`}
                    className="font-mono text-[9px] text-goldDim hover:text-gold"
                  >
                    {ss.citation}
                  </Link>
                )}
              </span>
              {ss.weight > 0 && (
                <span
                  className={`font-mono text-sm tabular-nums ${scoreTextClass(ss.score)}`}
                >
                  {ss.score.toFixed(0)}
                </span>
              )}
            </div>
            {ss.detail && (
              <p className="mt-0.5 pl-4 font-mono text-[10px] leading-relaxed text-muted">
                {ss.detail}
              </p>
            )}
            {ss.weight > 0 && (
              <p className="mt-0.5 pl-4 font-mono text-[9px] uppercase tracking-wider text-muted/70">
                weight {Math.round(ss.weight * 100)}% · contributes +
                {ss.contribution.toFixed(1)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
