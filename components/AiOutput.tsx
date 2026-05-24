"use client";

import type { ReactNode } from "react";
import Link from "next/link";

// Linkifies methodology citations — "(per §3.2.1)" or bare "§4.3.2" — to the
// /methodology page anchors (which use dot-stripped section ids, e.g. #321).
const CITATION_RE = /\(per §(\d+(?:\.\d+)*)\)|§(\d+(?:\.\d+)*)/g;

export function AiOutput({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(text)) !== null) {
    const id = m[1] ?? m[2];
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <Link
        key={key++}
        href={`/methodology#${id.replace(/\./g, "")}`}
        className="text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
      >
        {m[0]}
      </Link>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
      {parts}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-gold align-text-bottom" />
      )}
    </p>
  );
}
