import { isNotNull } from "drizzle-orm";
import { db } from "./client";
import { debrisObjects } from "./schema";
import { buildBreakpoints, type SalvageBreakpoints } from "@/lib/scoring";

// The catalog NSV_today distribution drives the salvage percentile (METHODOLOGY
// §5.3). It only changes on the nightly re-import, so cache it in-memory with a
// TTL rather than re-querying ~34k rows on every detail/compare render.
let cached: { at: number; data: SalvageBreakpoints } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Sorted catalog NSV_today distribution, for ranking an object's salvage value
 * into a 0–100 percentile consistent with the cached import-time scores.
 */
export async function getSalvageBreakpoints(): Promise<SalvageBreakpoints> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  const rows = await db
    .select({ n: debrisObjects.nsvTodayUsd })
    .from(debrisObjects)
    .where(isNotNull(debrisObjects.nsvTodayUsd));
  const data = buildBreakpoints(
    rows.map((r) => r.n).filter((n): n is number => n !== null),
  );
  cached = { at: Date.now(), data };
  return data;
}
