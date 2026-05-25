import Link from "next/link";
import { formatUsd } from "@/lib/format";
import type { HomeAggregate } from "@/lib/home/aggregate";

export default function LensCards({ aggregate }: { aggregate: HomeAggregate }) {
  const top = aggregate.topByLens;
  const lenses = [
    {
      id: "collision",
      title: "Collision Risk",
      tag: "Probability × consequence × cascade contribution",
      primary: `${top.collisionRisk.score.toFixed(1)} composite`,
      secondary: top.collisionRisk.name,
      href: "/catalog?sort=collision&dir=desc",
    },
    {
      id: "compliance",
      title: "Compliance Urgency",
      tag: "Per-object regulatory regime engine, USD penalty exposure",
      primary: `${aggregate.overdueCount.toLocaleString()} overdue`,
      secondary: `${formatUsd(aggregate.totalPenaltyExposureUsd)} total exposure`,
      href: "/catalog?sort=compliance&dir=desc",
    },
    {
      id: "salvage",
      title: "Salvage Value",
      tag: "Material + strategic premium − mission cost, in real USD",
      primary: `${aggregate.economicallyRemovableTodayCount.toLocaleString()} removable today`,
      secondary: `${formatUsd(aggregate.totalNsvTodayUsd)} NSV available`,
      href: "/catalog?sort=salvage&dir=desc",
    },
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1200px] px-10 py-20">
        <div className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-gold">
          Three lenses
        </div>
        <h2 className="mb-12 text-3xl font-normal">
          Every object, three perspectives, full transparency.
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {lenses.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              className="group block border border-border bg-surface p-6 transition-colors duration-200 hover:border-gold"
            >
              <div className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-muted">
                {l.title}
              </div>
              <div className="mb-6 text-sm text-muted">{l.tag}</div>
              <div className="mb-1 font-mono text-2xl text-text">{l.primary}</div>
              <div className="font-mono text-sm text-muted">{l.secondary}</div>
              <div className="mt-6 font-mono text-xs text-gold group-hover:underline">
                View ranking →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
