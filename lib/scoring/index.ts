import { scoreCollisionRisk } from "./collision-risk";
import { scoreCompliance } from "./compliance";
import { scoreSalvageValue } from "./salvage-value";
import { round1, type ScoreResult, type ScoringInput } from "./shared";

export type { Factor, ScoreResult, ScoringInput } from "./shared";
export { scoreCollisionRisk } from "./collision-risk";
export { scoreCompliance } from "./compliance";
export { scoreSalvageValue } from "./salvage-value";

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

export type ObjectScores = {
  collisionRisk: ScoreResult;
  compliance: ScoreResult;
  salvage: ScoreResult;
  composite: number; // 0-100, weighted average of the three lens scores
};

/** Scores one object across all three lenses plus a configurable composite. */
export function scoreObject(
  obj: ScoringInput,
  weights: CompositeWeights = DEFAULT_WEIGHTS,
): ObjectScores {
  const collisionRisk = scoreCollisionRisk(obj);
  const compliance = scoreCompliance(obj);
  const salvage = scoreSalvageValue(obj);

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

  return { collisionRisk, compliance, salvage, composite };
}

/** Scores and ranks a list of objects by composite, highest first. */
export function rankObjects<T extends ScoringInput>(
  objects: T[],
  weights: CompositeWeights = DEFAULT_WEIGHTS,
): Array<{ object: T; scores: ObjectScores }> {
  return objects
    .map((object) => ({ object, scores: scoreObject(object, weights) }))
    .sort((a, b) => b.scores.composite - a.scores.composite);
}
