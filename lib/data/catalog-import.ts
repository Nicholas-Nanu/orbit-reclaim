import { db } from "../db/client";
import { debrisObjects, type NewDebrisObject } from "../db/schema";
import { fetchAllOnOrbit } from "./spacetrack";
import { mapToDebris } from "./catalog-map";

const CHUNK = 500;

/**
 * Full-catalog import/refresh: fetch every on-orbit object from Space-Track,
 * map + score it, and atomically replace the table (delete + insert in one
 * transaction, so readers never see an empty catalogue). Idempotent — also the
 * nightly refresh.
 */
export async function importCatalog() {
  const start = Date.now();
  const records = await fetchAllOnOrbit();
  console.log(`[import] fetched ${records.length} GP records`);

  const byId = new Map<string, NewDebrisObject>();
  let skipped = 0;
  for (const r of records) {
    const row = mapToDebris(r);
    if (row) byId.set(row.id, row);
    else skipped++;
  }
  const rows = Array.from(byId.values());
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
