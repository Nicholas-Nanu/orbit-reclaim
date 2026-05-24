import { describe, it, expect } from "vitest";
import {
  scoreCollisionRisk,
  scoreCompliance,
  scoreSalvageValue,
  scoreObject,
  type ScoringInput,
} from "@/lib/scoring";

// Reference objects mirror the seed data in data/sample-debris.json (CLAUDE.md §5.5).
const sl16: ScoringInput = {
  massKg: 8900,
  crossSectionM2: 32,
  altitudeKm: 847,
  inclinationDeg: 71,
  conjunctions30d: 14,
  estimatedYearsToDecay: 180,
  jurisdiction: "RU",
  endOfLifeYear: 1985,
  missionStatus: "defunct",
  hasPropellant: false,
  hasThrusters: false,
  intact: true,
  materialClass: "al_li_alloy",
  deltaVToReachKms: 0.9,
  neighborsWithin50km: 12,
};

const fengyunFragment: ScoringInput = {
  massKg: 0.4,
  crossSectionM2: 0.05,
  altitudeKm: 851,
  inclinationDeg: 98.7,
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
};

const activeStarlink: ScoringInput = {
  massKg: 295,
  crossSectionM2: 3.7,
  altitudeKm: 551,
  inclinationDeg: 53,
  conjunctions30d: 2,
  estimatedYearsToDecay: 5,
  jurisdiction: "US",
  endOfLifeYear: null,
  missionStatus: "active",
  hasPropellant: true,
  hasThrusters: true,
  intact: true,
  materialClass: "comsat_electronics",
  deltaVToReachKms: 0.3,
  neighborsWithin50km: 41,
};

describe("SL-16 R/B at 850 km — high across all lenses", () => {
  it("collisionRisk >= 85", () => {
    expect(scoreCollisionRisk(sl16).score).toBeGreaterThanOrEqual(85);
  });
  it("compliance >= 80", () => {
    expect(scoreCompliance(sl16).score).toBeGreaterThanOrEqual(80);
  });
  it("salvage >= 90", () => {
    expect(scoreSalvageValue(sl16).score).toBeGreaterThanOrEqual(90);
  });
});

describe("Fengyun-1C fragment — mid collision, floored salvage", () => {
  it("collisionRisk in 35-55", () => {
    const score = scoreCollisionRisk(fengyunFragment).score;
    expect(score).toBeGreaterThanOrEqual(35);
    expect(score).toBeLessThanOrEqual(55);
  });
  // Fragments don't score near-zero on salvage: clustering + accessibility floor it.
  it("salvage in 25-40", () => {
    const score = scoreSalvageValue(fengyunFragment).score;
    expect(score).toBeGreaterThanOrEqual(25);
    expect(score).toBeLessThanOrEqual(40);
  });
});

describe("Active Starlink — low compliance urgency", () => {
  // US jurisdiction (1.0 × 0.25 = 25pt floor) keeps it nonzero but still <= 35.
  it("compliance <= 35", () => {
    expect(scoreCompliance(activeStarlink).score).toBeLessThanOrEqual(35);
  });
});

describe("structural invariants", () => {
  const all = [sl16, fengyunFragment, activeStarlink];
  const lenses = [scoreCollisionRisk, scoreCompliance, scoreSalvageValue];

  it("factor weights sum to 1 for every lens", () => {
    for (const obj of all) {
      for (const lens of lenses) {
        const total = lens(obj).factors.reduce((s, f) => s + f.weight, 0);
        expect(total).toBeCloseTo(1, 10);
      }
    }
  });

  it("scores are bounded 0-100", () => {
    for (const obj of all) {
      for (const lens of lenses) {
        const score = lens(obj).score;
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("composite equals the equal-weighted mean of the three lenses", () => {
    for (const obj of all) {
      const s = scoreObject(obj);
      const mean =
        (s.collisionRisk.score + s.compliance.score + s.salvage.score) / 3;
      expect(s.composite).toBeCloseTo(mean, 1);
    }
  });
});
