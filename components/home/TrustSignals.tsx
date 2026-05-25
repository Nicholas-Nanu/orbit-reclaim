import Link from "next/link";

const FRAMEWORKS = [
  { label: "IADC 25-Year Guideline", anchor: "421" },
  { label: "FCC 5-Year Rule", anchor: "422" },
  { label: "ISO 24113", anchor: "423" },
  { label: "ESA Space Debris Mitigation Policy", anchor: "424" },
  { label: "NASA OTPS", anchor: "522" },
];

export default function TrustSignals() {
  return (
    <section className="border-b border-border bg-surface/30">
      <div className="mx-auto max-w-[1200px] px-10 py-20">
        <div className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-gold">
          Methodology and trust
        </div>
        <h2 className="mb-3 text-3xl font-normal">
          Built on the standards that govern the space environment.
        </h2>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-muted">
          Every score traces to a published source. The full scoring methodology
          — formulas, weights, citations, and worked examples — is open.
        </p>
        <div className="mb-8 flex flex-wrap gap-2">
          {FRAMEWORKS.map((f) => (
            <Link
              key={f.label}
              href={`/methodology#${f.anchor}`}
              className="rounded-sm border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted transition-colors duration-200 hover:border-gold hover:text-gold"
            >
              {f.label}
            </Link>
          ))}
        </div>
        <Link
          href="/methodology"
          className="font-mono text-xs uppercase tracking-wider text-gold hover:underline"
        >
          Read the full methodology (v2.1) →
        </Link>
      </div>
    </section>
  );
}
