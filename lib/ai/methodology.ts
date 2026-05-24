import methodologyMarkdown from "@/docs/METHODOLOGY.md";

// Parses docs/METHODOLOGY.md into addressable sections so the AI layer can be
// told which sections exist (the index) and have relevant section text injected
// (prompt-injection RAG — see PHASE-AI-V2 AI2-3). The markdown is bundled as a
// string via the webpack asset/source rule in next.config.mjs.

export type Section = { id: string; title: string; body: string };

let cached: Section[] | null = null;

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function loadSections(): Section[] {
  if (cached) return cached;
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const line of methodologyMarkdown.split("\n")) {
    const h = line.match(/^(#{2,4})\s+(.+)$/);
    if (h) {
      if (cur) sections.push(cur);
      const title = h[2].replace(/\*\*/g, "").trim();
      const m = title.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
      cur = { id: m ? m[1] : slug(title), title, body: "" };
    } else if (cur) {
      cur.body += line + "\n";
    }
  }
  if (cur) sections.push(cur);
  cached = sections;
  return sections;
}

/** Accepts "3.2.1" or "§3.2.1". */
export function getSection(id: string): Section | null {
  const norm = id.replace(/^§/, "").trim();
  return loadSections().find((s) => s.id === norm) ?? null;
}

/** Compact list of numbered sections for the system prompt. */
export function methodologyIndex(): string {
  return loadSections()
    .filter((s) => /^\d/.test(s.id))
    .map((s) => `- §${s.id}: ${s.title}`)
    .join("\n");
}

/** Concatenated bodies for a set of section ids (bounded RAG injection). */
export function sectionsText(ids: string[]): string {
  return ids
    .map((id) => {
      const s = getSection(id);
      return s ? `### §${s.id} ${s.title}\n${s.body.trim()}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}
