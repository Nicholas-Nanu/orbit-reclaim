import {
  altitudePersistence,
  buildResult,
  clamp,
  jurisdictionalPressure,
  REFERENCE_YEAR,
  type ScoreResult,
  type ScoringInput,
} from "./shared";

function overdueFactor(obj: ScoringInput): number {
  if (obj.endOfLifeYear === null) return 0; // active / no disposal deadline yet
  // FCC 5-year rule for US objects retired post-2022; otherwise IADC 25-year rule.
  const usFiveYear = obj.jurisdiction === "US" && obj.endOfLifeYear > 2022;
  const deadline = obj.endOfLifeYear + (usFiveYear ? 5 : 25);
  return clamp(REFERENCE_YEAR - deadline, 0, 10) / 10;
}

function deorbitFeasibility(obj: ScoringInput): number {
  if (obj.hasThrusters && obj.hasPropellant) return 1.0;
  if (obj.hasThrusters) return 0.4;
  return 0.0;
}

function missionStatusFactor(obj: ScoringInput): number {
  if (obj.missionStatus === "defunct") return 1.0;
  if (obj.missionStatus === "active") return 0.0;
  return 0.5; // unknown / null
}

/** Compliance Urgency — regulatory pressure to deorbit or remediate (CLAUDE.md §5.2). */
export function scoreCompliance(obj: ScoringInput): ScoreResult {
  const persistence = altitudePersistence(obj.altitudeKm);

  return buildResult([
    {
      name: "overdueFactor",
      label: "Years past deorbit deadline",
      weight: 0.4,
      rawValue: overdueFactor(obj),
    },
    {
      name: "jurisdictionalPressureFactor",
      label: `Jurisdictional pressure (${obj.jurisdiction ?? "unknown"})`,
      weight: 0.25,
      rawValue: jurisdictionalPressure(obj.jurisdiction),
    },
    {
      name: "altitudePersistenceFactor",
      label: `Altitude persistence (${persistence.band})`,
      weight: 0.15,
      rawValue: persistence.value,
    },
    {
      name: "missionStatusFactor",
      label: `Mission status (${obj.missionStatus ?? "unknown"})`,
      weight: 0.1,
      rawValue: missionStatusFactor(obj),
    },
    {
      name: "deorbitInfeasibilityFactor",
      label: "Cannot self-deorbit",
      weight: 0.1,
      rawValue: 1 - deorbitFeasibility(obj),
    },
  ]);
}
