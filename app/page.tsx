import { db } from "@/lib/db/client";
import { debrisObjects } from "@/lib/db/schema";
import { scoreObject } from "@/lib/scoring";
import { applyFilters, parseFilters } from "@/lib/catalog-filters";
import { DebrisTable, type CatalogRow } from "@/components/DebrisTable";
import { FilterPanel } from "@/components/FilterPanel";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const all = await db.select().from(debrisObjects);
  const filters = parseFilters(searchParams);
  const filtered = applyFilters(all, filters);

  const rows: CatalogRow[] = filtered.map((o) => {
    const s = scoreObject(o);
    return {
      id: o.id,
      name: o.name,
      type: o.type,
      altitudeKm: o.altitudeKm,
      inclinationDeg: o.inclinationDeg,
      collision: s.collisionRisk.score,
      compliance: s.compliance.score,
      salvage: s.salvage.score,
      composite: s.composite,
    };
  });

  return (
    <div className="flex h-full">
      <FilterPanel />
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between border-b border-border px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Catalogue</h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted">
              Collision risk · Compliance urgency · Salvage value
            </p>
          </div>
          <span className="font-mono text-xs uppercase tracking-wider text-muted">
            {rows.length} / {all.length} objects
          </span>
        </div>
        <div className="min-h-0 flex-1 px-2 py-2">
          <DebrisTable rows={rows} />
        </div>
      </section>
    </div>
  );
}
