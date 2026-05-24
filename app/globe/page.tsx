import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { debrisObjects } from "@/lib/db/schema";
import { CURATED } from "@/lib/data/curated";
import GlobeView from "./GlobeView";
import type { HeroObject } from "./types";

export const dynamic = "force-dynamic";

export default async function GlobePage() {
  const ids = Object.keys(CURATED);
  const rows = await db
    .select({
      id: debrisObjects.id,
      name: debrisObjects.name,
      altitudeKm: debrisObjects.altitudeKm,
      inclinationDeg: debrisObjects.inclinationDeg,
      line1: debrisObjects.line1,
      line2: debrisObjects.line2,
      collision: debrisObjects.collisionRisk,
      compliance: debrisObjects.compliance,
      salvage: debrisObjects.salvage,
      composite: debrisObjects.composite,
    })
    .from(debrisObjects)
    .where(inArray(debrisObjects.id, ids));

  const objects: HeroObject[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    altitudeKm: r.altitudeKm,
    inclinationDeg: r.inclinationDeg,
    line1: r.line1,
    line2: r.line2,
    collision: r.collision ?? 0,
    compliance: r.compliance ?? 0,
    salvage: r.salvage ?? 0,
    composite: r.composite ?? 0,
  }));

  return <GlobeView objects={objects} />;
}
