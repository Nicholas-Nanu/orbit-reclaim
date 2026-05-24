import type { DebrisType, Jurisdiction } from "@/lib/db/schema";

export const ALTITUDE_BANDS = [
  { key: "leo-low", label: "< 500 km", min: 0, max: 500 },
  { key: "leo-mid", label: "500–800 km", min: 500, max: 800 },
  { key: "leo-high", label: "800–1200 km", min: 800, max: 1200 },
  { key: "leo-vhigh", label: "1200–2000 km", min: 1200, max: 2000 },
  { key: "meo", label: "MEO 2k–35k", min: 2000, max: 35000 },
  { key: "geo", label: "GEO > 35k", min: 35000, max: Infinity },
] as const;

export const JURISDICTIONS: Jurisdiction[] = [
  "US",
  "ESA",
  "JP",
  "CN",
  "RU",
  "IN",
  "OTHER",
];

export const TYPES: { key: DebrisType; label: string }[] = [
  { key: "rocket_body", label: "Rocket body" },
  { key: "defunct_satellite", label: "Satellite" },
  { key: "fragment", label: "Fragment" },
  { key: "mission_debris", label: "Mission debris" },
];

export const STATUSES: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "defunct", label: "Defunct" },
  { key: "active", label: "Active" },
  { key: "unknown", label: "Unknown" },
];

export type ColorLens = "composite" | "collision" | "compliance" | "salvage";

export const COLOR_LENSES: { key: ColorLens; label: string }[] = [
  { key: "composite", label: "Composite" },
  { key: "collision", label: "Collision" },
  { key: "compliance", label: "Compliance" },
  { key: "salvage", label: "Salvage" },
];

export type CatalogFilters = {
  alt: string[];
  jur: string[];
  type: string[];
  status: string;
  collisionMin: number;
  complianceMin: number;
  salvageMin: number;
  // Globe-only (ignored by the dashboard query)
  showAmbient: boolean;
  colorLens: ColorLens;
};

type RawParams = Record<string, string | string[] | undefined>;

function list(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function clampScore(value: string | string[] | undefined): number {
  const v = parseInt(Array.isArray(value) ? value[0] : (value ?? ""), 10);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

export function parseFilters(params: RawParams): CatalogFilters {
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  const lens = Array.isArray(params.lens) ? params.lens[0] : params.lens;
  const amb = Array.isArray(params.amb) ? params.amb[0] : params.amb;
  return {
    alt: list(params.alt),
    jur: list(params.jur),
    type: list(params.type),
    status: status && status !== "all" ? status : "all",
    collisionMin: clampScore(params.cMin),
    complianceMin: clampScore(params.pMin),
    salvageMin: clampScore(params.sMin),
    showAmbient: amb !== "0", // default on
    colorLens: (["composite", "collision", "compliance", "salvage"].includes(
      lens ?? "",
    )
      ? lens
      : "composite") as ColorLens,
  };
}

export function bandFor(altitudeKm: number): string | null {
  for (const b of ALTITUDE_BANDS) {
    if (altitudeKm >= b.min && altitudeKm < b.max) return b.key;
  }
  return null;
}

/** Client-side predicate for globe hero objects (the catalogue uses the DB query). */
export type FilterableObject = {
  type: string;
  jurisdiction: string | null;
  missionStatus: string | null;
  altitudeKm: number;
  collision: number;
  compliance: number;
  salvage: number;
};

export function matchesFilters(o: FilterableObject, f: CatalogFilters): boolean {
  if (f.type.length && !f.type.includes(o.type)) return false;
  if (f.jur.length && !(o.jurisdiction && f.jur.includes(o.jurisdiction)))
    return false;
  if (f.status !== "all" && (o.missionStatus ?? "unknown") !== f.status)
    return false;
  if (f.alt.length) {
    const band = bandFor(o.altitudeKm);
    if (!band || !f.alt.includes(band)) return false;
  }
  if (f.collisionMin > 0 && o.collision < f.collisionMin) return false;
  if (f.complianceMin > 0 && o.compliance < f.complianceMin) return false;
  if (f.salvageMin > 0 && o.salvage < f.salvageMin) return false;
  return true;
}

export function activeFilterCount(f: CatalogFilters): number {
  return (
    f.alt.length +
    f.jur.length +
    f.type.length +
    (f.status !== "all" ? 1 : 0) +
    (f.collisionMin > 0 ? 1 : 0) +
    (f.complianceMin > 0 ? 1 : 0) +
    (f.salvageMin > 0 ? 1 : 0)
  );
}
