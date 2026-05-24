import {
  buildLens,
  clamp,
  consequenceMJ,
  deriveConfidence,
  probabilityOfCollision,
  spatialDensityPerKm3,
  subScore,
  type ScoreResult,
  type ScoringInput,
} from "./shared";

/** Formats a small probability as "1.9e-3". */
function fmtExp(x: number): string {
  return x.toExponential(1);
}

/**
 * Collision Risk — probability-weighted consequence over the next year plus
 * Kessler-cascade contribution (METHODOLOGY §3).
 *
 *   CR = 0.50·PoC_score + 0.30·CS_score + 0.20·CRC_score
 */
export function scoreCollisionRisk(obj: ScoringInput): ScoreResult {
  // ── Probability of Collision (§3.2.1) ──
  const poc = probabilityOfCollision(obj.crossSectionM2, obj.altitudeKm);
  const pocScore = clamp(25 * Math.log10(poc * 1e7), 0, 100);
  const density = spatialDensityPerKm3(obj.altitudeKm);

  // ── Consequence Severity (§3.2.2) ──
  const csMJ = consequenceMJ(obj.massKg, obj.altitudeKm);
  const csScore = clamp(22 * Math.log10(csMJ + 1), 0, 100);

  // ── Cascade Risk Contribution (§3.2.3) ──
  const massNorm = clamp(Math.log10(obj.massKg + 1) / 4, 0, 1);
  const yearsToDecay = obj.estimatedYearsToDecay ?? 1000;
  const persistenceNorm = clamp(Math.log10(yearsToDecay + 1) / 2.5, 0, 1);
  const crossingNorm = clamp(
    Math.sin((obj.inclinationDeg * Math.PI) / 180),
    0,
    1,
  );
  const crcScore =
    100 * (0.5 * massNorm + 0.3 * persistenceNorm + 0.2 * crossingNorm);

  const subs = [
    subScore(
      "poc",
      "Probability of collision",
      pocScore,
      0.5,
      `${fmtExp(poc)} /yr · ${density.band}`,
      [
        {
          name: "spatialDensity",
          label: `Spatial density (${density.band})`,
          weight: 0.6,
          rawValue: clamp(Math.log10(density.value * 1e9 + 1) / 3, 0, 1),
          contribution: 0,
        },
      ],
    ),
    subScore(
      "cs",
      "Consequence severity",
      csScore,
      0.3,
      `${csMJ >= 1000 ? (csMJ / 1000).toFixed(1) + " GJ" : csMJ.toFixed(0) + " MJ"} kinetic`,
    ),
    subScore(
      "crc",
      "Cascade risk contribution",
      crcScore,
      0.2,
      `${Math.round((yearsToDecay > 1e4 ? 1e4 : yearsToDecay))} yr persistence · sin(i)=${crossingNorm.toFixed(2)}`,
    ),
  ];

  // Confidence: PoC + CS depend on cross-section & mass (heuristic for
  // non-curated objects); a non-positive mass/area is a missing critical input.
  const confidence = deriveConfidence(obj, {
    estimatedInputs: true,
    missingCritical: obj.massKg <= 0 || obj.crossSectionM2 <= 0,
  });

  return buildLens(subs, confidence, {
    pocAnnual: poc,
    consequenceMJ: Math.round(csMJ),
  });
}
