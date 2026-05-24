import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { debrisObjects } from "@/lib/db/schema";
import { scoreObject } from "@/lib/scoring";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { ScoreBadge } from "@/components/ScoreBadge";

export const dynamic = "force-dynamic";

function Param({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="border border-border bg-surface px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs text-muted">{unit}</span>}
      </p>
    </div>
  );
}

export default async function DebrisDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [obj] = await db
    .select()
    .from(debrisObjects)
    .where(eq(debrisObjects.id, params.id));

  if (!obj) notFound();

  const scores = scoreObject(obj);

  return (
    <div className="px-8 py-6">
      <Link
        href="/"
        className="font-mono text-xs uppercase tracking-wider text-goldDim hover:text-gold"
      >
        ← Catalogue
      </Link>

      {/* Header card */}
      <div className="mt-4 flex items-start justify-between border border-border bg-surface px-6 py-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{obj.name}</h1>
            <span className="rounded-sm border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-gold">
              {obj.jurisdiction ?? "—"}
            </span>
          </div>
          <p className="mt-2 flex gap-4 font-mono text-xs uppercase tracking-wider text-muted">
            <span>NORAD {obj.id}</span>
            <span>{obj.type.replace(/_/g, " ")}</span>
            <span>{obj.missionStatus ?? "unknown"}</span>
            {obj.launchYear && <span>launched {obj.launchYear}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Composite
          </p>
          <div className="mt-1">
            <ScoreBadge score={scores.composite} emphasis />
          </div>
        </div>
      </div>

      {/* Orbital + physical params */}
      <div className="mt-4 grid grid-cols-2 gap-px md:grid-cols-3 lg:grid-cols-6">
        <Param label="Altitude" value={obj.altitudeKm.toLocaleString()} unit="km" />
        <Param label="Inclination" value={obj.inclinationDeg.toFixed(1)} unit="°" />
        <Param label="Eccentricity" value={obj.eccentricity.toFixed(4)} />
        <Param
          label="Decay est."
          value={
            obj.estimatedYearsToDecay !== null
              ? obj.estimatedYearsToDecay.toLocaleString()
              : "—"
          }
          unit={obj.estimatedYearsToDecay !== null ? "yr" : undefined}
        />
        <Param label="Mass" value={obj.massKg.toLocaleString()} unit="kg" />
        <Param
          label="Cross-section"
          value={obj.crossSectionM2.toLocaleString()}
          unit="m²"
        />
      </div>

      {/* Score breakdowns */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ScoreBreakdown title="Collision Risk" result={scores.collisionRisk} />
        <ScoreBreakdown title="Compliance Urgency" result={scores.compliance} />
        <ScoreBreakdown title="Salvage Value" result={scores.salvage} />
      </div>
    </div>
  );
}
