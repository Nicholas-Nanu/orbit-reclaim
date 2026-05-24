import { inArray, sql, desc, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { debrisObjects, type DebrisObject } from "@/lib/db/schema";
import {
  scoreObject,
  type ObjectScores,
  type ScoreResult,
} from "@/lib/scoring";
import { getSalvageBreakpoints } from "@/lib/db/salvage-breakpoints";
import { CURATED } from "@/lib/data/curated";

export type Scored = { object: DebrisObject; scores: ObjectScores };

export type Scenario =
  | "fcc-all-leo"
  | "adr-cost-5x-drop"
  | "geo-deorbit-mandate"
  | "envisat-removed";

/** Loads objects by id and scores them against the live catalog distribution. */
export async function loadScoredObjects(ids: string[]): Promise<Scored[]> {
  const rows = await db
    .select()
    .from(debrisObjects)
    .where(inArray(debrisObjects.id, ids));
  const breakpoints = await getSalvageBreakpoints();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is DebrisObject => Boolean(r))
    .map((object) => ({ object, scores: scoreObject(object, undefined, breakpoints) }));
}

function lensJson(l: ScoreResult) {
  return {
    score: l.score,
    confidence: l.confidence,
    subScores: l.subScores.map((s) => ({
      name: s.name,
      label: s.label,
      score: s.score,
      detail: s.detail,
      citation: s.citation,
    })),
    ...(l.meta ?? {}),
  };
}

/** Compact, model-friendly JSON of an object + its full score breakdown. */
export function serializeScored({ object, scores }: Scored) {
  return {
    id: object.id,
    name: object.name,
    type: object.type,
    jurisdiction: object.jurisdiction,
    missionStatus: object.missionStatus,
    launchYear: object.launchYear,
    endOfLifeYear: object.endOfLifeYear,
    altitudeKm: object.altitudeKm,
    inclinationDeg: object.inclinationDeg,
    eccentricity: object.eccentricity,
    massKg: object.massKg,
    crossSectionM2: object.crossSectionM2,
    intact: object.intact,
    materialClass: object.materialClass,
    hasThrusters: object.hasThrusters,
    hasPropellant: object.hasPropellant,
    composite: scores.composite,
    confidence: scores.confidence,
    collisionRisk: lensJson(scores.collisionRisk),
    compliance: lensJson(scores.compliance),
    salvage: lensJson(scores.salvage),
  };
}

/**
 * Returns a counterfactual copy of an object reflecting a scenario. Some
 * scenarios change inputs (re-scored); others are narrative-only (the prompt
 * explains the effect, e.g. the 2035 cost tier is already surfaced in salvage).
 */
export function applyScenario(scenario: Scenario, obj: DebrisObject): DebrisObject {
  switch (scenario) {
    case "fcc-all-leo":
      // FCC 5-yr rule extended to every LEO object regardless of jurisdiction.
      return obj.altitudeKm < 2000 && (obj.launchYear ?? 0) < 2024
        ? { ...obj, jurisdiction: "US", launchYear: 2024 }
        : obj;
    case "adr-cost-5x-drop":
    case "geo-deorbit-mandate":
    case "envisat-removed":
      return obj; // narrative-only for v1
  }
}

const SCENARIO_LABEL: Record<Scenario, string> = {
  "fcc-all-leo": "FCC 5-year disposal rule extended to all LEO objects",
  "adr-cost-5x-drop": "Active-debris-removal mission cost drops ~5× (2035 tier)",
  "geo-deorbit-mandate": "A 25-year graveyard-deorbit mandate is imposed on GEO",
  "envisat-removed": "Envisat is removed from orbit",
};

/**
 * Runs a scenario across the curated hero set: scores each object before and
 * after, returns per-object deltas + aggregate shift for the model to narrate.
 */
export async function runScenario(scenario: Scenario) {
  const ids = Object.keys(CURATED);
  const before = await loadScoredObjects(ids);
  const breakpoints = await getSalvageBreakpoints();
  const after = before.map(({ object }) => {
    const modified = applyScenario(scenario, object);
    return { object: modified, scores: scoreObject(modified, undefined, breakpoints) };
  });

  const rows = before.map((b, i) => ({
    id: b.object.id,
    name: b.object.name,
    jurisdiction: b.object.jurisdiction,
    before: {
      collision: b.scores.collisionRisk.score,
      compliance: b.scores.compliance.score,
      salvage: b.scores.salvage.score,
      composite: b.scores.composite,
      nsvTodayUsd: b.scores.salvage.meta?.nsvTodayUsd,
    },
    after: {
      collision: after[i].scores.collisionRisk.score,
      compliance: after[i].scores.compliance.score,
      salvage: after[i].scores.salvage.score,
      composite: after[i].scores.composite,
      nsvTodayUsd: after[i].scores.salvage.meta?.nsvTodayUsd,
    },
  }));

  const avg = (key: "collision" | "compliance" | "salvage" | "composite", which: "before" | "after") =>
    rows.reduce((s, r) => s + r[which][key], 0) / Math.max(1, rows.length);

  return {
    scenario,
    label: SCENARIO_LABEL[scenario],
    objectCount: rows.length,
    averages: {
      before: {
        collision: avg("collision", "before"),
        compliance: avg("compliance", "before"),
        salvage: avg("salvage", "before"),
        composite: avg("composite", "before"),
      },
      after: {
        collision: avg("collision", "after"),
        compliance: avg("compliance", "after"),
        salvage: avg("salvage", "after"),
        composite: avg("composite", "after"),
      },
    },
    objects: rows,
  };
}

/** Aggregate catalog statistics for catalog-analysis mode (DB-side). */
export async function loadCatalogSummary() {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(debrisObjects);

  const byJurisdiction = await db
    .select({
      jurisdiction: debrisObjects.jurisdiction,
      count: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) FILTER (WHERE ${debrisObjects.yearsOverdue} > 0)::int`,
      avgCompliance: sql<number>`round(avg(${debrisObjects.compliance})::numeric, 1)`,
      avgCollision: sql<number>`round(avg(${debrisObjects.collisionRisk})::numeric, 1)`,
    })
    .from(debrisObjects)
    .groupBy(debrisObjects.jurisdiction);

  const byType = await db
    .select({
      type: debrisObjects.type,
      count: sql<number>`count(*)::int`,
    })
    .from(debrisObjects)
    .groupBy(debrisObjects.type);

  const topComposite = await db
    .select({
      id: debrisObjects.id,
      name: debrisObjects.name,
      composite: debrisObjects.composite,
    })
    .from(debrisObjects)
    .orderBy(desc(debrisObjects.composite))
    .limit(10);

  const topNsv = await db
    .select({
      id: debrisObjects.id,
      name: debrisObjects.name,
      nsvTodayUsd: debrisObjects.nsvTodayUsd,
    })
    .from(debrisObjects)
    .where(isNotNull(debrisObjects.nsvTodayUsd))
    .orderBy(desc(debrisObjects.nsvTodayUsd))
    .limit(10);

  const [{ positiveNsv }] = await db
    .select({
      positiveNsv: sql<number>`count(*) FILTER (WHERE ${debrisObjects.nsvTodayUsd} > 0)::int`,
    })
    .from(debrisObjects);

  const [{ overdueTotal }] = await db
    .select({
      overdueTotal: sql<number>`count(*) FILTER (WHERE ${debrisObjects.yearsOverdue} > 0)::int`,
    })
    .from(debrisObjects);

  return {
    total,
    overdueTotal,
    positiveNsvTodayCount: positiveNsv,
    byJurisdiction,
    byType,
    topByComposite: topComposite,
    topByNsvToday: topNsv,
  };
}
