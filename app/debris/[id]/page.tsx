import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { debrisObjects } from "@/lib/db/schema";
import { scoreObject, computeSalvageEconomics, MODEL_VERSION } from "@/lib/scoring";
import { hashInputs } from "@/lib/scoring/audit";
import {
  getSalvageBreakpoints,
  getSalvageQuantiles,
} from "@/lib/db/salvage-breakpoints";
import { formatUsd } from "@/lib/format";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { ScoreBadge, ConfidenceBadge } from "@/components/ScoreBadge";
import { ExplainPanel } from "@/components/ExplainPanel";
import { WhatIfSimulator } from "@/components/WhatIfSimulator";

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

  const breakpoints = await getSalvageBreakpoints();
  const quantiles = await getSalvageQuantiles();
  const scores = scoreObject(obj, undefined, breakpoints);
  const econ = computeSalvageEconomics(obj);
  const peUsd = scores.compliance.meta?.penaltyExposureUsd as number | undefined;
  const regimes = scores.compliance.meta?.applicableRegimes as string | undefined;
  const yearsOverdue = scores.compliance.meta?.yearsOverdue as number | undefined;

  // Baseline for the what-if simulator (ScoringInput fields + identity).
  const baseline = {
    id: obj.id,
    name: obj.name,
    type: obj.type,
    launchYear: obj.launchYear,
    massKg: obj.massKg,
    crossSectionM2: obj.crossSectionM2,
    altitudeKm: obj.altitudeKm,
    inclinationDeg: obj.inclinationDeg,
    eccentricity: obj.eccentricity,
    conjunctions30d: obj.conjunctions30d,
    estimatedYearsToDecay: obj.estimatedYearsToDecay,
    jurisdiction: obj.jurisdiction,
    endOfLifeYear: obj.endOfLifeYear,
    missionStatus: obj.missionStatus,
    hasPropellant: obj.hasPropellant,
    hasThrusters: obj.hasThrusters,
    intact: obj.intact,
    materialClass: obj.materialClass,
    deltaVToReachKms: obj.deltaVToReachKms,
    neighborsWithin50km: obj.neighborsWithin50km,
    physicalsEstimated: obj.physicalsEstimated,
  };

  return (
    <div className="px-8 py-6">
      <Link
        href="/catalog"
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
          <div className="mt-1 flex items-center justify-end gap-2">
            <ConfidenceBadge confidence={scores.confidence} />
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

      {/* What-if simulator trigger */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-sm border border-border bg-surface px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Explore how this object&apos;s scores change if its inputs changed
        </p>
        <WhatIfSimulator baseline={baseline} quantiles={quantiles} />
      </div>

      {/* Score breakdowns */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ScoreBreakdown title="Collision Risk" result={scores.collisionRisk} />
        <ScoreBreakdown title="Compliance Urgency" result={scores.compliance} />
        <ScoreBreakdown title="Salvage Value" result={scores.salvage} />
      </div>

      {/* USD economics + regulatory exposure (METHODOLOGY §4–5) */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-sm border border-border bg-surface lg:col-span-2">
          <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted">
              Salvage economics — Net Salvage Value (USD)
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {econ.objectClass.replace(/_/g, " ")} · ${econ.pricePerKg}/kg ·{" "}
              {econ.mceTier} tier
            </span>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-4 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider">
                  Component
                </th>
                <th className="px-4 py-1.5 text-right font-mono text-[10px] uppercase tracking-wider">
                  Today
                </th>
                <th className="px-4 py-1.5 text-right font-mono text-[10px] uppercase tracking-wider">
                  2035
                </th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              <tr className="border-b border-border/50">
                <td className="px-4 py-2">Recoverable material value</td>
                <td className="px-4 py-2 text-right">{formatUsd(econ.rmvToday)}</td>
                <td className="px-4 py-2 text-right">{formatUsd(econ.rmv2035)}</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2">
                  Strategic premium
                  <span className="ml-2 text-[10px] text-muted">
                    risk {formatUsd(econ.spRisk)} + bounty {formatUsd(econ.spBounty)}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">{formatUsd(econ.sp)}</td>
                <td className="px-4 py-2 text-right">{formatUsd(econ.sp)}</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="px-4 py-2">Mission cost</td>
                <td className="px-4 py-2 text-right text-muted">
                  −{formatUsd(econ.mceToday)}
                </td>
                <td className="px-4 py-2 text-right text-muted">
                  −{formatUsd(econ.mce2035)}
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-2.5 font-semibold uppercase tracking-wider text-[11px]">
                  Net salvage value
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-semibold ${econ.nsvToday >= 0 ? "text-gold" : "text-muted"}`}
                >
                  {formatUsd(econ.nsvToday)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-semibold ${econ.nsv2035 >= 0 ? "text-gold" : "text-muted"}`}
                >
                  {formatUsd(econ.nsv2035)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-sm border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted">
              Regulatory exposure
            </h3>
          </div>
          <div className="space-y-3 px-4 py-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Penalty exposure
              </p>
              <p className="mt-1 font-mono text-lg tabular-nums text-gold">
                {peUsd !== undefined ? formatUsd(peUsd) : "—"}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Years overdue
              </p>
              <p className="mt-1 font-mono text-lg tabular-nums">
                {yearsOverdue ?? 0}
                <span className="ml-1 text-xs text-muted">yr</span>
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Applicable regimes
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text">
                {regimes ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* AI briefing */}
      <div className="mt-6">
        <ExplainPanel objectId={obj.id} />
      </div>

      {/* Audit footer (METHODOLOGY §8) */}
      <p className="mt-6 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-wider text-muted">
        <Link href="/methodology" className="text-goldDim hover:text-gold">
          Methodology v{MODEL_VERSION}
        </Link>
        {" · model hash "}
        <span className="text-text">{hashInputs(obj)}</span>
        {" · scores computed on demand"}
      </p>
    </div>
  );
}
