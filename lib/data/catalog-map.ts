import { altitudeDensity } from "@/lib/scoring/shared";
import { scoreObject } from "@/lib/scoring";
import type {
  DebrisType,
  Jurisdiction,
  MaterialClass,
  MissionStatus,
  NewDebrisObject,
} from "@/lib/db/schema";
import type { GpRecord } from "./spacetrack";
import { CURATED } from "./curated";

function jurisdictionFromCountry(code: string | null): Jurisdiction {
  if (!code) return "OTHER";
  switch (code.toUpperCase()) {
    case "US":
      return "US";
    case "CIS":
    case "SU":
    case "RU":
      return "RU";
    case "PRC":
    case "CN":
      return "CN";
    case "ESA":
      return "ESA";
    case "JPN":
    case "JP":
      return "JP";
    case "IND":
    case "IN":
      return "IN";
    default:
      return "OTHER";
  }
}

function typeFromObjectType(t: string | null): DebrisType {
  if (!t) return "fragment";
  switch (t.toUpperCase()) {
    case "ROCKET BODY":
      return "rocket_body";
    case "PAYLOAD":
      return "defunct_satellite";
    default:
      return "fragment"; // DEBRIS | UNKNOWN | TBA
  }
}

function deltaVFor(altitudeKm: number): number {
  if (altitudeKm < 600) return 0.4;
  if (altitudeKm < 1000) return 0.9;
  if (altitudeKm < 2000) return 1.4;
  if (altitudeKm < 35000) return 3.6;
  return 4.3;
}

function decayYearsFor(altitudeKm: number): number {
  if (altitudeKm < 400) return 2;
  if (altitudeKm < 600) return 15;
  if (altitudeKm < 800) return 70;
  if (altitudeKm < 1000) return 150;
  if (altitudeKm < 1500) return 500;
  if (altitudeKm < 2000) return 2000;
  return 100000;
}

type Physical = {
  type: DebrisType;
  massKg: number;
  crossSectionM2: number;
  intact: boolean;
  materialClass: MaterialClass;
  missionStatus: MissionStatus;
};

function heuristicPhysical(type: DebrisType): Physical {
  switch (type) {
    case "rocket_body":
      return { type, massKg: 1500, crossSectionM2: 12, intact: true, materialClass: "al_li_alloy", missionStatus: "defunct" };
    case "defunct_satellite":
      return { type, massKg: 500, crossSectionM2: 6, intact: true, materialClass: "comsat_electronics", missionStatus: "unknown" };
    default:
      return { type, massKg: 1, crossSectionM2: 0.1, intact: false, materialClass: "unknown", missionStatus: "defunct" };
  }
}

/** Maps a Space-Track GP record to a fully-scored debris row, or null if unusable. */
export function mapToDebris(r: GpRecord): NewDebrisObject | null {
  const apo = r.APOAPSIS ? Number(r.APOAPSIS) : NaN;
  const peri = r.PERIAPSIS ? Number(r.PERIAPSIS) : NaN;
  const inclination = r.INCLINATION ? Number(r.INCLINATION) : NaN;
  if (!Number.isFinite(apo) || !Number.isFinite(peri) || !Number.isFinite(inclination)) {
    return null;
  }
  const altitudeKm = (apo + peri) / 2;
  if (altitudeKm <= 0) return null;

  const eccentricity = r.ECCENTRICITY ? Number(r.ECCENTRICITY) : 0;
  const launchYear = r.LAUNCH_DATE ? Number(r.LAUNCH_DATE.slice(0, 4)) : null;
  const type = typeFromObjectType(r.OBJECT_TYPE);
  const density = altitudeDensity(altitudeKm).value;

  const curated = CURATED[r.NORAD_CAT_ID];
  const base = heuristicPhysical(type);

  const row = {
    id: r.NORAD_CAT_ID,
    name: r.OBJECT_NAME?.trim() || `NORAD ${r.NORAD_CAT_ID}`,
    type: curated?.type ?? base.type,
    launchYear: curated?.launchYear ?? launchYear,
    launchCountry: curated?.launchCountry ?? r.COUNTRY_CODE ?? "Unknown",
    jurisdiction: curated?.jurisdiction ?? jurisdictionFromCountry(r.COUNTRY_CODE),
    massKg: curated?.massKg ?? base.massKg,
    crossSectionM2: curated?.crossSectionM2 ?? base.crossSectionM2,
    intact: curated?.intact ?? base.intact,
    materialClass: curated?.materialClass ?? base.materialClass,
    altitudeKm: Math.round(altitudeKm * 10) / 10,
    inclinationDeg: Math.round(inclination * 100) / 100,
    eccentricity: Math.round(eccentricity * 1e6) / 1e6,
    estimatedYearsToDecay: curated?.estimatedYearsToDecay ?? decayYearsFor(altitudeKm),
    missionStatus: curated?.missionStatus ?? base.missionStatus,
    endOfLifeYear:
      curated?.endOfLifeYear ??
      (base.type === "defunct_satellite" ? null : launchYear),
    hasPropellant: curated?.hasPropellant ?? false,
    hasThrusters: curated?.hasThrusters ?? false,
    conjunctions30d: curated?.conjunctions30d ?? Math.round(density * 8),
    neighborsWithin50km: curated?.neighborsWithin50km ?? Math.round(density * 25),
    deltaVToReachKms: curated?.deltaVToReachKms ?? deltaVFor(altitudeKm),
    catalogSource: "spacetrack" as const,
    line1: r.TLE_LINE1,
    line2: r.TLE_LINE2,
  };

  const scores = scoreObject(row);
  return {
    ...row,
    collisionRisk: scores.collisionRisk.score,
    compliance: scores.compliance.score,
    salvage: scores.salvage.score,
    composite: scores.composite,
  };
}
