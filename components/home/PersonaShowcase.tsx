const PERSONAS = [
  {
    title: "Satellite operators",
    body: "Identify and avoid the highest-risk objects in your constellation's regime.",
  },
  {
    title: "Insurers",
    body: "Quantify portfolio collision exposure with per-object PoC and consequence severity.",
  },
  {
    title: "Removal providers",
    body: "Rank potential targets by net salvage value in USD, today and projected to 2035.",
  },
  {
    title: "Space agencies",
    body: "Surface jurisdictionally-owned objects most overdue against active regulations.",
  },
];

export default function PersonaShowcase() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1200px] px-10 py-20">
        <div className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-gold">
          Built for
        </div>
        <h2 className="mb-12 text-3xl font-normal">
          One model, four decisions.
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PERSONAS.map((p) => (
            <div key={p.title} className="border border-border bg-surface p-6">
              <div className="mb-3 font-mono text-xs uppercase tracking-[0.15em] text-text">
                {p.title}
              </div>
              <p className="text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
