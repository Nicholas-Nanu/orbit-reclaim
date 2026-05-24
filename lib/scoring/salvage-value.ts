import {
  accessibilityFactor,
  ADR_BOUNTY_USD,
  AVOIDED_CASCADE_COST_USD,
  BOUNTY_JURISDICTIONS,
  clamp,
  deriveConfidence,
  MATERIAL_PRICE_USD_PER_KG,
  missionCostUsd,
  probabilityOfCollision,
  RECOVERY_YIELD,
  round1,
  type Confidence,
  type Factor,
  type ObjectClass,
  type ScoreResult,
  type ScoringInput,
  type SubScore,
} from "./shared";

/**
 * Derives the salvage object-class for material pricing. Prefers the curated
 * materialClass when informative, falling back to type + era/jurisdiction.
 */
export function objectClass(obj: ScoringInput): ObjectClass {
  if (!obj.intact || obj.type === "fragment" || obj.type === "mission_debris") {
    return "fragment";
  }
  if (obj.type === "rocket_body") {
    if (obj.materialClass === "al_li_alloy") return "modern_rb";
    if (obj.materialClass === "titanium" || obj.materialClass === "mixed") {
      return "soviet_rb";
    }
    const soviet =
      obj.jurisdiction === "RU" && (obj.launchYear ?? 9999) < 1992;
    return soviet ? "soviet_rb" : "modern_rb";
  }
  // Satellites / payloads.
  if (obj.altitudeKm >= 35000) return "geo_comsat";
  if (obj.materialClass === "eo_satellite") return "eo_sat";
  return "comsat";
}

export type SalvageEconomics = {
  objectClass: ObjectClass;
  pricePerKg: number;
  accessibility: number;
  rmvToday: number;
  rmv2035: number;
  spRisk: number;
  spBounty: number;
  sp: number;
  mceToday: number;
  mce2035: number;
  mceTier: string;
  nsvToday: number;
  nsv2035: number;
};

/** Full USD economics for an object (METHODOLOGY §5.2). */
export function computeSalvageEconomics(obj: ScoringInput): SalvageEconomics {
  const cls = objectClass(obj);
  const price = MATERIAL_PRICE_USD_PER_KG[cls];
  const yieldToday = cls === "fragment" ? RECOVERY_YIELD.fragment : RECOVERY_YIELD.today;
  const yield2035 = cls === "fragment" ? RECOVERY_YIELD.fragment : RECOVERY_YIELD.y2035;
  const access = accessibilityFactor(obj.deltaVToReachKms);

  const rmvToday = obj.massKg * price * yieldToday * access;
  const rmv2035 = obj.massKg * price * yield2035 * access;

  // Strategic premium: cascade-prevention value + jurisdictional bounty.
  const poc = probabilityOfCollision(obj.crossSectionM2, obj.altitudeKm);
  const spRisk = poc * 100 * AVOIDED_CASCADE_COST_USD;
  const leo = obj.altitudeKm < 2000;
  const eligible =
    leo &&
    obj.missionStatus === "defunct" &&
    obj.jurisdiction !== null &&
    BOUNTY_JURISDICTIONS.includes(obj.jurisdiction);
  const spBounty = eligible ? ADR_BOUNTY_USD : 0;
  const sp = spRisk + spBounty;

  // Mission cost: tiered base × difficulty modifiers.
  const mce = missionCostUsd(obj.massKg, obj.altitudeKm);
  const nonCooperative = !(obj.hasThrusters && obj.hasPropellant);
  const mult =
    (obj.inclinationDeg > 80 ? 1.2 : 1) *
    (nonCooperative ? 1.3 : 1) *
    (!obj.intact ? 1.5 : 1);
  const mceToday = mce.today * mult;
  const mce2035 = mce.y2035 * mult;

  return {
    objectClass: cls,
    pricePerKg: price,
    accessibility: access,
    rmvToday,
    rmv2035,
    spRisk,
    spBounty,
    sp,
    mceToday,
    mce2035,
    mceTier: mce.tier,
    nsvToday: rmvToday + sp - mceToday,
    nsv2035: rmv2035 + sp - mce2035,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Percentile ranking (METHODOLOGY §5.3)
// ─────────────────────────────────────────────────────────────────────────

/** Sorted ascending NSV_today values; the catalog distribution for ranking. */
export type SalvageBreakpoints = number[];

export function buildBreakpoints(nsvTodayValues: number[]): SalvageBreakpoints {
  return [...nsvTodayValues].sort((a, b) => a - b);
}

/** Fraction (0–1) of the distribution at or below `value` (binary search). */
export function percentileRank(
  value: number,
  sorted: SalvageBreakpoints,
): number {
  if (sorted.length === 0) return 0.5;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

/**
 * Absolute fallback when no catalog distribution is available (single-object
 * recompute). Monotonic, bounded transform of NSV_today around break-even.
 */
export function absoluteSalvageScore(nsvUsd: number): number {
  const sign = Math.sign(nsvUsd);
  return clamp(50 + 12.5 * sign * Math.log10(1 + Math.abs(nsvUsd) / 1e6), 0, 100);
}

function fmtUsd(usd: number): string {
  const sign = usd < 0 ? "−" : "";
  const a = Math.abs(usd);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}k`;
  return `${sign}$${a.toFixed(0)}`;
}

/**
 * Salvage Value — Net Salvage Value (USD) ranked into a 0–100 percentile across
 * the catalog (METHODOLOGY §5). Pass `breakpoints` (the catalog NSV_today
 * distribution) for the faithful percentile score; without it, an absolute
 * fallback transform is used.
 */
export function scoreSalvageValue(
  obj: ScoringInput,
  breakpoints?: SalvageBreakpoints,
): ScoreResult {
  const e = computeSalvageEconomics(obj);
  const score = round1(
    breakpoints && breakpoints.length > 0
      ? 100 * percentileRank(e.nsvToday, breakpoints)
      : absoluteSalvageScore(e.nsvToday),
  );

  // Informational sub-scores (USD details surfaced in M2 UI). Scores here are
  // display normalizations; salvage's lens score is the NSV percentile above.
  const subScores: SubScore[] = [
    {
      name: "rmv",
      label: "Recoverable material value",
      score: clamp(absoluteSalvageScore(e.rmvToday), 0, 100),
      weight: 0,
      contribution: 0,
      detail: `${fmtUsd(e.rmvToday)} today · ${fmtUsd(e.rmv2035)} (2035) · ${e.objectClass} @ $${e.pricePerKg}/kg`,
    },
    {
      name: "sp",
      label: "Strategic premium",
      score: clamp(absoluteSalvageScore(e.sp), 0, 100),
      weight: 0,
      contribution: 0,
      detail: `${fmtUsd(e.sp)} (risk ${fmtUsd(e.spRisk)} + bounty ${fmtUsd(e.spBounty)})`,
    },
    {
      name: "mce",
      label: "Mission cost",
      score: clamp(100 - absoluteSalvageScore(e.mceToday), 0, 100),
      weight: 0,
      contribution: 0,
      detail: `${fmtUsd(e.mceToday)} today · ${fmtUsd(e.mce2035)} (2035) · ${e.mceTier} tier`,
    },
    {
      name: "nsv",
      label: "Net salvage value",
      score,
      weight: 1,
      contribution: score,
      detail: `${fmtUsd(e.nsvToday)} today · ${fmtUsd(e.nsv2035)} (2035)`,
    },
  ];

  // Compat factor view: one bar = the percentile score, labelled with NSV.
  const factors: Factor[] = [
    {
      name: "nsv",
      label: `Net salvage value (${fmtUsd(e.nsvToday)} today)`,
      weight: 1,
      rawValue: score / 100,
      contribution: score,
    },
  ];

  // Confidence: salvage hinges on mass + material; low if mass is missing.
  const confidence: Confidence = deriveConfidence(obj, {
    estimatedInputs: obj.materialClass == null || obj.materialClass === "unknown",
    missingCritical: obj.massKg <= 0,
  });

  return {
    score,
    confidence,
    subScores,
    factors,
    meta: {
      nsvTodayUsd: Math.round(e.nsvToday),
      nsv2035Usd: Math.round(e.nsv2035),
      rmvTodayUsd: Math.round(e.rmvToday),
      strategicPremiumUsd: Math.round(e.sp),
      missionCostUsd: Math.round(e.mceToday),
      objectClass: e.objectClass,
    },
  };
}
