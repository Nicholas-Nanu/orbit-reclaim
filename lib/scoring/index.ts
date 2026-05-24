import { scoreCollisionRisk } from "./collision-risk";
import { scoreCompliance } from "./compliance";
import {
  buildBreakpoints,
  computeSalvageEconomics,
  scoreSalvageValue,
  type SalvageBreakpoints,
} from "./salvage-value";
import {
  round1,
  worstConfidence,
  type Confidence,
  type ScoreResult,
  type ScoringInput,
} from "./shared";

export type {
  Confidence,
  Factor,
  ScoreResult,
  ScoringInput,
  SubScore,
} from "./shared";
export { MODEL_VERSION } from "./shared";
export { scoreCollisionRisk } from "./collision-risk";
export { scoreCompliance, applicableRegimes } from "./compliance";
export {
  scoreSalvageValue,
  computeSalvageEconomics,
  buildBreakpoints,
  objectClass,
  type SalvageBreakpoints,
  type SalvageEconomics,
} from "./salvage-value";

export type CompositeWeights = {
  collisionRisk: number;
  compliance: number;
  salvage: number;
};

export const DEFAULT_WEIGHTS: CompositeWeights = {
  collisionRisk: 1 / 3,
  compliance: 1 / 3,
  salvage: 1 / 3,
};

/** Persona composite presets (METHODOLOGY §6). */
export const PERSONA_WEIGHTS: Record<string, CompositeWeights> = {
  insurer: { collisionRisk: 0.6, compliance: 0.2, salvage: 0.2 },
  removal_provider: { collisionRisk: 0.2, compliance: 0.2, salvage: 0.6 },
  agency: { collisionRisk: 0.2, compliance: 0.6, salvage: 0.2 },
  operator: { collisionRisk: 0.6, compliance: 0.25, salvage: 0.15 },
};

export type ObjectScores = {
  collisionRisk: ScoreResult;
  compliance: ScoreResult;
  salvage: ScoreResult;
  composite: number; // 0-100, weighted average of the three lens scores
  confidence: Confidence; // worst of the three lens confidences
};

/**
 * Scores one object across all three lenses plus a configurable composite.
 * Pass `breakpoints` (the catalog NSV_today distribution) for a faithful
 * salvage percentile; without it salvage uses its absolute fallback transform.
 */
export function scoreObject(
  obj: ScoringInput,
  weights: CompositeWeights = DEFAULT_WEIGHTS,
  breakpoints?: SalvageBreakpoints,
): ObjectScores {
  const collisionRisk = scoreCollisionRisk(obj);
  const compliance = scoreCompliance(obj);
  const salvage = scoreSalvageValue(obj, breakpoints);

  const total = weights.collisionRisk + weights.compliance + weights.salvage;
  const composite =
    total === 0
      ? 0
      : round1(
          (collisionRisk.score * weights.collisionRisk +
            compliance.score * weights.compliance +
            salvage.score * weights.salvage) /
            total,
        );

  return {
    collisionRisk,
    compliance,
    salvage,
    composite,
    confidence: worstConfidence([
      collisionRisk.confidence,
      compliance.confidence,
      salvage.confidence,
    ]),
  };
}

/**
 * Scores and ranks a list of objects by composite, highest first. Builds the
 * salvage percentile distribution from the full list first, so each object's
 * salvage score is its rank across the whole batch (METHODOLOGY §5.3).
 */
export function rankObjects<T extends ScoringInput>(
  objects: T[],
  weights: CompositeWeights = DEFAULT_WEIGHTS,
): Array<{ object: T; scores: ObjectScores }> {
  const breakpoints = buildBreakpoints(
    objects.map((o) => computeSalvageEconomics(o).nsvToday),
  );
  return objects
    .map((object) => ({ object, scores: scoreObject(object, weights, breakpoints) }))
    .sort((a, b) => b.scores.composite - a.scores.composite);
}
