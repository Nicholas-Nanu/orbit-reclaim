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

export type CatalogFilters = {
  alt: string[];
  jur: string[];
  type: string[];
  status: string;
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

export function parseFilters(params: RawParams): CatalogFilters {
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  return {
    alt: list(params.alt),
    jur: list(params.jur),
    type: list(params.type),
    status: status && status !== "all" ? status : "all",
  };
}

export function activeFilterCount(f: CatalogFilters): number {
  return (
    f.alt.length +
    f.jur.length +
    f.type.length +
    (f.status !== "all" ? 1 : 0)
  );
}
