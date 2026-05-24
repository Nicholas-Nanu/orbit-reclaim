import type {
  Jurisdiction,
  MaterialClass,
  MissionStatus,
} from "@/lib/db/schema";

/**
 * Reference "now" for time-relative factors (e.g. compliance overdue years).
 * Fixed so scores are deterministic and reproducible for the demo and tests,
 * rather than drifting as the wall clock advances.
 */
export const REFERENCE_YEAR = 2026;

export type Factor = {
  name: string;
  label: string;
  weight: number; // 0-1, sums to 1 across a lens
  rawValue: number; // 0-1 normalized
  contribution: number; // weight × rawValue × 100
};

export type ScoreResult = {
  score: number; // 0-100, rounded to 1 decimal
  factors: Factor[];
};

/** Fields the scoring engine reads. `DebrisObject` is structurally assignable. */
export type ScoringInput = {
  massKg: number;
  crossSectionM2: number;
  altitudeKm: number;
  inclinationDeg: number;
  conjunctions30d: number;
  estimatedYearsToDecay: number | null;
  jurisdiction: Jurisdiction | null;
  endOfLifeYear: number | null;
  missionStatus: MissionStatus | null;
  hasPropellant: boolean;
  hasThrusters: boolean;
  intact: boolean;
  materialClass: MaterialClass | null;
  deltaVToReachKms: number | null;
  neighborsWithin50km: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Assembles a ScoreResult from raw factor inputs, computing contributions + total. */
export function buildResult(
  inputs: Array<{ name: string; label: string; weight: number; rawValue: number }>,
): ScoreResult {
  const factors: Factor[] = inputs.map((f) => ({
    ...f,
    contribution: round1(f.weight * f.rawValue * 100),
  }));
  const score = round1(
    factors.reduce((sum, f) => sum + f.weight * f.rawValue * 100, 0),
  );
  return { score, factors };
}

/** Shared mass factor — log scale, 10 t → 1.0. Used by collision risk and salvage. */
export function massFactor(massKg: number): number {
  return clamp(Math.log10(massKg + 1) / Math.log10(10000), 0, 1);
}

/** LEO population-density lookup; peaks in the 700–900 km sun-sync corridor. */
export function altitudeDensity(altitudeKm: number): {
  value: number;
  band: string;
} {
  if (altitudeKm < 300) return { value: 0.05, band: "<300 km" };
  if (altitudeKm < 500) return { value: 0.2, band: "300–500 km" };
  if (altitudeKm < 700) return { value: 0.55, band: "500–700 km" };
  if (altitudeKm < 900) return { value: 1.0, band: "700–900 km" };
  if (altitudeKm < 1200) return { value: 0.75, band: "900–1200 km" };
  if (altitudeKm < 2000) return { value: 0.4, band: "1200–2000 km" };
  if (altitudeKm < 35000) return { value: 0.1, band: "2000–35000 km" };
  if (altitudeKm <= 36000) return { value: 0.3, band: "GEO" };
  return { value: 0.1, band: ">36000 km" };
}

/** Persistence of an object at altitude (inverse of natural decay); fast decay below 600 km. */
export function altitudePersistence(altitudeKm: number): {
  value: number;
  band: string;
} {
  if (altitudeKm < 400) return { value: 0.1, band: "<400 km" };
  if (altitudeKm < 600) return { value: 0.3, band: "400–600 km" };
  if (altitudeKm < 800) return { value: 0.7, band: "600–800 km" };
  if (altitudeKm < 1000) return { value: 0.9, band: "800–1000 km" };
  return { value: 1.0, band: ">1000 km" };
}

const MATERIAL_VALUE: Record<MaterialClass, number> = {
  al_li_alloy: 0.85,
  titanium: 0.95,
  comsat_electronics: 0.9,
  eo_satellite: 0.7,
  mixed: 0.5,
  unknown: 0.3,
};

export function materialValue(materialClass: MaterialClass | null): number {
  return materialClass ? MATERIAL_VALUE[materialClass] : 0.3;
}

const JURISDICTIONAL_PRESSURE: Record<Jurisdiction, number> = {
  US: 1.0,
  ESA: 0.7,
  JP: 0.7,
  IN: 0.5,
  CN: 0.4,
  RU: 0.4,
  OTHER: 0.3,
};

export function jurisdictionalPressure(
  jurisdiction: Jurisdiction | null,
): number {
  return jurisdiction ? JURISDICTIONAL_PRESSURE[jurisdiction] : 0.3;
}
