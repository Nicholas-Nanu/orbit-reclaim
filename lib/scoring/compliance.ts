import {
  basePenaltyUsd,
  buildLens,
  clamp,
  CONTINGENT_COLLISION_LIABILITY_USD,
  deriveConfidence,
  enforcementLikelihood,
  probabilityOfCollision,
  REFERENCE_YEAR,
  REGIME_WINDOW,
  subScore,
  type ScoringInput,
  type ScoreResult,
} from "./shared";

const EARTH_RADIUS_KM = 6378;

/** Approximate perigee altitude from mean altitude + eccentricity. */
function perigeeKm(obj: ScoringInput): number {
  return obj.altitudeKm - obj.eccentricity * (obj.altitudeKm + EARTH_RADIUS_KM);
}

export type Regime = {
  name: string;
  windowYears: number | null; // null = no proactive deadline (e.g. Liability)
};

/**
 * Enumerates the regulatory regimes applicable to an object (METHODOLOGY §4.2).
 * The deadline-driving regimes (IADC, FCC) carry a window; others are listed
 * for transparency but don't set a proactive deadline.
 */
export function applicableRegimes(obj: ScoringInput): Regime[] {
  const regimes: Regime[] = [];
  const leo = perigeeKm(obj) < 2000;
  const complete = obj.endOfLifeYear !== null;

  // FCC 5-year rule: US-jurisdiction, post 2024-09-29, mission complete.
  if (obj.jurisdiction === "US" && (obj.launchYear ?? 0) >= 2024 && leo) {
    regimes.push({ name: "FCC 5-year", windowYears: REGIME_WINDOW.FCC_5 });
  }
  // IADC 25-year guideline: any mission-complete LEO object (applied as the
  // modern disposal norm; see METHODOLOGY §4.3.1 worked example).
  if (leo && complete) {
    regimes.push({ name: "IADC 25-year", windowYears: REGIME_WINDOW.IADC_25 });
  }
  // ISO 24113: modern operators (reliability target, not a deadline).
  if ((obj.launchYear ?? 0) >= 2019) {
    regimes.push({ name: "ISO 24113", windowYears: null });
  }
  // ESA / national mitigation policy.
  if (obj.jurisdiction === "ESA") {
    regimes.push({ name: "ESA SDM Policy", windowYears: null });
  }
  // Liability Convention always applies for ratified launching states.
  regimes.push({ name: "Liability Convention", windowYears: null });

  return regimes;
}

/** Regulatory Overdue Index — strictest applicable regime (METHODOLOGY §4.3.1). */
function regulatoryOverdue(obj: ScoringInput): {
  roi: number;
  yearsOverdue: number;
  deadlineYear: number | null;
  regimeName: string | null;
} {
  if (obj.endOfLifeYear === null) {
    return { roi: 0, yearsOverdue: 0, deadlineYear: null, regimeName: null };
  }
  const deadlineRegimes = applicableRegimes(obj).filter(
    (r) => r.windowYears !== null,
  ) as Array<Regime & { windowYears: number }>;
  if (deadlineRegimes.length === 0) {
    return { roi: 0, yearsOverdue: 0, deadlineYear: null, regimeName: null };
  }
  // Strictest = smallest window.
  const strictest = deadlineRegimes.reduce((a, b) =>
    b.windowYears < a.windowYears ? b : a,
  );
  const deadlineYear = obj.endOfLifeYear + strictest.windowYears;
  const yearsOverdue = Math.max(0, REFERENCE_YEAR - deadlineYear);
  return {
    roi: clamp(yearsOverdue * 10, 0, 100),
    yearsOverdue,
    deadlineYear,
    regimeName: strictest.name,
  };
}

/** Operator self-resolution capability ∈ [0,1] (METHODOLOGY §4.3.3). */
function operatorActive(obj: ScoringInput): number {
  if (obj.missionStatus === "active") return 1;
  if (obj.missionStatus === "defunct") return 0;
  return 0.5; // unknown / null
}

function capability(obj: ScoringInput): number {
  return (
    0.5 * (obj.hasThrusters ? 1 : 0) +
    0.3 * (obj.hasPropellant ? 1 : 0) +
    0.2 * operatorActive(obj)
  );
}

/** Penalty Exposure in USD (METHODOLOGY §4.3.4). */
export function penaltyExposureUsd(obj: ScoringInput): number {
  const poc = probabilityOfCollision(obj.crossSectionM2, obj.altitudeKm);
  return basePenaltyUsd(obj.jurisdiction) + poc * CONTINGENT_COLLISION_LIABILITY_USD;
}

function fmtUsd(usd: number): string {
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}k`;
  return `$${usd.toFixed(0)}`;
}

/**
 * Compliance Urgency — regulatory pressure weighted by enforcement realism and
 * self-resolution capability, with explicit USD penalty exposure (METHODOLOGY §4).
 *
 *   CU = 0.45·ROI + 0.25·EL + 0.15·OCG + 0.15·PE_score
 */
export function scoreCompliance(obj: ScoringInput): ScoreResult {
  const overdue = regulatoryOverdue(obj);
  const el = enforcementLikelihood(obj.jurisdiction);
  const ocg = 100 * (1 - capability(obj));
  const peUsd = penaltyExposureUsd(obj);
  const peScore = clamp(16.7 * Math.log10(peUsd + 1), 0, 100);

  const regimes = applicableRegimes(obj);

  const subs = [
    subScore(
      "roi",
      "Regulatory overdue",
      overdue.roi,
      0.45,
      overdue.deadlineYear
        ? `${overdue.yearsOverdue} yr overdue · ${overdue.regimeName} (deadline ${overdue.deadlineYear})`
        : "no disposal deadline yet",
      "§4.3.1",
    ),
    subScore(
      "el",
      "Enforcement likelihood",
      el,
      0.25,
      `${obj.jurisdiction ?? "unknown"}`,
      "§4.3.2",
    ),
    subScore(
      "ocg",
      "Operator capability gap",
      ocg,
      0.15,
      ocg >= 100 ? "cannot self-resolve" : `capability ${(100 - ocg).toFixed(0)}/100`,
      "§4.3.3",
    ),
    subScore(
      "pe",
      "Penalty exposure",
      peScore,
      0.15,
      `${fmtUsd(peUsd)} exposure`,
      "§4.3.4",
    ),
  ];

  // Confidence: weakest where mission status / EOL is unknown.
  const confidence = deriveConfidence(obj, {
    estimatedInputs: obj.missionStatus == null,
    missingCritical: false,
  });

  return buildLens(subs, confidence, {
    penaltyExposureUsd: Math.round(peUsd),
    applicableRegimes: regimes.map((r) => r.name).join(", "),
    yearsOverdue: overdue.yearsOverdue,
  });
}
