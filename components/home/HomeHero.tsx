import Link from "next/link";

export default function HomeHero() {
  return (
    <section className="relative min-h-[620px] overflow-hidden border-b border-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-orbit.svg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-95"
      />
      <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-10 pb-24 pt-28 lg:grid-cols-[minmax(0,1fr)_480px]">
        <div>
          <div className="mb-6 font-mono text-sm tracking-[0.18em] text-gold">
            ORBIT RECLAIM
          </div>
          <h1 className="mb-6 text-5xl font-normal leading-[1.05] lg:text-6xl">
            The intelligence layer
            <br />
            for orbital debris.
          </h1>
          <p className="mb-10 max-w-xl text-lg leading-relaxed text-muted">
            Score every catalogued object on collision risk, regulatory urgency,
            and salvage value — in USD. Built for satellite operators, insurers,
            removal providers, and space agencies.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/globe"
              className="bg-gold px-6 py-3 font-mono text-sm uppercase tracking-wider text-bg transition-colors duration-200 hover:bg-goldDim"
            >
              Open globe
            </Link>
            <Link
              href="/catalog"
              className="border border-border px-6 py-3 font-mono text-sm uppercase tracking-wider text-text transition-colors duration-200 hover:border-gold"
            >
              Browse catalogue
            </Link>
            <Link
              href="/methodology"
              className="border border-border px-6 py-3 font-mono text-sm uppercase tracking-wider text-text transition-colors duration-200 hover:border-gold"
            >
              Read methodology
            </Link>
          </div>
        </div>
        <div aria-hidden="true" />
      </div>
    </section>
  );
}
