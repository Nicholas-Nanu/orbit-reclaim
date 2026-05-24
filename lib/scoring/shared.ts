import type {
  CatalogSource,
  DebrisType,
  Jurisdiction,
  MaterialClass,
  MissionStatus,
} from "@/lib/db/schema";

/**
 * Scoring engine — implements METHODOLOGY.md v2.0 (multi-tier sub-scores,
 * USD salvage economics, regulatory-regime engine, confidence flags).
 * When the methodology and this code disagree, the methodology wins — update
 * the code, or update METHODOLOGY.md with a rationale, then re-run the tests.
 *
 * Two known typos in METHODOLOGY.md prose are corrected here (the reference
 * values in the same sections confirm the corrected form):
 *  - §3.2.2 says "CS_MJ = 0.05 × mass_kg", but the formula 0.5·m·V²·1e-6 with
 *    V=10 km/s and the cited reference values (1 kg → 50 MJ, 8.2 t → 410 GJ)
 *    give CS_MJ = 50 × mass_kg. We implement the formula.
 *  - §3.2.1's Envisat sanity-check (PoC ≈ 1.1e-3) disagrees with the §5.4
 *    worked example (3.83e-3) computed from the formula. We implement the
 *    formula, so the worked example reproduces.
 */
export const MODEL_VERSION = "2.0";

/**
 * Reference "now" for time-relative factors (e.g. regulatory overdue years).
 * Fixed so scores are deterministic and reproducible for the demo and tests,
 * rather than drifting as the wall clock advances.
 */
export const REFERENCE_YEAR = 2026;

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type Confidence = "high" | "medium" | "low";

/** Finest breakdown unit — consumed by the existing ScoreBreakdown chart/table. */
export type Factor = {
  name: string;
  label: string;
  weight: number; // 0-1, sums to 1 across a lens
  rawValue: number; // 0-1 normalized
  contribution: number; // weight × rawValue × 100
};

/** Mid-tier 0-100 component of a lens (PoC, ROI, etc.). */
export type SubScore = {
  name: string;
  label: string;
  score: number; // 0-100
  weight: number; // weight within the lens (sub-score weights sum to 1)
  contribution: number; // weight × score
  detail?: string; // human-readable physical/economic detail (e.g. "PoC 1.9e-3 /yr")
  factors?: Factor[]; // optional finer breakdown of this sub-score
};

export type ScoreResult = {
  score: number; // 0-100, rounded to 1 decimal
  confidence: Confidence;
  subScores: SubScore[];
  /**
   * Flattened compatibility view: each sub-score expressed as a Factor so the
   * existing ScoreBreakdown UI keeps working unchanged. weight = sub-score
   * weight, rawValue = score/100, contribution = weight × score. Contributions
   * sum to the lens score; weights sum to 1.
   */
  factors: Factor[];
  /** Lens-specific extras: USD figures, applicable regimes, physical units. */
  meta?: Record<string, number | string>;
};

/**
 * Fields the scoring engine reads. `DebrisObject` is structurally assignable.
 * `physicalsEstimated` is optional (only the import path knows it for certain);
 * when absent, confidence falls back to a catalogSource heuristic.
 */
export type ScoringInput = {
  type: DebrisType;
  launchYear: number | null;
  massKg: number;
  crossSectionM2: number;
  altitudeKm: number;
  inclinationDeg: number;
  eccentricity: number;
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
  catalogSource?: CatalogSource | string | null;
  physicalsEstimated?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Assembles a ScoreResult from sub-scores, deriving the flat-factor compat view. */
export function buildLens(
  subScores: SubScore[],
  confidence: Confidence,
  meta?: Record<string, number | string>,
): ScoreResult {
  const score = round1(subScores.reduce((s, ss) => s + ss.contribution, 0));
  const factors: Factor[] = subScores.map((ss) => ({
    name: ss.name,
    label: ss.label,
    weight: ss.weight,
    rawValue: round1(ss.score) / 100,
    contribution: round1(ss.contribution),
  }));
  return { score, confidence, subScores, factors, meta };
}

/** Builds one sub-score, computing its contribution (weight × score). */
export function subScore(
  name: string,
  label: string,
  score: number,
  weight: number,
  detail?: string,
  factors?: Factor[],
): SubScore {
  const s = clamp(score, 0, 100);
  return {
    name,
    label,
    score: round1(s),
    weight,
    contribution: round1(weight * s),
    detail,
    factors,
  };
}

/** Worst (most pessimistic) of a set of confidence flags. */
export function worstConfidence(flags: Confidence[]): Confidence {
  if (flags.includes("low")) return "low";
  if (flags.includes("medium")) return "medium";
  return "high";
}

// ─────────────────────────────────────────────────────────────────────────
// Physical constants (METHODOLOGY §3)
// ─────────────────────────────────────────────────────────────────────────

export const SECONDS_PER_YEAR = 3.156e7; // T

/** Mean relative conjunction velocity (m/s): 10 km/s LEO, 1.5 km/s GEO co-orbital. */
export function relativeVelocityMs(altitudeKm: number): number {
  return altitudeKm >= 35000 ? 1.5e3 : 1.0e4;
}

/**
 * Local spatial density in objects/km³ (ESA MASTER-8, ref pop. 08/2024).
 * Peaks in the 700–900 km sun-sync corridor. (METHODOLOGY §3.2.1)
 */
export function spatialDensityPerKm3(altitudeKm: number): {
  value: number;
  band: string;
} {
  if (altitudeKm < 300) return { value: 2.0e-9, band: "<300 km" };
  if (altitudeKm < 500) return { value: 1.5e-8, band: "300–500 km" };
  if (altitudeKm < 700) return { value: 4.0e-8, band: "500–700 km" };
  if (altitudeKm < 900) return { value: 1.4e-7, band: "700–900 km" };
  if (altitudeKm < 1200) return { value: 9.0e-8, band: "900–1200 km" };
  if (altitudeKm < 2000) return { value: 3.0e-8, band: "1200–2000 km" };
  if (altitudeKm < 35000) return { value: 2.0e-10, band: "MEO" };
  if (altitudeKm <= 36500) return { value: 5.0e-9, band: "GEO" };
  return { value: 2.0e-10, band: ">36500 km" };
}

/**
 * Combined collision cross-section (m²): this object plus a representative
 * 0.5 m-radius "average other object". (METHODOLOGY §3.2.1)
 */
export function combinedCrossSectionM2(crossSectionM2: number): number {
  const r = Math.sqrt(Math.max(crossSectionM2, 0) / Math.PI) + 0.5;
  return Math.PI * r * r;
}

/** Annual probability of catastrophic collision (METHODOLOGY §3.2.1). */
export function probabilityOfCollision(
  crossSectionM2: number,
  altitudeKm: number,
): number {
  const sigma = combinedCrossSectionM2(crossSectionM2); // m²
  const rhoPerM3 = spatialDensityPerKm3(altitudeKm).value * 1e-9; // /km³ → /m³
  const v = relativeVelocityMs(altitudeKm); // m/s
  return sigma * rhoPerM3 * v * SECONDS_PER_YEAR;
}

/** Kinetic energy at impact, in MJ (METHODOLOGY §3.2.2, corrected). */
export function consequenceMJ(massKg: number, altitudeKm: number): number {
  const v = relativeVelocityMs(altitudeKm);
  return 0.5 * massKg * v * v * 1e-6;
}

// ─────────────────────────────────────────────────────────────────────────
// Legacy LEO-density lookup (still used by catalog-map for cheap conjunction /
// neighbor heuristics). Retained for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────
// Compliance constants (METHODOLOGY §4)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Enforcement Likelihood by jurisdiction, 0–100 (METHODOLOGY §4.3.2).
 * (Methodology also lists UK=80, but UK is not a Jurisdiction in our data model,
 * so it never appears in the catalog.)
 */
const ENFORCEMENT_LIKELIHOOD: Record<Jurisdiction, number> = {
  US: 90,
  ESA: 60,
  JP: 60,
  IN: 40,
  CN: 25,
  RU: 20,
  OTHER: 30,
};

export function enforcementLikelihood(j: Jurisdiction | null): number {
  if (!j) return 30;
  return ENFORCEMENT_LIKELIHOOD[j] ?? 30;
}

/** Base regulatory penalty exposure in USD by jurisdiction (METHODOLOGY §4.3.4). */
const BASE_PENALTY_USD: Partial<Record<Jurisdiction, number>> = {
  US: 150_000, // Dish settlement precedent (2023)
  ESA: 500_000, // ~€500k contractual disposal-clause breach
};

export function basePenaltyUsd(j: Jurisdiction | null): number {
  if (!j) return 0;
  return BASE_PENALTY_USD[j] ?? 0; // others: Liability Convention contingent only
}

/** Mean satellite hull + consequential, used as contingent collision liability. */
export const CONTINGENT_COLLISION_LIABILITY_USD = 250_000_000;

/** Regime windows (years from end-of-life to disposal deadline). */
export const REGIME_WINDOW = {
  FCC_5: 5,
  IADC_25: 25,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Salvage constants (METHODOLOGY §5)
// ─────────────────────────────────────────────────────────────────────────

export type ObjectClass =
  | "modern_rb"
  | "soviet_rb"
  | "comsat"
  | "eo_sat"
  | "geo_comsat"
  | "fragment";

/** Blended scrap-market material price, 2025 USD/kg (METHODOLOGY §5.2.1). */
export const MATERIAL_PRICE_USD_PER_KG: Record<ObjectClass, number> = {
  modern_rb: 5.5,
  soviet_rb: 4.2,
  comsat: 28,
  eo_sat: 15,
  geo_comsat: 45,
  fragment: 3,
};

/** Recovery yield by era; fragments are unrecoverable (METHODOLOGY §5.2.1). */
export const RECOVERY_YIELD = { today: 0.1, y2035: 0.4, fragment: 0 } as const;

/** Δv-based accessibility factor from a LEO 500 km / 28° tender (METHODOLOGY §5.2.1). */
export function accessibilityFactor(deltaVKms: number | null): number {
  const dv = deltaVKms ?? 5;
  if (dv <= 1) return 1.0;
  if (dv <= 2) return 0.85;
  if (dv <= 3) return 0.6;
  if (dv <= 4) return 0.3;
  if (dv <= 5) return 0.15;
  return 0.05;
}

/** Avoided social cost of one major debris collision, 100-yr horizon (NASA OTPS midpoint). */
export const AVOIDED_CASCADE_COST_USD = 500_000_000;

/** Conservative per-object pilot-program bounty (METHODOLOGY §5.2.2). */
export const ADR_BOUNTY_USD = 10_000_000;

/** Jurisdictions running an active ADR procurement program. */
export const BOUNTY_JURISDICTIONS: Jurisdiction[] = ["US", "ESA", "JP"];

/** Tiered mission cost estimate, today + 2035 (METHODOLOGY §5.2.3), USD. */
export function missionCostUsd(
  massKg: number,
  altitudeKm: number,
): { today: number; y2035: number; tier: string } {
  if (altitudeKm >= 35000) return { today: 200e6, y2035: 50e6, tier: "GEO" };
  if (massKg > 10000)
    return { today: 150e6, y2035: 30e6, tier: "very heavy" };
  if (massKg > 3000) return { today: 100e6, y2035: 20e6, tier: "heavy" };
  if (massKg > 500) return { today: 50e6, y2035: 10e6, tier: "standard" };
  return { today: 20e6, y2035: 4e6, tier: "light" };
}

// ─────────────────────────────────────────────────────────────────────────
// Confidence (METHODOLOGY §7)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Derives a lens confidence flag. `estimatedInputs` flags whether a critical
 * input for this lens is simulated/heuristic; `missingCritical` flags an
 * absent critical input. Falls back to a catalogSource heuristic when the
 * import path didn't supply `physicalsEstimated`.
 */
export function deriveConfidence(obj: ScoringInput, opts: {
  estimatedInputs: boolean;
  missingCritical: boolean;
}): Confidence {
  if (opts.missingCritical) return "low";
  const estimated =
    obj.physicalsEstimated ??
    (obj.catalogSource == null || obj.catalogSource === "simulated");
  if (opts.estimatedInputs && estimated) return "medium";
  return estimated ? "medium" : "high";
}

// ─────────────────────────────────────────────────────────────────────────
// Shared normalized factors (legacy helpers still referenced elsewhere)
// ─────────────────────────────────────────────────────────────────────────

/** Shared mass factor — log scale, 10 t → 1.0. */
export function massFactor(massKg: number): number {
  return clamp(Math.log10(massKg + 1) / Math.log10(10000), 0, 1);
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
