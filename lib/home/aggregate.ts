import { sql, desc, isNotNull } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { debrisObjects, type DebrisObject } from "@/lib/db/schema";
import { scoreObject, type ObjectScores } from "@/lib/scoring";
import { getSalvageBreakpoints } from "@/lib/db/salvage-breakpoints";

export type LensTop = { id: string; name: string; score: number };

export type HomeAggregate = {
  totalObjects: number;
  totalMassTonnes: number;
  overdueCount: number; // objects overdue against ≥1 regime
  totalPenaltyExposureUsd: number;
  economicallyRemovableTodayCount: number; // NSV today > 0
  totalNsvTodayUsd: number; // sum of positive NSVs only
  topByLens: { collisionRisk: LensTop; compliance: LensTop; salvage: LensTop };
  featured: { object: DebrisObject; scores: ObjectScores } | null; // top composite
};

async function topByColumn(col: PgColumn): Promise<LensTop | null> {
  const [r] = await db
    .select({ id: debrisObjects.id, name: debrisObjects.name, score: col })
    .from(debrisObjects)
    .where(isNotNull(col))
    .orderBy(desc(col))
    .limit(1);
  return r ? { id: r.id, name: r.name, score: Number(r.score) || 0 } : null;
}

const EMPTY: LensTop = { id: "", name: "—", score: 0 };

/**
 * Home-page aggregates. Reads the denormalized v2 score columns (populated at
 * import) via cheap SQL rather than scoring all ~34k rows in memory per render.
 */
export async function getHomeAggregate(): Promise<HomeAggregate> {
  const [totals] = await db
    .select({
      totalObjects: sql<number>`count(*)::int`,
      totalMassKg: sql<number>`coalesce(sum(${debrisObjects.massKg}), 0)`,
      overdueCount: sql<number>`count(*) FILTER (WHERE ${debrisObjects.yearsOverdue} > 0)::int`,
      totalPE: sql<number>`coalesce(sum(${debrisObjects.penaltyExposureUsd}), 0)`,
      removableCount: sql<number>`count(*) FILTER (WHERE ${debrisObjects.nsvTodayUsd} > 0)::int`,
      totalPosNsv: sql<number>`coalesce(sum(${debrisObjects.nsvTodayUsd}) FILTER (WHERE ${debrisObjects.nsvTodayUsd} > 0), 0)`,
    })
    .from(debrisObjects);

  const [crTop, cuTop, svTop, featuredRows] = await Promise.all([
    topByColumn(debrisObjects.collisionRisk),
    topByColumn(debrisObjects.compliance),
    topByColumn(debrisObjects.salvage),
    db
      .select()
      .from(debrisObjects)
      .where(isNotNull(debrisObjects.composite))
      .orderBy(desc(debrisObjects.composite))
      .limit(1),
  ]);

  const breakpoints = await getSalvageBreakpoints();
  const featuredRow = featuredRows[0];
  const featured = featuredRow
    ? { object: featuredRow, scores: scoreObject(featuredRow, undefined, breakpoints) }
    : null;

  return {
    totalObjects: totals.totalObjects,
    totalMassTonnes: Math.round(Number(totals.totalMassKg) / 1000),
    overdueCount: totals.overdueCount,
    totalPenaltyExposureUsd: Math.round(Number(totals.totalPE)),
    economicallyRemovableTodayCount: totals.removableCount,
    totalNsvTodayUsd: Math.round(Number(totals.totalPosNsv)),
    topByLens: {
      collisionRisk: crTop ?? EMPTY,
      compliance: cuTop ?? EMPTY,
      salvage: svTop ?? EMPTY,
    },
    featured,
  };
}
