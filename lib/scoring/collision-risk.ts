import {
  altitudeDensity,
  buildResult,
  clamp,
  massFactor,
  type ScoreResult,
  type ScoringInput,
} from "./shared";

/** Collision Risk — likelihood and consequence of conjunction events (CLAUDE.md §5.1). */
export function scoreCollisionRisk(obj: ScoringInput): ScoreResult {
  const mass = massFactor(obj.massKg);
  const size = Math.min(1, obj.crossSectionM2 / 20);
  const density = altitudeDensity(obj.altitudeKm);
  const inclinationCrossing = Math.sin((obj.inclinationDeg * Math.PI) / 180);
  const conjunction = Math.min(1, obj.conjunctions30d / 20);
  const yearsToDecay = obj.estimatedYearsToDecay ?? 1000;
  const persistence = 1 / (1 + yearsToDecay / 10);

  return buildResult([
    {
      name: "massFactor",
      label: "Mass (log scale)",
      weight: 0.25,
      rawValue: mass,
    },
    {
      name: "sizeFactor",
      label: "Cross-section",
      weight: 0.15,
      rawValue: size,
    },
    {
      name: "altitudeDensityFactor",
      label: `Altitude density (${density.band})`,
      weight: 0.3,
      rawValue: density.value,
    },
    {
      name: "inclinationCrossingFactor",
      label: "Inclination plane crossing",
      weight: 0.1,
      rawValue: clamp(inclinationCrossing, 0, 1),
    },
    {
      name: "conjunctionFactor",
      label: "Conjunctions (30d)",
      weight: 0.15,
      rawValue: conjunction,
    },
    {
      name: "persistenceFactor",
      label: "Orbital persistence",
      weight: 0.05,
      rawValue: persistence,
    },
  ]);
}
