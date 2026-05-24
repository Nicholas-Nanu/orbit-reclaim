import Link from "next/link";

function OrbitGlyph() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-7 w-7"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="3" fill="#ffe11f" />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="6"
        stroke="#b89c14"
        strokeWidth="1"
        transform="rotate(-25 16 16)"
      />
      <circle cx="3.5" cy="22" r="1.6" fill="#ffffff" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      <Link href="/" className="flex items-center gap-3">
        <OrbitGlyph />
        <span className="text-lg font-semibold tracking-tight text-gold">
          ORBIT RECLAIM
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted sm:inline">
          debris decision support
        </span>
      </Link>

      <div className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-wider text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" />
          sys nominal
        </span>
        <span className="hidden md:inline">catalogue / 30 obj</span>
        <span className="hidden lg:inline">src / simulated</span>
      </div>
    </header>
  );
}
