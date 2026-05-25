import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { debrisObjects, type DebrisObject } from "@/lib/db/schema";
import {
  scoreObject,
  computeSalvageEconomics,
  type ObjectScores,
  type SalvageEconomics,
} from "@/lib/scoring";
import { getSalvageBreakpoints } from "@/lib/db/salvage-breakpoints";
import { formatUsd } from "@/lib/format";
import { ScoreBadge, ConfidenceBadge } from "@/components/ScoreBadge";
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

// USD economics rows — higher is "best" for each (more recoverable / less exposed).
const USD_ROWS: {
  label: string;
  get: (e: SalvageEconomics, s: ObjectScores) => number;
}[] = [
  { label: "NSV (today)", get: (e) => e.nsvToday },
  { label: "NSV (2035)", get: (e) => e.nsv2035 },
  {
    label: "Penalty exposure",
    get: (_e, s) => (s.compliance.meta?.penaltyExposureUsd as number) ?? 0,
  },
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
          href="/catalog"
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

  const breakpoints = await getSalvageBreakpoints();
  const scored = objects.map((object) => ({
    object,
    scores: scoreObject(object, undefined, breakpoints),
    econ: computeSalvageEconomics(object),
  }));

  const bestByRow = SCORE_ROWS.map((row) => {
    const values = scored.map((s) => row.get(s.scores));
    const max = Math.max(...values);
    return values.map((v) => v === max);
  });

  const bestByUsd = USD_ROWS.map((row) => {
    const values = scored.map((s) => row.get(s.econ, s.scores));
    const max = Math.max(...values);
    return values.map((v) => v === max);
  });

  return (
    <div className="px-8 py-6">
      <Link
        href="/catalog"
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
              {scored.map(({ object, scores }) => (
                <th key={object.id} className="px-3 py-3 text-left align-bottom">
                  <span className="block font-semibold">{object.name}</span>
                  <span className="mt-1 inline-block">
                    <ConfidenceBadge confidence={scores.confidence} />
                  </span>
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
            {USD_ROWS.map((row, ri) => (
              <tr key={row.label} className="border-b border-border/50">
                <td className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                  {row.label}
                  <span className="ml-1 text-[9px] lowercase text-muted/60">usd</span>
                </td>
                {scored.map(({ object, scores, econ }, ci) => {
                  const v = row.get(econ, scores);
                  return (
                    <td
                      key={object.id}
                      className="px-3 py-2.5 font-mono tabular-nums"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={v >= 0 ? "" : "text-muted"}>
                          {formatUsd(v)}
                        </span>
                        {bestByUsd[ri][ci] && (
                          <span className="font-mono text-[9px] uppercase text-gold">
                            best
                          </span>
                        )}
                      </span>
                    </td>
                  );
                })}
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
