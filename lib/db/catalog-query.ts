import { and, or, eq, gte, lt, inArray, asc, desc, sql, type SQL } from "drizzle-orm";
import { db } from "./client";
import {
  debrisObjects,
  type DebrisType,
  type Jurisdiction,
  type MissionStatus,
} from "./schema";
import { ALTITUDE_BANDS, type CatalogFilters } from "@/lib/catalog-filters";

export const PAGE_SIZE = 50;

const SORT_COLUMNS = {
  id: debrisObjects.id,
  name: debrisObjects.name,
  type: debrisObjects.type,
  altitudeKm: debrisObjects.altitudeKm,
  inclinationDeg: debrisObjects.inclinationDeg,
  collision: debrisObjects.collisionRisk,
  compliance: debrisObjects.compliance,
  salvage: debrisObjects.salvage,
  composite: debrisObjects.composite,
  nsvToday: debrisObjects.nsvTodayUsd,
  yearsOverdue: debrisObjects.yearsOverdue,
} as const;

export type SortKey = keyof typeof SORT_COLUMNS;
export type SortDir = "asc" | "desc";

export function isSortKey(v: string): v is SortKey {
  return v in SORT_COLUMNS;
}

function buildWhere(f: CatalogFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.type.length) {
    conds.push(inArray(debrisObjects.type, f.type as DebrisType[]));
  }
  if (f.jur.length) {
    conds.push(inArray(debrisObjects.jurisdiction, f.jur as Jurisdiction[]));
  }
  if (f.status !== "all") {
    conds.push(eq(debrisObjects.missionStatus, f.status as MissionStatus));
  }
  if (f.alt.length) {
    const bands = f.alt
      .map((key) => {
        const b = ALTITUDE_BANDS.find((x) => x.key === key);
        if (!b) return undefined;
        return b.max === Infinity
          ? gte(debrisObjects.altitudeKm, b.min)
          : and(
              gte(debrisObjects.altitudeKm, b.min),
              lt(debrisObjects.altitudeKm, b.max),
            );
      })
      .filter((x): x is SQL => x !== undefined);
    if (bands.length) conds.push(or(...bands) as SQL);
  }
  if (f.collisionMin > 0) {
    conds.push(gte(debrisObjects.collisionRisk, f.collisionMin));
  }
  if (f.complianceMin > 0) {
    conds.push(gte(debrisObjects.compliance, f.complianceMin));
  }
  if (f.salvageMin > 0) {
    conds.push(gte(debrisObjects.salvage, f.salvageMin));
  }
  return conds.length ? and(...conds) : undefined;
}

export type CatalogQueryResult = {
  rows: {
    id: string;
    name: string;
    type: string;
    altitudeKm: number;
    inclinationDeg: number;
    collision: number;
    compliance: number;
    salvage: number;
    composite: number;
    nsvToday: number | null;
    yearsOverdue: number | null;
  }[];
  total: number;
};

export async function queryCatalog(
  filters: CatalogFilters,
  sortKey: SortKey,
  sortDir: SortDir,
  page: number,
): Promise<CatalogQueryResult> {
  const where = buildWhere(filters);
  const col = SORT_COLUMNS[sortKey];
  const order = sortDir === "asc" ? asc(col) : desc(col);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      id: debrisObjects.id,
      name: debrisObjects.name,
      type: debrisObjects.type,
      altitudeKm: debrisObjects.altitudeKm,
      inclinationDeg: debrisObjects.inclinationDeg,
      collision: debrisObjects.collisionRisk,
      compliance: debrisObjects.compliance,
      salvage: debrisObjects.salvage,
      composite: debrisObjects.composite,
      nsvToday: debrisObjects.nsvTodayUsd,
      yearsOverdue: debrisObjects.yearsOverdue,
    })
    .from(debrisObjects)
    .where(where)
    .orderBy(order, asc(debrisObjects.id))
    .limit(PAGE_SIZE)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(debrisObjects)
    .where(where);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      altitudeKm: r.altitudeKm,
      inclinationDeg: r.inclinationDeg,
      collision: r.collision ?? 0,
      compliance: r.compliance ?? 0,
      salvage: r.salvage ?? 0,
      composite: r.composite ?? 0,
      nsvToday: r.nsvToday,
      yearsOverdue: r.yearsOverdue,
    })),
    total: count,
  };
}
