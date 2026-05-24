import { parseFilters } from "@/lib/catalog-filters";
import {
  queryCatalog,
  PAGE_SIZE,
  isSortKey,
  type SortKey,
  type SortDir,
} from "@/lib/db/catalog-query";
import { DebrisTable, type CatalogRow } from "@/components/DebrisTable";
import { FilterPanel } from "@/components/FilterPanel";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const filters = parseFilters(searchParams);
  const sortParam = Array.isArray(searchParams.sort)
    ? searchParams.sort[0]
    : searchParams.sort;
  const sortKey: SortKey =
    sortParam && isSortKey(sortParam) ? sortParam : "composite";
  const sortDir: SortDir = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const { rows, total } = await queryCatalog(filters, sortKey, sortDir, page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            {total.toLocaleString()} objects
          </span>
        </div>
        <div className="min-h-0 flex-1 px-2 py-2">
          <DebrisTable
            rows={rows as CatalogRow[]}
            sortKey={sortKey}
            sortDir={sortDir}
            page={page}
            totalPages={totalPages}
            total={total}
          />
        </div>
      </section>
    </div>
  );
}
