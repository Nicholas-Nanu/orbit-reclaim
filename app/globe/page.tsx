import { Suspense } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { debrisObjects } from "@/lib/db/schema";
import { CURATED } from "@/lib/data/curated";
import GlobeView from "./GlobeView";
import type { HeroObject } from "./types";

// The globe's hero set is param-independent: all filtering happens client-side
// in GlobeView (matchesFilters). Rendering this page dynamically meant every
// filter navigation re-ran the DB query, and under rapid filter changes those
// repeated serverless queries exhausted the Supabase pool and crashed the RSC
// render. ISR caches the param-independent payload so filter navigations are
// pure client-side (zero DB hits); the catalog only changes nightly anyway.
export const revalidate = 3600;

async function loadHeroes() {
  const ids = Object.keys(CURATED);
  const rows = await db
    .select({
      id: debrisObjects.id,
      name: debrisObjects.name,
      type: debrisObjects.type,
      jurisdiction: debrisObjects.jurisdiction,
      missionStatus: debrisObjects.missionStatus,
      altitudeKm: debrisObjects.altitudeKm,
      inclinationDeg: debrisObjects.inclinationDeg,
      line1: debrisObjects.line1,
      line2: debrisObjects.line2,
      collision: debrisObjects.collisionRisk,
      compliance: debrisObjects.compliance,
      salvage: debrisObjects.salvage,
      composite: debrisObjects.composite,
      confidence: debrisObjects.confidence,
    })
    .from(debrisObjects)
    .where(inArray(debrisObjects.id, ids));

  return rows.map<HeroObject>((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    jurisdiction: r.jurisdiction,
    missionStatus: r.missionStatus,
    altitudeKm: r.altitudeKm,
    inclinationDeg: r.inclinationDeg,
    line1: r.line1,
    line2: r.line2,
    collision: r.collision ?? 0,
    compliance: r.compliance ?? 0,
    salvage: r.salvage ?? 0,
    composite: r.composite ?? 0,
    confidence: r.confidence ?? null,
  }));
}

export default async function GlobePage() {
  let objects: HeroObject[] = [];
  try {
    objects = await loadHeroes();
  } catch (err) {
    // A transient DB error during (re)validation shouldn't take down the whole
    // globe — render with an empty hero set; the next revalidation recovers.
    console.error("GlobePage: failed to load heroes", err);
  }

  // GlobeView reads useSearchParams(); a Suspense boundary lets this page be
  // statically generated (CSR bailout for the param-dependent subtree).
  return (
    <Suspense fallback={<div className="h-[calc(100vh-3.5rem)] w-full bg-bg" />}>
      <GlobeView objects={objects} />
    </Suspense>
  );
}
