import { createHash } from "crypto";
import type { ScoringInput } from "./shared";

// Audit trail (METHODOLOGY §8): a deterministic hash of the canonical scoring
// inputs, so a score can be reproduced bit-for-bit at a given model version.
//
// NOTE: this module imports node:crypto — keep it server-only. Do not import it
// from `lib/scoring/index.ts` (which client components type-import); import it
// directly from server components/scripts instead.

// The exact set of fields the scoring engine consumes. Hashing a fixed list
// (rather than Object.keys) keeps the hash stable regardless of extra DB columns
// (id, name, cached scores, timestamps) on the row passed in.
const INPUT_FIELDS = [
  "type",
  "launchYear",
  "massKg",
  "crossSectionM2",
  "altitudeKm",
  "inclinationDeg",
  "eccentricity",
  "conjunctions30d",
  "estimatedYearsToDecay",
  "jurisdiction",
  "endOfLifeYear",
  "missionStatus",
  "hasPropellant",
  "hasThrusters",
  "intact",
  "materialClass",
  "deltaVToReachKms",
  "neighborsWithin50km",
] as const;

/** Deterministic canonical JSON of the scoring inputs (sorted keys, fixed float precision). */
export function canonicalize(input: ScoringInput): string {
  const obj: Record<string, unknown> = {};
  for (const k of [...INPUT_FIELDS].sort()) {
    const v = (input as Record<string, unknown>)[k];
    obj[k] = typeof v === "number" ? Number(v.toFixed(6)) : (v ?? null);
  }
  return JSON.stringify(obj);
}

/** Short (16-char) SHA-256 of the canonical inputs. */
export function hashInputs(input: ScoringInput): string {
  return createHash("sha256").update(canonicalize(input)).digest("hex").slice(0, 16);
}
