"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV = [
  { href: "/", label: "Home", glyph: "⌂" },
  { href: "/catalog", label: "Catalog", glyph: "▦" },
  { href: "/globe", label: "Globe", glyph: "◉" },
  { href: "/compare", label: "Compare", glyph: "⇄" },
  { href: "/methodology", label: "Methodology", glyph: "§" },
  { href: "/about", label: "About", glyph: "◇" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Carry the current filter query string across views so filters persist.
  const qs = searchParams.toString();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-bg p-4">
      <p className="mb-3 px-2 font-mono text-[10px] uppercase tracking-widest text-muted">
        Navigation
      </p>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={qs ? `${item.href}?${qs}` : item.href}
              className={`flex items-center gap-3 rounded-sm border-l-2 px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                active
                  ? "border-gold bg-surface text-gold"
                  : "border-transparent text-muted hover:bg-surface hover:text-text"
              }`}
            >
              <span aria-hidden="true" className="text-sm leading-none">
                {item.glyph}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
