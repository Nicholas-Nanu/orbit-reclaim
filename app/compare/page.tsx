import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { debrisObjects, type DebrisObject } from "@/lib/db/schema";
import { scoreObject, type ObjectScores } from "@/lib/scoring";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ExplainPanel } from "@/components/ExplainPanel";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

function parseIds(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const seen = new Set<string>();
  for (const id of joined.split(",").map((s) => s.trim()).filter(Boolean)) {
    seen.add(id);
  }
  return Array.from(seen).slice(0, 3);
}

const ATTRS: { label: string; get: (o: DebrisObject) => string }[] = [
  { label: "NORAD", get: (o) => o.id },
  { label: "Type", get: (o) => o.type.replace(/_/g, " ") },
  { label: "Jurisdiction", get: (o) => o.jurisdiction ?? "—" },
  { label: "Status", get: (o) => o.missionStatus ?? "unknown" },
  { label: "Altitude", get: (o) => `${o.altitudeKm.toLocaleString()} km` },
  { label: "Inclination", get: (o) => `${o.inclinationDeg.toFixed(1)}°` },
  { label: "Eccentricity", get: (o) => o.eccentricity.toFixed(4) },
  {
    label: "Decay est.",
    get: (o) =>
      o.estimatedYearsToDecay !== null
        ? `${o.estimatedYearsToDecay.toLocaleString()} yr`
        : "—",
  },
  { label: "Mass", get: (o) => `${o.massKg.toLocaleString()} kg` },
  { label: "Cross-section", get: (o) => `${o.crossSectionM2.toLocaleString()} m²` },
];

const SCORE_ROWS: { label: string; get: (s: ObjectScores) => number }[] = [
  { label: "Collision Risk", get: (s) => s.collisionRisk.score },
  { label: "Compliance Urgency", get: (s) => s.compliance.score },
  { label: "Salvage Value", get: (s) => s.salvage.score },
  { label: "Composite", get: (s) => s.composite },
];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ids = parseIds(searchParams.ids);

  const rows =
    ids.length > 0
      ? await db.select().from(debrisObjects).where(inArray(debrisObjects.id, ids))
      : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const objects = ids
    .map((id) => byId.get(id))
    .filter((o): o is DebrisObject => Boolean(o));

  if (objects.length < 2) {
    return (
      <div className="px-8 py-6">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-wider text-goldDim hover:text-gold"
        >
          ← Catalogue
        </Link>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 py-20 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Scenario Comparison
          </h1>
          <p className="max-w-md text-sm text-muted">
            Select 2–3 objects from the catalogue (check the boxes and press
            “Compare selected”) to see them side by side with an AI comparative
            analysis.
          </p>
        </div>
      </div>
    );
  }

  const scored = objects.map((object) => ({
    object,
    scores: scoreObject(object),
  }));

  const bestByRow = SCORE_ROWS.map((row) => {
    const values = scored.map((s) => row.get(s.scores));
    const max = Math.max(...values);
    return values.map((v) => v === max);
  });

  return (
    <div className="px-8 py-6">
      <Link
        href="/"
        className="font-mono text-xs uppercase tracking-wider text-goldDim hover:text-gold"
      >
        ← Catalogue
      </Link>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">
        Scenario Comparison
      </h1>
      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted">
        {objects.length} objects · best per lens marked in gold
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="w-40 px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-muted">
                Attribute
              </th>
              {scored.map(({ object }) => (
                <th key={object.id} className="px-3 py-3 text-left align-bottom">
                  <span className="block font-semibold">{object.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ATTRS.map((attr) => (
              <tr key={attr.label} className="border-b border-border/50">
                <td className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                  {attr.label}
                </td>
                {scored.map(({ object }) => (
                  <td
                    key={object.id}
                    className="px-3 py-2 font-mono tabular-nums"
                  >
                    {attr.get(object)}
                  </td>
                ))}
              </tr>
            ))}
            {SCORE_ROWS.map((row, ri) => (
              <tr key={row.label} className="border-b border-border/50">
                <td className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                  {row.label}
                </td>
                {scored.map(({ object, scores }, ci) => (
                  <td key={object.id} className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <ScoreBadge
                        score={row.get(scores)}
                        emphasis={row.label === "Composite"}
                      />
                      {bestByRow[ri][ci] && (
                        <span className="font-mono text-[9px] uppercase text-gold">
                          best
                        </span>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <ExplainPanel comparisonIds={objects.map((o) => o.id)} />
      </div>
    </div>
  );
}
