import { describe, it, expect } from "vitest";
import {
  scoreCollisionRisk,
  scoreCompliance,
  scoreSalvageValue,
  scoreObject,
  computeSalvageEconomics,
  buildBreakpoints,
  type ScoringInput,
} from "@/lib/scoring";
import { percentileRank } from "@/lib/scoring/salvage-value";
import { probabilityOfCollision } from "@/lib/scoring/shared";

// ── Reference objects from METHODOLOGY §5.4 (worked examples) ──

const sl16: ScoringInput = {
  type: "rocket_body",
  launchYear: 1985,
  massKg: 8900,
  crossSectionM2: 32,
  altitudeKm: 847,
  inclinationDeg: 71,
  eccentricity: 0.001,
  conjunctions30d: 14,
  estimatedYearsToDecay: 180,
  jurisdiction: "RU",
  endOfLifeYear: 1985,
  missionStatus: "defunct",
  hasPropellant: false,
  hasThrusters: false,
  intact: true,
  materialClass: "al_li_alloy", // → modern_rb, $5.50/kg per worked example
  deltaVToReachKms: 0.9,
  neighborsWithin50km: 12,
  physicalsEstimated: false,
};

const envisat: ScoringInput = {
  type: "defunct_satellite",
  launchYear: 2002,
  massKg: 8211,
  crossSectionM2: 71,
  altitudeKm: 768,
  inclinationDeg: 98.4,
  eccentricity: 0.001,
  conjunctions30d: 18,
  estimatedYearsToDecay: 120,
  jurisdiction: "ESA",
  endOfLifeYear: 2012,
  missionStatus: "defunct",
  hasPropellant: false,
  hasThrusters: false,
  intact: true,
  materialClass: "eo_satellite", // → eo_sat, $15/kg
  deltaVToReachKms: 1.1,
  neighborsWithin50km: 20,
  physicalsEstimated: false,
};

const fengyunFragment: ScoringInput = {
  type: "fragment",
  launchYear: 1999,
  massKg: 0.4,
  crossSectionM2: 0.05,
  altitudeKm: 851,
  inclinationDeg: 98.7,
  eccentricity: 0.002,
  conjunctions30d: 6,
  estimatedYearsToDecay: 95,
  jurisdiction: "CN",
  endOfLifeYear: 2007,
  missionStatus: "defunct",
  hasPropellant: false,
  hasThrusters: false,
  intact: false,
  materialClass: "unknown",
  deltaVToReachKms: 1.2,
  neighborsWithin50km: 28,
  physicalsEstimated: false,
};

const MILLION = 1e6;

describe("Collision Risk — probability of collision (METHODOLOGY §3.2.1)", () => {
  it("SL-16 PoC ≈ 1.9e-3 /yr", () => {
    expect(probabilityOfCollision(32, 847)).toBeCloseTo(1.89e-3, 4);
  });
  it("Envisat PoC ≈ 3.8e-3 /yr (formula, not the §3.2.1 sanity-check)", () => {
    expect(probabilityOfCollision(71, 768)).toBeCloseTo(3.83e-3, 4);
  });
  it("Fengyun fragment PoC ≈ 5.4e-5 /yr", () => {
    expect(probabilityOfCollision(0.05, 851)).toBeCloseTo(5.44e-5, 5);
  });

  it("massive intact objects saturate CR; fragment is mid", () => {
    expect(scoreCollisionRisk(sl16).score).toBeGreaterThanOrEqual(95);
    expect(scoreCollisionRisk(envisat).score).toBeGreaterThanOrEqual(95);
    const f = scoreCollisionRisk(fengyunFragment).score;
    expect(f).toBeGreaterThanOrEqual(40);
    expect(f).toBeLessThanOrEqual(65);
  });
});

describe("Compliance Urgency — regime engine (METHODOLOGY §4)", () => {
  it("SL-16 is 16 yr overdue under IADC → ROI saturates, CU high", () => {
    const r = scoreCompliance(sl16);
    expect(r.meta?.yearsOverdue).toBe(16);
    expect(r.subScores.find((s) => s.name === "roi")?.score).toBe(100);
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it("Envisat (died 2012) is not yet overdue under the IADC 25-yr window", () => {
    const r = scoreCompliance(envisat);
    expect(r.meta?.yearsOverdue).toBe(0);
    expect(r.subScores.find((s) => s.name === "roi")?.score).toBe(0);
  });

  it("PE is surfaced in USD and reflects jurisdiction base + contingent", () => {
    // RU: base $0 + PoC·$250M ≈ $0.47M
    expect(scoreCompliance(sl16).meta?.penaltyExposureUsd as number).toBeGreaterThan(
      300_000,
    );
    // ESA: base $0.5M + contingent → > $1M
    expect(
      scoreCompliance(envisat).meta?.penaltyExposureUsd as number,
    ).toBeGreaterThan(1_000_000);
  });
});

describe("Salvage Value — USD economics (METHODOLOGY §5.4 worked examples)", () => {
  it("SL-16: NSV negative today, strongly positive by 2035", () => {
    const e = computeSalvageEconomics(sl16);
    expect(e.rmvToday).toBeCloseTo(4895, 0);
    expect(e.spRisk / MILLION).toBeCloseTo(94.5, 0);
    expect(e.mceToday / MILLION).toBeCloseTo(130, 0);
    expect(e.nsvToday / MILLION).toBeCloseTo(-35.5, 0);
    expect(e.nsv2035 / MILLION).toBeCloseTo(68.5, 0);
  });

  it("Envisat: economically removable today (+$45M)", () => {
    const e = computeSalvageEconomics(envisat);
    expect(e.rmvToday).toBeCloseTo(10469, -1);
    expect(e.sp / MILLION).toBeCloseTo(201.5, 0);
    expect(e.mceToday / MILLION).toBeCloseTo(156, 0);
    expect(e.nsvToday / MILLION).toBeCloseTo(45.5, 0);
    expect(e.nsv2035 / MILLION).toBeCloseTo(170.3, 0);
  });

  it("Fengyun fragment: uneconomic at every horizon, zero RMV", () => {
    const e = computeSalvageEconomics(fengyunFragment);
    expect(e.rmvToday).toBe(0);
    expect(e.nsvToday / MILLION).toBeCloseTo(-44.1, 0);
    expect(e.nsv2035 / MILLION).toBeCloseTo(-6.6, 0);
  });
});

describe("Salvage percentile ranking (METHODOLOGY §5.3)", () => {
  const all = [sl16, envisat, fengyunFragment];
  const breakpoints = buildBreakpoints(
    all.map((o) => computeSalvageEconomics(o).nsvToday),
  );

  it("ranks Envisat > SL-16 > Fengyun by NSV", () => {
    const env = scoreSalvageValue(envisat, breakpoints).score;
    const sl = scoreSalvageValue(sl16, breakpoints).score;
    const fy = scoreSalvageValue(fengyunFragment, breakpoints).score;
    expect(env).toBeGreaterThan(sl);
    expect(sl).toBeGreaterThan(fy);
  });

  it("percentileRank is monotonic and bounded 0–1", () => {
    expect(percentileRank(-1e9, breakpoints)).toBe(0);
    expect(percentileRank(1e12, breakpoints)).toBe(1);
  });
});

describe("structural invariants", () => {
  const all = [sl16, envisat, fengyunFragment];
  const lenses = [scoreCollisionRisk, scoreCompliance, scoreSalvageValue];

  it("sub-score weights sum to 1 for every lens", () => {
    for (const obj of all) {
      for (const lens of lenses) {
        const total = lens(obj).subScores.reduce((s, ss) => s + ss.weight, 0);
        expect(total).toBeCloseTo(1, 10);
      }
    }
  });

  it("factor contributions sum to the lens score", () => {
    for (const obj of all) {
      for (const lens of lenses) {
        const r = lens(obj);
        const sum = r.factors.reduce((s, f) => s + f.contribution, 0);
        expect(sum).toBeCloseTo(r.score, 1);
      }
    }
  });

  it("scores are bounded 0–100", () => {
    for (const obj of all) {
      for (const lens of lenses) {
        const score = lens(obj).score;
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("every lens carries a confidence flag", () => {
    for (const obj of all) {
      for (const lens of lenses) {
        expect(["high", "medium", "low"]).toContain(lens(obj).confidence);
      }
    }
  });

  it("composite equals the equal-weighted mean of the three lenses", () => {
    const breakpoints = buildBreakpoints(
      all.map((o) => computeSalvageEconomics(o).nsvToday),
    );
    for (const obj of all) {
      const s = scoreObject(obj, undefined, breakpoints);
      const mean =
        (s.collisionRisk.score + s.compliance.score + s.salvage.score) / 3;
      expect(s.composite).toBeCloseTo(mean, 1);
    }
  });
});
