import {
  buildResult,
  massFactor,
  materialValue,
  type ScoreResult,
  type ScoringInput,
} from "./shared";

/** Salvage Value — economic value of the object as a recyclable asset (CLAUDE.md §5.3). */
export function scoreSalvageValue(obj: ScoringInput): ScoreResult {
  const mass = massFactor(obj.massKg);
  const material = materialValue(obj.materialClass);
  const intactness = obj.intact ? 1.0 : 0.1;
  const deltaV = obj.deltaVToReachKms ?? 5;
  const accessibility = 1 - Math.min(1, deltaV / 5);
  const coLocation = Math.min(1, obj.neighborsWithin50km / 10);

  return buildResult([
    {
      name: "massFactor",
      label: "Mass (log scale)",
      weight: 0.3,
      rawValue: mass,
    },
    {
      name: "materialValueFactor",
      label: `Material value (${obj.materialClass ?? "unknown"})`,
      weight: 0.25,
      rawValue: material,
    },
    {
      name: "intactnessFactor",
      label: obj.intact ? "Intact" : "Fragmented",
      weight: 0.2,
      rawValue: intactness,
    },
    {
      name: "accessibilityFactor",
      label: "Accessibility (Δv to reach)",
      weight: 0.15,
      rawValue: accessibility,
    },
    {
      name: "coLocationFactor",
      label: "Co-location (neighbors <50 km)",
      weight: 0.1,
      rawValue: coLocation,
    },
  ]);
}
