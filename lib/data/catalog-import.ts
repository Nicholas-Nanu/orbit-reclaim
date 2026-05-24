import { db } from "../db/client";
import { debrisObjects, type NewDebrisObject } from "../db/schema";
import { buildBreakpoints, computeSalvageEconomics } from "../scoring";
import { fetchAllOnOrbit } from "./spacetrack";
import { attachScores, buildRow, type MappedRow } from "./catalog-map";

const CHUNK = 500;

/**
 * Full-catalog import/refresh: fetch every on-orbit object from Space-Track,
 * map + score it, and atomically replace the table (delete + insert in one
 * transaction, so readers never see an empty catalogue). Idempotent — also the
 * nightly refresh.
 *
 * Two-pass scoring (METHODOLOGY §5.3): map all rows, build the catalog-wide
 * NSV_today distribution, then percentile-rank each object's salvage value
 * against that distribution.
 */
export async function importCatalog() {
  const start = Date.now();
  const records = await fetchAllOnOrbit();
  console.log(`[import] fetched ${records.length} GP records`);

  // Pass 1: map inputs (dedupe by NORAD id).
  const byId = new Map<string, MappedRow>();
  let skipped = 0;
  for (const r of records) {
    const row = buildRow(r);
    if (row) byId.set(row.id, row);
    else skipped++;
  }
  const inputs = Array.from(byId.values());

  // Build the salvage percentile distribution from all NSV_today values.
  const breakpoints = buildBreakpoints(
    inputs.map((row) => computeSalvageEconomics(row).nsvToday),
  );

  // Pass 2: score each row against the distribution.
  const rows: NewDebrisObject[] = inputs.map((row) => attachScores(row, breakpoints));
  console.log(`[import] mapped ${rows.length}, skipped ${skipped}`);

  await db.transaction(async (tx) => {
    await tx.delete(debrisObjects);
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(debrisObjects).values(rows.slice(i, i + CHUNK));
    }
  });

  const ms = Date.now() - start;
  console.log(`[import] replaced catalog with ${rows.length} rows in ${ms}ms`);
  return { fetched: records.length, imported: rows.length, skipped, ms };
}
