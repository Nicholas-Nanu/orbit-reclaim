import Link from "next/link";

const LINKS = [
  { href: "/globe", label: "Globe" },
  { href: "/catalog", label: "Catalogue" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
];

export default function HomeFooter() {
  return (
    <footer className="bg-bg">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-10 py-12 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-semibold tracking-tight text-gold">ORBIT RECLAIM</div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
            The intelligence layer for orbital debris
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-muted">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-gold">
              {l.label}
            </Link>
          ))}
          <a
            href="mailto:hello@orbit-reclaim.example?subject=Orbit%20Reclaim%20—%20pitch%20deck"
            className="hover:text-gold"
          >
            Contact / pitch deck
          </a>
        </div>
      </div>
    </footer>
  );
}
