import type { ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import methodologyMarkdown from "@/docs/METHODOLOGY.md";

export const metadata = {
  title: "Scoring Methodology — Orbit Reclaim",
  description:
    "How Orbit Reclaim computes collision-risk, compliance-urgency, and salvage-value scores.",
};

/** Leading section number → compact anchor id ("3.2.1 PoC" → "321"); else a slug. */
function toId(text: string): string {
  const m = text.match(/^\s*(\d+(?:\.\d+)*)/);
  if (m) return m[1].replace(/\./g, "");
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Flatten React children to plain text (for heading ids). */
function textOf(children: ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (typeof children === "object" && "props" in children) {
    return textOf((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

/** Table of contents from the H2/H3 headings in the raw markdown. */
function buildToc(md: string) {
  const toc: { level: number; text: string; id: string }[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (!m) continue;
    const text = m[2].replace(/\*\*/g, "").trim();
    toc.push({ level: m[1].length, text, id: toId(text) });
  }
  return toc;
}

const components = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1
      id={toId(textOf(children))}
      className="scroll-mt-20 text-2xl font-semibold tracking-tight text-text"
    >
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2
      id={toId(textOf(children))}
      className="mt-10 scroll-mt-20 border-b border-border pb-2 text-xl font-semibold tracking-tight text-gold"
    >
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3
      id={toId(textOf(children))}
      className="mt-7 scroll-mt-20 text-base font-semibold text-text"
    >
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4
      id={toId(textOf(children))}
      className="mt-5 scroll-mt-20 font-mono text-xs uppercase tracking-widest text-muted"
    >
      {children}
    </h4>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mt-3 text-sm leading-relaxed text-text/90">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text/90">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-text/90">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
      className="text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mt-4 border-l-2 border-gold/40 bg-surface/60 px-4 py-2 text-sm text-muted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-border" />,
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-sm bg-surface px-1 py-0.5 font-mono text-[0.85em] text-gold">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="mt-3 overflow-x-auto rounded-sm border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-text/90">
      {children}
    </pre>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-border bg-surface px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-border px-2 py-1.5 align-top text-text/90">{children}</td>
  ),
};

export default function MethodologyPage() {
  const toc = buildToc(methodologyMarkdown);

  return (
    <div className="px-8 py-6">
      <Link
        href="/catalog"
        className="font-mono text-xs uppercase tracking-wider text-goldDim hover:text-gold"
      >
        ← Catalogue
      </Link>

      <div className="mt-4 flex gap-8">
        {/* Sticky table of contents */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto border-r border-border pr-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
              Contents
            </p>
            <nav className="space-y-1">
              {toc.map((h, i) => (
                <a
                  key={`${h.id}-${i}`}
                  href={`#${h.id}`}
                  className={`block font-mono text-[11px] leading-snug text-muted hover:text-gold ${
                    h.level === 3 ? "pl-3 text-[10px]" : ""
                  }`}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Rendered document */}
        <article className="min-w-0 max-w-3xl flex-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {methodologyMarkdown}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
