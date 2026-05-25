import Link from "next/link";
import { formatUsd } from "@/lib/format";
import { ScoreBadge, ConfidenceBadge } from "@/components/ScoreBadge";
import type { ObjectScores } from "@/lib/scoring";
import type { DebrisObject } from "@/lib/db/schema";

export default function FeaturedObject({
  featured,
  whyText,
}: {
  featured: { object: DebrisObject; scores: ObjectScores } | null;
  whyText: string;
}) {
  if (!featured) return null;
  const { object, scores } = featured;
  const nsv = Number(scores.salvage.meta?.nsvTodayUsd ?? 0);

  const lenses = [
    { label: "Collision", v: scores.collisionRisk.score },
    { label: "Compliance", v: scores.compliance.score },
    { label: "Salvage", v: scores.salvage.score },
  ];

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1200px] px-10 py-20">
        <div className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-gold">
          Today&apos;s notable object
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-normal">{object.name}</h2>
              <span className="rounded-sm border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-gold">
                {object.jurisdiction ?? "—"}
              </span>
              <ConfidenceBadge confidence={scores.confidence} />
            </div>
            <p className="mt-2 flex flex-wrap gap-4 font-mono text-xs uppercase tracking-wider text-muted">
              <span>NORAD {object.id}</span>
              <span>{object.type.replace(/_/g, " ")}</span>
              <span>{Math.round(object.altitudeKm).toLocaleString()} km</span>
              <span>{object.inclinationDeg.toFixed(1)}°</span>
            </p>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-text/90">
              {whyText}
            </p>
            <Link
              href={`/debris/${object.id}`}
              className="mt-6 inline-block font-mono text-xs uppercase tracking-wider text-gold hover:underline"
            >
              Open full brief →
            </Link>
          </div>

          <div className="border border-border bg-surface p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Composite
              </span>
              <ScoreBadge score={scores.composite} emphasis />
            </div>
            <div className="space-y-2 py-3">
              {lenses.map((l) => (
                <div key={l.label} className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                    {l.label}
                  </span>
                  <ScoreBadge score={l.v} />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-sm tabular-nums">
              <span className="text-[10px] uppercase tracking-widest text-muted">
                NSV today
              </span>
              <span className={nsv >= 0 ? "text-gold" : "text-muted"}>
                {formatUsd(nsv)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
