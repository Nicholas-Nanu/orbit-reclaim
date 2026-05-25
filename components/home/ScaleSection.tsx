import type { HomeAggregate } from "@/lib/home/aggregate";

const STATS = [
  { value: "54,000+", unit: "objects > 10 cm tracked", source: "ESA MASTER-8 (Aug 2024)" },
  { value: "~50%", unit: "post-mission disposal compliance", source: "IADC 25-yr guideline" },
  { value: "$150k", unit: "first FCC space-debris fine", source: "Dish EchoStar-7, Oct 2023" },
];

export default function ScaleSection({ aggregate }: { aggregate: HomeAggregate }) {
  return (
    <section className="border-b border-border bg-surface/30">
      <div className="mx-auto max-w-[1200px] px-10 py-20">
        <div className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-gold">
          The problem
        </div>
        <h2 className="mb-6 max-w-2xl text-3xl font-normal">
          The orbital environment is crowded, under-regulated, and economically
          unmanaged.
        </h2>
        <p className="mb-12 font-mono text-xs uppercase tracking-wider text-muted">
          Orbit Reclaim is scoring {aggregate.totalObjects.toLocaleString()} live
          catalogued objects · {aggregate.totalMassTonnes.toLocaleString()} t of
          mass on orbit
        </p>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.value} className="border-l-2 border-gold/40 py-2 pl-6">
              <div className="mb-2 font-mono text-5xl text-text">{s.value}</div>
              <div className="mb-1 text-sm text-muted">{s.unit}</div>
              <div className="font-mono text-xs text-muted/60">{s.source}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
